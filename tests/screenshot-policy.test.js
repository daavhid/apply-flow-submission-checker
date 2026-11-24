const {test}=require('node:test'),assert=require('node:assert/strict'),policy=require('../content/live-progress');
test('screenshot state changes when an answer changes, regardless of answered count',()=>{
 const data={all_entries:[{label:'Work authorization',value:'Yes'},{label:'Name',value:'Candidate'}]};
 const signature=policy.fingerprint(data);assert.equal(signature,policy.fingerprint({...data,all_entries:[...data.all_entries].reverse()}));
 assert.notEqual(signature,policy.fingerprint({...data,all_entries:[{label:'Work authorization',value:'No'},data.all_entries[1]]}));
});
test('identical images from different capture triggers reuse one evidence item',()=>{
 const first={id:'one',page_url:'https://jobs.example/apply',step_key:'step',data_url:'data:image/jpeg;base64,one'};
 const merged=policy.mergeScreenshots([first],{...first,id:'two',trigger:'FINAL_SUBMIT'});assert.equal(merged.duplicate,true);assert.equal(merged.screenshot.id,'one');assert.equal(merged.screenshots.length,1);
 const changed=policy.mergeScreenshots([first],{...first,id:'three',data_url:'data:image/jpeg;base64,new'});assert.equal(changed.screenshots.length,1);assert.equal(changed.screenshot.id,'three');
});
