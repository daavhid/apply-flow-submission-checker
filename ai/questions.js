(function(root){
  'use strict';
  const types=['textarea','text','yes_no','radio','select','checkbox','number','date','email','url','tel'];
  const choice=type=>['yes_no','radio','select','checkbox'].includes(type);
  function validate(items){
    if(!Array.isArray(items)||!items.length||items.length>100)throw new Error('Add between 1 and 100 questions.');
    const ids=new Set();
    return items.map((item,index)=>{
      const raw=typeof item==='string'?{question:item}:item;
      if(!raw || typeof raw.question!=='string' || !raw.question.trim() || raw.question.length>4000)throw new Error('Each question must contain 1–4,000 characters.');
      const id=raw.id || 'q'+(index+1),type=raw.type || 'textarea';
      if(typeof id!=='string' || id.length>128 || ids.has(id))throw new Error('Each question needs a unique ID.');ids.add(id);
      if(!types.includes(type))throw new Error('Choose a supported question type.');
      const result={id,question:raw.question.trim(),...(raw.type?{type}:{})};
      if(raw.required!==undefined)result.required=raw.required===true;
      if(raw.help!==undefined && typeof raw.help==='string')result.help=raw.help.slice(0,2000);
      if(type==='number')for(const name of ['min','max','step']){
        if(raw[name]!==undefined && raw[name]!==''){
          if(name==='step'&&raw[name]==='any'){result[name]='any';continue;}
          const value=Number(raw[name]);if(!Number.isFinite(value)||name==='step'&&value<=0)throw new Error('Invalid numeric question constraint.');result[name]=value;
        }
      }
      if(choice(type)){
        const options=type==='yes_no'?['Yes','No']:raw.options;
        if(!Array.isArray(options)||!options.length||options.length>100||options.some(v=>typeof v!=='string'||!v.trim()||v.length>1000)||new Set(options).size!==options.length)throw new Error('Choice questions need 1–100 distinct, nonempty options.');
        result.options=options.map(v=>v.trim());if(new Set(result.options).size!==options.length)throw new Error('Choice options must be distinct.');
      }
      if(raw.maxLength!==undefined && raw.maxLength!==''){
        const limit=Number(raw.maxLength);if(!Number.isInteger(limit)||limit<1||limit>50000)throw new Error('Character limits must be whole numbers from 1 to 50,000.');result.maxLength=limit;
      }
      return result;
    });
  }
  function parse(text){
    const lines=String(text||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean),items=[];
    let current=null;
    for(const line of lines){
      const numbered=/^\d+[.)]\s+/.test(line),option=/^(?:[A-Za-z][.)]|[-•]|\[[ xX]?\]|[○◯●])\s*/.test(line);
      const simpleOption=/^(?:yes|no|prefer not to (?:say|answer)|not applicable)$/i.test(line);
      if(current && !numbered && (option || simpleOption)){
        (current.options ||= []).push(line.replace(/^(?:[A-Za-z][.)]|[-•]|\[[ xX]?\]|[○◯●])\s*/,'').trim());current.type='radio';
      }else{
        current={question:line.replace(/^\d+[.)]\s+/,''),type:'textarea'};items.push(current);
      }
    }
    for(const item of items)if(item.options?.length===2 && item.options[0]==='Yes' && item.options[1]==='No')item.type='yes_no';
    return items;
  }
  const api={types,choice,validate,parse};root.SQCQAQuestions=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
