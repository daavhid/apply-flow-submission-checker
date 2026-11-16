async function runDefaultsSmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Defaults UI did not reach the expected state.');};
  await import('/ai/defaults.js');
  const area=()=>{const data={};return {data,async get(key){return {[key]:structuredClone(data[key])};},async set(value){Object.assign(data,structuredClone(value));},async remove(key){delete data[key];}};};
  const session=area(),local=area(),service=SQCQADefaults.create({session,local});
  let resume={source:'upload',filename:'Candidate-A.txt',text:'Candidate A is a software engineer with Python experience.',version:'a'};
  window.chrome.runtime.sendMessage=async message=>{
    try{
      if(message.type==='QA_RESUME_STATE')return {success:true,state:{resume}};
      if(message.type==='QA_DEFAULTS_STATE')return {success:true,value:await service.state(resume.version)};
      if(message.type==='QA_DEFAULTS_SAVE')return {success:true,value:await service.save(message.defaults,resume.version)};
      if(message.type==='QA_DEFAULTS_TEMPLATE')return {success:true,value:await service.saveTemplate(message.text)};
      if(message.type==='QA_DEFAULTS_CLEAR')return {success:true,value:await service.clear()};
      return {success:false,error:'Unexpected action'};
    }catch(error){return {success:false,error:error.message};}
  };
  await resumeAction('QA_RESUME_STATE');await wait(()=>document.getElementById('default-facts').value.includes('Restrictive covenants'));
  check((await service.snapshot('a')).source==='extension_defaults','Standard defaults were not active automatically');
  check(!document.getElementById('confirm-defaults'),'A manual confirmation checkbox is still required');
  const input=document.getElementById('default-facts');input.value='Work authorization country: United States. Authorized to work there: Yes. Visa sponsorship needed now or in future: No. Desired salary: USD 140000 per year.';input.dispatchEvent(new Event('input'));
  document.getElementById('use-defaults').click();
  await wait(()=>document.getElementById('defaults-state').textContent==='Resume overrides active');
  check((await service.snapshot('a')).text===input.value,'Confirmed facts were not activated');
  document.getElementById('save-default-template').click();await wait(()=>document.getElementById('defaults-status').textContent.includes('template saved'));
  check(local.data.qaDefaultTemplate.includes('140000'),'Reusable template was not saved');
  resume={...resume,filename:'Candidate-B.txt',version:'b',text:'Candidate B is a software engineer using Java and SQL.'};
  await resumeAction('QA_RESUME_STATE');await wait(()=>document.getElementById('defaults-state').textContent==='Extension defaults active');
  check((await service.snapshot('b')).source==='extension_defaults'&&!document.getElementById('default-facts').value.includes('140000'),'Candidate A facts were applied to a new resume');
  document.getElementById('load-standard-defaults').click();
  check(input.value.includes('upper boundary')&&input.value.includes('Work authorization: Yes'),'Updated standard defaults were not available independently of an older saved template');
  check((await service.snapshot('b')).source==='extension_defaults','Extension defaults became inactive on resume change');
  return 'Passed: automatic extension defaults, no confirmation checkbox, saved resume overrides and isolation on candidate change.';
}
