const test=require('node:test');const assert=require('node:assert/strict');
const JSZip=require('jszip');
const {parseGmailDeliverySettings}=require('../dist/repositories/gmailDeliveryRepository');
const {createPromotionPackageBuilder,buildPackageMimeMessage}=require('../dist/gmail/gmailPromotionPackage');
const {createGmailDeliveryProcessor}=require('../dist/gmail/gmailDeliveryProcessor');
const {GMAIL_READ_SCOPE,GMAIL_SEND_SCOPE,getGmailConnectionStatus}=require('../dist/gmail/gmailOAuth');
const connectionRepo=require('../dist/repositories/gmailConnectionRepository');
const row={id:'r',rowNumber:1,status:'future',productName:'Сервелат',startDate:'2026-10-14',endDate:'2026-10-20',promoPrice:80,regularPrice:120,priceDifference:40,realDiscountPercent:33.33,advertisingDiscountPercent:40};
const manifest={products:['Сервелат'],priceTags:1,posters:0,missingPosters:['Сервелат'],missingPrices:[],files:['price-tags.pdf']};
const job=()=>({id:'delivery-1',mailbox:'owner@example.com',message_id:'incoming',status:'queued',manual:false,rows_snapshot:null,storage_key:null,manifest:null,
  recipient:null,send_message_id:'affera-promotions-delivery-1@affera.co.uk',gmail_sent_id:null,error:null,attempts:0,created_at:new Date(),updated_at:new Date(),sent_at:null});
const harness=(options={})=>{
  const jobs=[options.job||job()];const objects=new Map();const sends=[];const stages=[];let foundSent=null;
  const settings=options.settings||{recipient:'destination@example.com',allowedSenders:['supplier@example.com'],autoSend:true};
  const client={sendMessage:async raw=>{sends.push(raw);stages.push('api-send');if(options.sendError)throw options.sendError;return 'sent-id';},findSentMessage:async()=>foundSent};
  const connection={mailbox:'owner@example.com',canSend:true,client,...options.connection};
  const repo={readGmailDeliverySettings:async()=>settings,pendingGmailDeliveries:async()=>jobs.filter(j=>!['sent','failed'].includes(j.status)),
    canSendGmailToRecipient:async()=>options.limitAllowed!==false,
    messageImportsComplete:async()=>options.importsComplete!==false,
    updateGmailDelivery:async(id,patch)=>{stages.push(patch.status||'update');if(patch.status==='sent'&&options.commitError){options.commitError=false;throw Error('lost DB commit response');}Object.assign(jobs.find(j=>j.id===id),patch);}};
  const run=createGmailDeliveryProcessor({repository:repo,withLock:async fn=>fn(new AbortController().signal),getConnection:async()=>connection,
    rowsForMessage:async()=>[{...row}],build:options.build||(async()=>({zip:Buffer.from('ZIP'),manifest})),
    upload:async({key,body})=>objects.set(key,body),download:async key=>({body:objects.get(key),contentType:'application/zip',contentLength:3}),downloadUrl:async()=> 'https://private.example/package?signature=secret'});
  return {run,jobs,sends,stages,settings,connection,objects,setFoundSent:id=>{foundSent=id;}};
};

test('mail settings validate exact addresses, reject header injection and require explicit safe auto-send configuration',()=>{
  assert.deepEqual(parseGmailDeliverySettings({recipient:'Dest@Example.com',allowedSenders:['A@example.com','a@example.com'],autoSend:true}),{recipient:'dest@example.com',allowedSenders:['a@example.com'],autoSend:true});
  for(const input of [{recipient:'a@example.com\r\nBcc: b@example.com',allowedSenders:['a@example.com'],autoSend:true},
    {recipient:'a@example.com',allowedSenders:['*@example.com'],autoSend:true},{recipient:null,allowedSenders:['a@example.com'],autoSend:true},
    {recipient:'a@example.com',allowedSenders:[],autoSend:true},{recipient:null,allowedSenders:[],autoSend:'false'}])assert.throws(()=>parseGmailDeliverySettings(input));
  assert.equal(parseGmailDeliverySettings({recipient:null,allowedSenders:[],autoSend:false}).autoSend,false);
});
test('old readonly OAuth connections remain readable but cannot send; actual granted send scope enables delivery',async t=>{
  let scopes=[GMAIL_READ_SCOPE];t.mock.method(connectionRepo,'readGmailConnection',async()=>({email:'owner@example.com',granted_scopes:scopes}));
  assert.equal((await getGmailConnectionStatus()).canSend,false);scopes.push(GMAIL_SEND_SCOPE);assert.equal((await getGmailConnectionStatus()).canSend,true);
});
test('package contains real A4 price tags, available poster PDFs and named missing-poster/price notices',async()=>{
  const render=[];
  const build=createPromotionPackageBuilder({findPoster:async name=>({best:name==='Есть постер'?{file:{id:'psd'}}:null,candidates:[]}),downloadPoster:async()=>Buffer.from('PSD'),
    renderPoster:(_psd,r)=>{render.push(r);return Buffer.from('%PDF-poster');}});
  const rows=[{...row,productName:'Есть постер'},{...row,rowNumber:2,productName:'Нет постера'},
    {...row,rowNumber:3,productName:'Нет цены',regularPrice:null}];
  const result=await build(rows);const zip=await JSZip.loadAsync(result.zip);
  assert.equal((await zip.file('price-tags.pdf').async('nodebuffer')).subarray(0,5).toString(),'%PDF-');
  assert.equal(result.manifest.priceTags,2);assert.equal(result.manifest.posters,1);
  assert.deepEqual(result.manifest.missingPosters,['Нет постера','Нет цены']);assert.deepEqual(result.manifest.missingPrices,['Нет цены']);
  assert.match(await zip.file('README.txt').async('string'),/Для товара «Нет постера» постеров ещё нет/);
  assert.equal(render[0].promoPrice,80);assert.equal(render[0].startDate,'2026-10-14');
});
test('Drive errors prevent misleading missing-poster emails and preparation retries are bounded',async()=>{
  const build=createPromotionPackageBuilder({findPoster:async()=>{throw Error('provider token hidden');}});
  await assert.rejects(build([row]));
  const h=harness({build:async()=>{throw Error('token hidden');}});await h.run();await h.run();await h.run();await h.run();
  assert.equal(h.jobs[0].attempts,3);assert.equal(h.jobs[0].status,'failed');assert.equal(h.sends.length,0);assert.ok(!h.jobs[0].error.includes('hidden'));
});
test('MIME uses configured recipient and sender, RFC Message-ID, UTF-8 body and intact ZIP without header injection',()=>{
  const raw=buildPackageMimeMessage({from:'owner@example.com',to:'destination@example.com',messageId:'affera-promotions-test@affera.co.uk',text:'Для товара «Сервелат» постеров ещё нет.',zip:Buffer.from('ZIP')});
  const decoded=Buffer.from(raw,'base64url').toString();assert.match(decoded,/From: owner@example.com\r\nTo: destination@example.com/);
  assert.match(decoded,/Message-ID: <affera-promotions-test@affera.co.uk>/);assert.match(decoded,/application\/zip/);
  const parts=decoded.split('Content-Transfer-Encoding: base64\r\n\r\n');
  assert.match(Buffer.from(parts[1].split('\r\n--')[0],'base64').toString(),/«Сервелат»/);
  assert.equal(Buffer.from(parts[2].split('\r\n--')[0],'base64').toString(),'ZIP');
  assert.throws(()=>buildPackageMimeMessage({from:'owner@example.com',to:'a@example.com\nBcc: evil@example.com',messageId:'affera-promotions-test@affera.co.uk',text:''}));
});
test('full outbox builds once, fences before send and never sends terminal delivery again',async()=>{
  const h=harness();await h.run();await h.run();assert.equal(h.sends.length,1);assert.equal(h.jobs[0].status,'sent');
  assert.equal(h.jobs[0].recipient,'destination@example.com');assert.ok(h.stages.indexOf('sending')<h.stages.indexOf('api-send'));
  assert.deepEqual(h.jobs[0].rows_snapshot,[row]);
});
test('packages wait for all message imports, recipient, send consent and original mailbox; manual send bypasses only auto toggle',async()=>{
  const incomplete=harness({importsComplete:false});await incomplete.run();assert.equal(incomplete.jobs[0].status,'queued');assert.equal(incomplete.objects.size,0);
  for(const options of [{settings:{recipient:null,autoSend:true}}, {connection:{canSend:false}}, {connection:{mailbox:'other@example.com'}}, {settings:{recipient:'destination@example.com',autoSend:false}}]){
    const h=harness(options);await h.run();assert.equal(h.jobs[0].status,'ready');assert.equal(h.sends.length,0);assert.ok(h.jobs[0].error);
  }
  const manual=harness({job:{...job(),manual:true},settings:{recipient:'destination@example.com',autoSend:false}});await manual.run();assert.equal(manual.sends.length,1);
});
test('accepted email with lost acknowledgement or DB commit is reconciled from Sent without a second send',async()=>{
  for(const options of [{sendError:Object.assign(Error('timeout access_token=hidden'),{code:'ETIMEDOUT'})},{commitError:true}]){
    const h=harness(options);await h.run();assert.equal(h.jobs[0].status,'unknown');await h.run();assert.equal(h.sends.length,1);
    h.setFoundSent('accepted-id');await h.run();assert.equal(h.jobs[0].status,'sent');assert.equal(h.jobs[0].gmail_sent_id,'accepted-id');assert.equal(h.sends.length,1);
  }
  const h=harness({job:{...job(),status:'sending'}});h.setFoundSent('accepted-before-crash');await h.run();assert.equal(h.jobs[0].status,'sent');assert.equal(h.sends.length,0);
});
test('definite Gmail rejection is visible and never silently retried',async()=>{
  const h=harness({sendError:{response:{status:403,data:{secret:'hidden'}}}});await h.run();await h.run();assert.equal(h.jobs[0].status,'failed');assert.equal(h.sends.length,1);assert.ok(!JSON.stringify(h.jobs).includes('hidden'));
});

test('daily recipient limit pauses automatic and manual packages before touching Gmail and resumes when a slot is free',async()=>{
  for(const manual of [false,true]){
    const options={limitAllowed:false,job:{...job(),manual}};const h=harness(options);
    await h.run();await h.run();assert.equal(h.sends.length,0);assert.equal(h.jobs[0].status,'ready');assert.match(h.jobs[0].error,/5 писем/);
    options.limitAllowed=true;await h.run();assert.equal(h.sends.length,1);assert.equal(h.jobs[0].status,'sent');assert.ok(h.jobs[0].send_started_at);
  }
});
test('large package is sent through a private expiring link instead of an oversized attachment',async()=>{
  const h=harness({build:async()=>({zip:Buffer.alloc(19*1024*1024),manifest})});await h.run();
  const mime=Buffer.from(h.sends[0],'base64url').toString();assert.ok(!mime.includes('application/zip'));
  const body=Buffer.from(mime.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0],'base64').toString();
  assert.match(body,/https:\/\/private.example\/package/);assert.match(body,/7 дней/);assert.equal(h.jobs[0].status,'sent');
});

test('settings and email queue endpoints enforce Ops authentication, manager role and terminal send fences',async t=>{
  const {createDubaiApp}=require('../dist/app/dubaiApp');const {signOpsToken}=require('../dist/auth/auth');
  const deliveryRepo=require('../dist/repositories/gmailDeliveryRepository');const imports=require('../dist/repositories/gmailImportsRepository');
  const oauth=require('../dist/gmail/gmailOAuth');
  t.mock.method(imports,'withGmailPollLock',async fn=>fn(new AbortController().signal));
  let saved; t.mock.method(deliveryRepo,'saveGmailDeliverySettings',async value=>{saved=value;});
  t.mock.method(deliveryRepo,'getGmailDelivery',async()=>({...job(),status:'sent'}));
  t.mock.method(oauth,'getConnectedGmailClient',async()=>({mailbox:'owner@example.com',canSend:false,client:{}}));
  const server=createDubaiApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}/api/promotions/gmail`;
  const manager=signOpsToken({role:'manager'}),worker=signOpsToken({role:'worker',shopId:'test-shop'});
  const request=(path,method,body,token)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  for(const [path,method] of [['/settings','PUT'],['/packages','POST'],['/packages/id/send','POST']]){
    assert.equal((await request(path,method,{},null)).status,401);assert.equal((await request(path,method,{},worker)).status,403);
  }
  assert.equal((await request('/settings','PUT',{recipient:'a@example.com\nBcc: evil@example.com',allowedSenders:['a@example.com'],autoSend:true},manager)).status,400);
  assert.equal((await request('/settings','PUT',{recipient:'recipient@example.com',allowedSenders:['supplier@example.com'],autoSend:true},manager)).status,200);
  assert.equal(saved.recipient,'recipient@example.com');
  assert.equal((await request('/packages','POST',{rowNumbers:[1],requestId:'invalid'},manager)).status,400);
  assert.equal((await request('/packages/id/send','POST',{},manager)).status,409);
  assert.equal((await request('/packages/id/package.zip','GET',null,null)).status,401);
});
