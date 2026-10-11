import JSZip from 'jszip';
import { downloadObject } from '../services/r2StorageService';

export type StoredPackageFile={name:string;key:string;size:number};
export const readPackageFileIndex=async(key:string,download:typeof downloadObject=downloadObject):Promise<StoredPackageFile[]>=>{
  const stored=await download(key);
  const value=JSON.parse(stored.body.toString('utf8')) as {version:number;files:StoredPackageFile[]};
  const prefix=key.slice(0,key.lastIndexOf('/')+1);
  if(value.version!==2||!Array.isArray(value.files)||value.files.length>1000
    ||value.files.some(file=>!file||typeof file.name!=='string'||!file.name.endsWith('.pdf')||/[\r\n\x00]/.test(file.name)
      ||typeof file.key!=='string'||!file.key.startsWith(prefix)||!Number.isSafeInteger(file.size)||file.size<0))throw new Error('Invalid package file index.');
  return value.files;
};

// Old deliveries remain downloadable as individual PDFs, without exposing an archive.
export const readPackageFile=async(key:string,index:number,download:typeof downloadObject=downloadObject)=>{
  if(key.endsWith('.zip')){
    const archive=await JSZip.loadAsync((await download(key)).body);
    const file=Object.values(archive.files).filter(file=>!file.dir&&file.name.endsWith('.pdf'))[index];
    if(!file)return null;
    return {name:file.name.split('/').pop()!,body:await file.async('nodebuffer')};
  }
  const file=(await readPackageFileIndex(key,download))[index];
  return file?{name:file.name,body:(await download(file.key)).body}:null;
};
