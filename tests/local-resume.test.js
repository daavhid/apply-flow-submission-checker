'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validate, memoryStore} = require('../background/local-resume');
const text = 'Candidate One\nSenior software engineer building Python services and SQL applications.\nSkills\nPython, SQL';
const input = () => ({filename:'Tailored.txt',dataUrl:'data:text/plain;base64,' + btoa(text),confirmed:true,text,skills:['Python','SQL']});
test('local documents keep their original bytes, source, hash, and extracted context',async () => {
  const r = await validate(input(),{id:'p1',fullName:'Candidate One'});
  assert.equal(r.text,text); assert.equal(r.source,'sqc_upload'); assert.equal(r.verified,false);
  assert.match(r.file.sha256,/^[a-f0-9]{64}$/); assert.equal(r.id,'sqc-upload:'+r.file.sha256);
  assert.equal(atob(r.file.dataUrl.split(',')[1]),text);
});
test('confirmation and assigned candidate identity are required for local uploads',async () => {
  await assert.rejects(validate({...input(),confirmed:false},{id:'p1',fullName:'Candidate One'}),/Confirm/);
  await assert.rejects(validate(input(),{id:'p2',fullName:'Another Candidate'}),/assigned candidate/);
});
test('a renamed binary document is rejected and text content comes from the actual TXT bytes',async () => {
  await assert.rejects(validate({...input(),filename:'Fake.pdf'},{id:'p1',fullName:'Candidate One'}),/file type/);
  const r = await validate({...input(),text:'fabricated different content'},{id:'p1',fullName:'Candidate One'});
  assert.equal(r.text,text);
});
test('local records are invalidated by account, assignment, job, or base resume changes',async () => {
  const store = memoryStore(); await store.put(1,'original',{id:'file'});
  assert.equal((await store.get(1,'original')).id,'file');
  assert.equal(await store.get(1,'another-context'),null); assert.equal(await store.get(1,'original'),null);
});
