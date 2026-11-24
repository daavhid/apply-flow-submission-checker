'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {validate,defaults,create}=require('../config/runtime');
test('deployment JSON accepts fixed or tailored mode and rejects unknown or unsafe settings',()=>{
  const bundled=JSON.parse(fs.readFileSync('config/settings.json','utf8'));assert.equal(validate(bundled).resume.mode,'tailored');
  const fixed=structuredClone(defaults);fixed.resume.mode='fixed';assert.equal(validate(fixed).resume.mode,'fixed');
  for(const change of [c=>c.resume.mode='guess',c=>c.extra=true,c=>c.questions.applyText='yes',c=>c.submission.requireAcknowledgement=false]){const value=structuredClone(defaults);change(value);assert.throws(()=>validate(value));}
});
test('deployment policy is read once per worker and never silently falls back after a load error',async()=>{
  let reads=0;const policy=create({url:'extension/settings.json',fetch:async()=>{reads++;return {ok:true,json:async()=>defaults};}});
  await policy.load();await policy.load();assert.equal(reads,1);
  await assert.rejects(create({url:'bad',fetch:async()=>({ok:false})}).load(),/settings.json/);
});
