'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const policy=require('../ai/questions'),client=require('../ai/client'),batch=require('../ai/batch');
test('pasted numbered questions collect their choices without turning options into questions',()=>{
  const items=policy.parse('1. Do you use Python?\n- Yes\n- No\n\n2. Which languages do you use?\nA. Python\nB. SQL\n3. Describe a project.');
  assert.equal(items.length,3);assert.equal(items[0].type,'yes_no');assert.deepEqual(items[1].options,['Python','SQL']);
  assert.equal(policy.validate(items)[2].question,'Describe a project.');
});
test('typed questions preserve stable IDs, exact choices, and character limits',()=>{
  const items=policy.validate([{id:'a',question:'Experience?',type:'yes_no'},{id:'b',question:'Choose skills',type:'checkbox',options:['Python','SQL'],maxLength:100}]);
  assert.deepEqual(items[0].options,['Yes','No']);assert.equal(items[1].id,'b');assert.equal(items[1].maxLength,100);
  for(const invalid of [[{question:'Choose',type:'radio'}],[{question:'Choose',type:'select',options:['A','A']}],[{question:'Long',maxLength:-1}],[{id:'same',question:'One'},{id:'same',question:'Two'}]])assert.throws(()=>policy.validate(invalid));
});
test('choice answers use exact supplied options and checkbox selections remain multiple',()=>{
  const questions=policy.validate([{question:'Choose one',type:'radio',options:['Yes','No']},{question:'Choose skills',type:'checkbox',options:['Python','SQL']},{question:'Years?',type:'number'}]);
  const answers=client.normalize({answers:[{id:'q1',answer:'Yes'},{id:'q2',answer:['Python','SQL']},{id:'q3',answer:'5'}]},questions);
  assert.equal(answers[0].answer,'Yes');assert.equal(answers[1].answer,'Python\nSQL');assert.equal(answers[2].answer,'5');
  const invalid=client.normalize({answers:[{id:'q1',answer:'yes, definitely'},{id:'q2',answer:['Rust']},{id:'q3',answer:'Five years'}]},questions);
  assert.ok(invalid.every(item=>item.needsInput && item.answer===''));
});
test('overlong answers request review instead of silently truncating',()=>{
  const questions=policy.validate([{question:'Short answer',type:'text',maxLength:3}]);
  assert.equal(client.normalize({answers:[{id:'q1',answer:'Long answer'}]},questions)[0].needsInput,true);
});

test('single checkbox labels normalize to selections while concatenated or invented options require review',()=>{
  const questions=policy.validate([{question:'Which tools?',type:'checkbox',options:['Python, SQL','Docker','Rust']}]);
  const answer=value=>client.normalize({answers:[{id:'q1',status:'ANSWERED',answer:value}]},questions)[0];
  assert.equal(answer('Python, SQL').answer,'Python, SQL');assert.equal(answer('Python, SQL').needsInput,false);
  assert.equal(answer(['Python, SQL','Docker']).answer,'Python, SQL\nDocker');
  for(const value of ['Docker, Rust','Docker\nRust',['Unknown'],['Docker','Docker']])assert.equal(answer(value).needsInput,true);
  assert.equal(answer([]).needsInput,false);
});

test('pasted select-all questions and checkbox markers retain multiple-choice types',()=>{
  const items=policy.validate(policy.parse('1. Which tools? Select all that apply.\n- Python\n- SQL\n2. Skills\n[ ] Docker\n[x] Rust\n3. Eligible?\nYes\nNo'));
  assert.equal(items[0].type,'checkbox');assert.deepEqual(items[0].options,['Python','SQL']);
  assert.equal(items[1].type,'checkbox');assert.deepEqual(items[1].options,['Docker','Rust']);assert.equal(items[2].type,'yes_no');
});

test('dates and contact fields do not display malformed model values as valid answers',()=>{
  const questions=policy.validate([{question:'Start date?',type:'date'},{question:'Email?',type:'email'},{question:'Portfolio?',type:'url'}]);
  const invalid=client.normalize({answers:[{id:'q1',answer:'2026-02-31'},{id:'q2',answer:'unknown'},{id:'q3',answer:'javascript:alert(1)'}]},questions);
  assert.ok(invalid.every(answer=>answer.needsInput));
  const valid=client.normalize({answers:[{id:'q1',answer:'2026-02-28'},{id:'q2',answer:'qa@example.test'},{id:'q3',answer:'https://example.test'}]},questions);
  assert.ok(valid.every(answer=>!answer.needsInput));
});
test('batches run at most two groups concurrently and retain order despite out-of-order completion',async()=>{
  const questions=policy.validate(Array.from({length:25},(_,i)=>'Question '+i)),progress=[];
  let active=0,maximum=0;const gates=[];
  const result=batch.run({questions,signal:new AbortController().signal,onProgress:value=>progress.push(value.completed),answer:async items=>{
    active++;maximum=Math.max(maximum,active);await new Promise(resolve=>gates.push(resolve));active--;return items.map(q=>({...q,answer:q.question}));
  }});
  assert.equal(active,2);gates[1]();await new Promise(resolve=>setImmediate(resolve));assert.equal(gates.length,3);
  gates[2]();gates[0]();const answers=await result;
  assert.equal(maximum,2);assert.deepEqual(answers.map(a=>a.id),questions.map(q=>q.id));assert.equal(progress.at(-1),25);
});
test('a failed group does not discard successful groups',async()=>{
  const questions=policy.validate(Array.from({length:12},(_,i)=>'Question '+i));
  const answers=await batch.run({questions,signal:new AbortController().signal,answer:async items=>{
    if(items[0].id==='q1')throw new Error('Provider unavailable');return items.map(q=>({...q,answer:'Answered'}));
  }});
  assert.equal(answers.filter(a=>a.error).length,10);assert.equal(answers[11].answer,'Answered');
});
test('Stop aborts the batch before queued groups are started',async()=>{
  const questions=policy.validate(Array.from({length:30},(_,i)=>'Question '+i)),controller=new AbortController();let started=0;
  const result=batch.run({questions,signal:controller.signal,answer:async()=>{started++;controller.abort();controller.signal.throwIfAborted();}});
  await assert.rejects(result,{name:'AbortError'});assert.equal(started,1);
});


test('detected required flags, help and numeric bounds survive the AI question contract',()=>{
  const [q]=policy.validate([{question:'How many years?',type:'number',required:true,min:'0',max:'50',step:'1',help:'Whole years only.'}]);
  assert.equal(q.required,true);assert.equal(q.min,0);assert.equal(q.max,50);assert.equal(q.step,1);assert.equal(q.help,'Whole years only.');
});
