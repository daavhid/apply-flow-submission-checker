/* Shared protocol checks for ApplyFlow screening requests and DOM answer batches. */
(function(root) {
  'use strict';
  const contextKeys = ['applicationSessionId','jobId','jobVersion','profileId','profileVersion','resumeId','resumeVersion'];
  const stamp = context => Object.fromEntries(contextKeys.map(key => [key,context?.[key]]));
  const same = (a,b) => contextKeys.every(key => a?.[key] && a[key] === b?.[key]);
  function questions(items) {
    if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Send between 1 and 100 unanswered questions.');
    const ids = new Set();
    return items.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 128 || ids.has(item.id)) throw new Error('Each screening field needs a unique question ID.');
      ids.add(item.id);
      if (typeof item.question !== 'string' || !item.question.trim() || item.question.length > 4000 ||
          !['text','textarea','number','select','radio','checkbox'].includes(item.type)) throw new Error('A screening question has invalid text or type.');
      const result = {id:item.id,question:item.question,type:item.type,required:item.required === true};
      if (item.options !== undefined) {
        if (!Array.isArray(item.options) || !item.options.length || item.options.length > 100 ||
            item.options.some(option => typeof option !== 'string' || !option || option.length > 1000) || new Set(item.options).size !== item.options.length) throw new Error('Question options must be unique literal choices.');
        result.options = [...item.options];
      }
      if (['select','radio','checkbox'].includes(item.type) && !result.options) throw new Error('Choice questions require the portal’s literal options.');
      if (item.maxLength !== undefined) {
        if (!Number.isInteger(item.maxLength) || item.maxLength < 1 || item.maxLength > 50000) throw new Error('A question has an invalid character limit.');
        result.maxLength = item.maxLength;
      }
      return result;
    });
  }
  function envelope(result,expected) {
    if (result?.contractVersion !== 2 || result.requestId !== expected.requestId || !same(result,expected)) throw new Error('Answer context or request ID does not match this application. Refresh and try again.');
  }
  function answers(result,expected,requested) {
    envelope(result,expected);
    if (!Array.isArray(result.answers)) throw new Error('ApplyFlow returned an invalid answer batch.');
    const ids = new Set(), byId = new Map(requested.map(question => [question.id,question]));
    const normalized = result.answers.map(answer => {
      const question = byId.get(answer?.id);
      if (!question || ids.has(answer.id) || !['ANSWERED','NEEDS_INPUT'].includes(answer.status)) throw new Error('ApplyFlow returned unknown, duplicate, or invalid question answers.');
      ids.add(answer.id);
      if (answer.status === 'NEEDS_INPUT') return {id:answer.id,status:'NEEDS_INPUT',answer:'',reason:String(answer.reason || answer.reasoning || 'This answer needs your input.').slice(0,1000)};
      if(question.type==='checkbox'&&Array.isArray(answer.answer)){
        if(new Set(answer.answer).size!==answer.answer.length||answer.answer.some(value=>!question.options.includes(value)))return {id:answer.id,status:'NEEDS_INPUT',answer:'',reason:'The checkbox answers did not match available options.'};
        return {id:answer.id,status:'ANSWERED',answer:answer.answer};
      }
      if (typeof answer.answer !== 'string' || !answer.answer.trim()) throw new Error('An answered question must contain a nonempty answer.');
      if (question.options && (!question.options.includes(answer.answer) ||
          (answer.matchedOption != null && answer.matchedOption !== answer.answer))) return {id:answer.id,status:'NEEDS_INPUT',answer:'',reason:'The answer did not match an available portal option.'};
      if (question.maxLength && answer.answer.length > question.maxLength) return {id:answer.id,status:'NEEDS_INPUT',answer:'',reason:'The answer exceeds this field’s character limit.'};
      return {id:answer.id,status:'ANSWERED',answer:answer.answer,matchedOption:question.options ? answer.answer : null};
    });
    for (const question of requested) if (!ids.has(question.id)) normalized.push({id:question.id,status:'NEEDS_INPUT',answer:'',reason:'ApplyFlow did not return an answer for this field.'});
    return normalized;
  }
  const api={contextKeys,stamp,same,questions,envelope,answers}; root.SQCScreeningPolicy=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
