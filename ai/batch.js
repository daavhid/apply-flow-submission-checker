(function(root){
  'use strict';
  async function run({questions,answer,signal,onProgress=()=>{},size=10,concurrency=2}){
    const chunks=[];for(let i=0;i<questions.length;i+=size)chunks.push(questions.slice(i,i+size));
    const results=new Map();let next=0,completed=0;
    async function process(){
      while(next<chunks.length){
        signal.throwIfAborted();const chunk=chunks[next++];let answers;
        try{answers=await answer(chunk);signal.throwIfAborted();}
        catch(error){if(signal.aborted)throw error;const debug=root.SQCQADiagnostics?.from(error,{questionCount:chunk.length});answers=chunk.map(q=>({...q,answer:'',needsInput:true,error:true,reason:error.message || 'This batch could not be answered.',...(debug?{debug}:{})}));}
        for(const q of chunk)results.set(q.id,answers.find(a=>a.id===q.id)||{...q,answer:'',needsInput:true,reason:'ApplyFlow did not return this answer.'});
        completed+=chunk.length;onProgress({completed,total:questions.length,answers:chunk.map(q=>results.get(q.id))});
      }
    }
    await Promise.all(Array.from({length:Math.min(concurrency,chunks.length)},()=>process()));signal.throwIfAborted();
    return questions.map(q=>results.get(q.id));
  }
  root.SQCQABatch={run};if(typeof module!=='undefined')module.exports={run};
})(globalThis);
