(function(root){
  'use strict';
  function summarize(questions,answers,{active=false,requestId,resultRequestId,order=[],choices=new Map(),fields=[]}={}){
    const live=new Map(fields.map(field=>[field.id,field]));
    const results=new Map(answers.map(answer=>[answer.id,answer])),ids=new Set([...questions.map(q=>q.id),...results.keys(),...live.keys()]);
    const states=new Map();
    for(const id of ids){
      const answer=results.get(id),current=answer&&(!active||resultRequestId===requestId);
      states.set(id,(live.has(id)?live.get(id).filled:choices.get(id)==='applied')?'filled':active&&order.includes(id)&&!current?'processing':!answer?'unsent':answer.error||choices.get(id)==='failed'?'failed':!answer.reviewed&&(answer.needsInput||answer.draft)||!String(answer.answer||'').trim()&&answer.type!=='checkbox'?'review':'answered');
    }
    const count=state=>[...states.values()].filter(value=>value===state).length;
    const answered=new Set(answers.filter(answer=>!answer.error&&(String(answer.answer||'').trim()||answer.type==='checkbox'&&!answer.needsInput)).map(answer=>answer.id));
    for(const [id,state] of states)if(state==='filled')answered.add(id);
    return {states,total:ids.size,unsent:count('unsent'),processing:count('processing'),answered:answered.size,review:count('review'),filled:count('filled'),failed:count('failed'),pending:count('unsent')+count('processing')+count('review')+count('failed')};
  }
  root.SQCQuestionStatus={summarize};if(typeof module!=='undefined')module.exports={summarize};
})(typeof globalThis!=='undefined'?globalThis:this);
