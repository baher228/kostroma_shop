import JSZip from 'jszip';
import { randomBytes } from 'crypto';
import type { PromotionTableRow } from '../repositories/promotionRowsRepository';
import type { PackageManifest } from '../repositories/gmailDeliveryRepository';
import { createPromotionPriceTagSheetPdf } from '../services/promotionPriceTagPdfService';
import { findPosterPsdForProduct,downloadPosterDriveFile,safePosterPdfFileName } from '../services/googleDrivePosterService';
import { createGeneratedPosterPdfFromPsd } from '../services/generatedPosterPdfService';
import { validateEmailAddress } from './gmailSenderPolicy';

const validPrice=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0;
export const promotionPackageText = (manifest:PackageManifest,rows:readonly PromotionTableRow[]) => [
  'Пакет ценников и постеров сформирован по импортированным акциям.',
  `Ценников: ${manifest.priceTags}. Постеров: ${manifest.posters}.`,
  '',...rows.map(row=>`${row.productName}: ${row.startDate??'дата не указана'} — ${row.endDate??'дата не указана'}, новая цена: ${row.promoPrice??'нет'}, старая цена: ${row.regularPrice??'нет'}.`),
  '',...manifest.missingPosters.map(name=>`Для товара «${name}» постеров ещё нет.`),
  ...manifest.missingPrices.map(name=>`Для товара «${name}» ценник и постер не сформированы: отсутствует старая или новая цена.`),
  '', 'Все позиции сохранены в общей таблице акций для проверки и ручной отправки.',
].join('\n');
const defaults={priceTags:createPromotionPriceTagSheetPdf,findPoster:findPosterPsdForProduct,downloadPoster:downloadPosterDriveFile,renderPoster:createGeneratedPosterPdfFromPsd};
export const createPromotionPackageBuilder = (overrides:Partial<typeof defaults>={}) => {
  const deps={...defaults,...overrides};
  return async(rows:readonly PromotionTableRow[],signal?:AbortSignal)=>{
    if (!rows.length || rows.length>500) throw new Error('Пакет должен содержать от 1 до 500 позиций.');
    const zip=new JSZip();
    const ready=rows.filter(row=>validPrice(row.regularPrice)&&validPrice(row.promoPrice));
    const manifest:PackageManifest={products:[...new Set(rows.map(row=>row.productName))],priceTags:ready.length,posters:0,
      missingPosters:[],missingPrices:[...new Set(rows.filter(row=>!ready.includes(row)).map(row=>row.productName))],files:[]};
    let size=0;
    const add=(name:string,buffer:Buffer)=>{
      size+=buffer.length;
      if(size>64*1024*1024)throw new Error('Пакет превышает 64 МБ; сформируйте несколько пакетов по выбранным строкам.');
      zip.file(name,buffer);manifest.files.push(name);
    };
    if(ready.length)add('price-tags.pdf',deps.priceTags(ready));
    for(let index=0;index<rows.length;index++){
      signal?.throwIfAborted();
      const row=rows[index];
      const match=await deps.findPoster(row.productName);
      if(!match.best){manifest.missingPosters.push(row.productName);continue;}
      if(!ready.includes(row))continue;
      const psd=await deps.downloadPoster(match.best.file.id);
      signal?.throwIfAborted();
      add(`posters/${String(index+1).padStart(3,'0')}-${safePosterPdfFileName(`${row.productName}.pdf`)}`,deps.renderPoster(psd,row));
      manifest.posters++;
    }
    manifest.missingPosters=[...new Set(manifest.missingPosters)];
    zip.file('README.txt',promotionPackageText(manifest,rows));
    signal?.throwIfAborted();
    return {zip:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}),manifest};
  };
};
export const buildPromotionPackage=createPromotionPackageBuilder();

const foldedBase64=(value:Buffer)=>value.toString('base64').match(/.{1,76}/g)?.join('\r\n')??'';
const encodedSubject=(value:string)=>{
  const chunks:string[]=[];let chunk='';
  for(const char of value){if(Buffer.byteLength(chunk+char)>42){chunks.push(chunk);chunk='';}chunk+=char;}
  if(chunk)chunks.push(chunk);
  return chunks.map(text=>`=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`).join('\r\n ');
};
export const buildPackageMimeMessage = (input:{from:string;to:string;messageId:string;text:string;zip?:Buffer;date?:Date}) => {
  const from=validateEmailAddress(input.from),to=validateEmailAddress(input.to);
  if(!/^affera-promotions-[a-z0-9-]+@affera\.co\.uk$/i.test(input.messageId))throw new Error('Invalid delivery Message-ID.');
  const boundary=`affera_${randomBytes(18).toString('hex')}`;
  const lines=[`From: ${from}`,`To: ${to}`,`Message-ID: <${input.messageId}>`,`Date: ${(input.date??new Date()).toUTCString()}`,
    `Subject: ${encodedSubject('Ценники и постеры')}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',
    `--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',foldedBase64(Buffer.from(input.text,'utf8'))];
  if(input.zip)lines.push(`--${boundary}`,'Content-Type: application/zip; name="promotions.zip"','Content-Disposition: attachment; filename="promotions.zip"',
    'Content-Transfer-Encoding: base64','',foldedBase64(input.zip));
  lines.push(`--${boundary}--`,'');
  return Buffer.from(lines.join('\r\n'),'utf8').toString('base64url');
};
