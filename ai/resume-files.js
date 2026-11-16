(function(root){
  'use strict';
  function create(){
    let opened;
    async function db(){
      if(!opened)opened=new Promise((resolve,reject)=>{const request=root.indexedDB.open('applyflow-resume-files',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Unable to store the original resume file.'));});
      return opened;
    }
    async function action(mode,work){const database=await db();return new Promise((resolve,reject)=>{const transaction=database.transaction('files',mode);let value;const request=work(transaction.objectStore('files'));if(request)request.onsuccess=()=>value=request.result;transaction.oncomplete=()=>resolve(value);transaction.onerror=()=>reject(new Error('Unable to access the original resume file.'));transaction.onabort=transaction.onerror;});}
    const retain=async id=>{const database=await db();return new Promise((resolve,reject)=>{const transaction=database.transaction('files','readwrite'),request=transaction.objectStore('files').openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){if(cursor.key!==id)cursor.delete();cursor.continue();}};transaction.oncomplete=resolve;transaction.onerror=()=>reject(new Error('Unable to clean up the old resume file.'));});};
    return {get:id=>action('readonly',store=>store.get(id)),put:(id,file)=>action('readwrite',store=>store.put(file,id)),clear:()=>action('readwrite',store=>store.clear()),retain};
  }
  root.SQCQAResumeFiles={create};
})(globalThis);
