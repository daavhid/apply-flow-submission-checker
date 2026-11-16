'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,inferName,normalizedName}=require('../ai/resume');
function fixture(){
  const data={};let version=0,changed=0;
  const store={async get(key){return {[key]:structuredClone(data[key])};},async set(items){Object.assign(data,structuredClone(items));},async remove(key){delete data[key];}};
  const options={store,id:()=>String(++version),onChange:()=>changed++};
  return {resume:create(options),restart:()=>create(options),data,changes:()=>changed};
}
const text='Test Applicant has seven years of Python engineering experience.';
test('resume context requires no account and persists across worker restarts',async()=>{
  const f=fixture();assert.deepEqual(await f.resume.state(),{resume:null});
  await f.resume.save({text,filename:'Resume.pdf'});
  const snapshot=await f.restart().snapshot();assert.equal(snapshot.text,text);assert.equal(snapshot.filename,'Resume.pdf');
  assert.deepEqual(Object.keys(f.data),['qaResume']);assert.equal(f.changes(),1);
});
test('candidate-name detection uses a name heading and filenames preserve Unicode without path characters',()=>{
  assert.equal(inferName('Nicholas Ruiz\nSenior Software Engineer\nExtensive Python experience.'),'Nicholas Ruiz');
  assert.equal(inferName('Senior Software Engineer\nNicholas Ruiz'),'');
  assert.equal(inferName('Test Applicant has seven years of Python engineering experience.'),'');
  assert.equal(normalizedName('  José / García:*  '),'José García');
});
test('attachment preserves exact original bytes, normalizes only the filename and survives service restart',async()=>{
  const data={},originals=new Map();let version=0;
  const store={async get(key){return {[key]:data[key]};},async set(value){Object.assign(data,value);},async remove(key){delete data[key];}};
  const files={async put(id,file){originals.set(id,file);},async get(id){return originals.get(id);},async clear(){originals.clear();},async retain(id){for(const key of originals.keys())if(key!==id)originals.delete(key);}};
  const options={store,files,id:()=>String(++version)},service=create(options);
  const body='data:application/pdf;base64,'+Buffer.from('%PDF-1.7 exact original bytes').toString('base64');
  const saved=await service.save({text:'Nicholas Ruiz\nSenior engineer building reliable Python APIs and services.',candidateName:'Nicholas Ruiz',filename:'CV-final (2).pdf',file:{filename:'CV-final (2).pdf',dataUrl:body}});
  assert.equal(saved.resume.filename,'Nicholas Ruiz.pdf');assert.equal(saved.resume.file.dataUrl,undefined);
  const file=await create(options).attachment(saved.resume.version);assert.equal(file.dataUrl,body);assert.equal(file.filename,'Nicholas Ruiz.pdf');
  await assert.rejects(service.attachment('old-version'),/changed/);
  const changed=await service.save({text:'A different candidate has extensive Java experience. Pasted replacement context.',filename:'Pasted resume'});
  await assert.rejects(service.attachment(changed.resume.version),/candidate name|original resume/);assert.equal(originals.size,0);
});
test('missing and invalid resume text cannot be used for generation',async()=>{
  const f=fixture();await assert.rejects(f.resume.snapshot(),/Upload or paste/);
  for(const value of ['',42,'x'.repeat(200001)])await assert.rejects(f.resume.save({text:value}),/resume text/);
  assert.equal((await f.resume.state()).resume,null);
});
test('replacing or removing a resume invalidates prior answers',async()=>{
  const f=fixture();await f.resume.save({text});const first=await f.resume.snapshot();
  await f.resume.save({text:text+' Updated experience.'});await assert.rejects(f.resume.assertCurrent(first),/changed/);
  const second=await f.resume.snapshot();await f.resume.clear();await assert.rejects(f.resume.assertCurrent(second),/changed/);
  assert.equal((await f.resume.state()).resume,null);
});
