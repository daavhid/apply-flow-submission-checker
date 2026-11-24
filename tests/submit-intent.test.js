'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {classify} = require('../content/submit-intent');

test('decorated intermediate labels remain steps even on native submit controls',()=>{
  for(const label of ['Next →','› Continue','Next: Experience','Continue to review','Save & Continue →']){
    assert.equal(classify({label,nativeSubmit:true,submitEvent:true,hasApplicantFields:true,finalId:true}),'step',label);
  }
  assert.equal(classify({label:'Review and submit',nativeSubmit:true,hasApplicantFields:true}),'final');
});

test('an Apply link to another page or a form anchor remains navigation even with candidate data on the page', () => {
  for (const label of ['Apply','Apply now','Apply for this job','Submit application']) {
    assert.equal(classify({label,navigation:true,hasApplicantFields:true,nativeSubmit:true,afterFields:true}),'navigation');
  }
});
test('Apply controls that open a dialog or application section never trigger submission gating', () => {
  assert.equal(classify({label:'Apply',opensForm:true,hasApplicantFields:true,nativeSubmit:true,intermediate:true}),'navigation');
  assert.equal(classify({label:'Start application',hasApplicantFields:true,nativeSubmit:true}),'navigation');
  assert.equal(classify({label:'Apply',hasApplicantFields:true,afterFields:false,nativeSubmit:false}),'navigation');
});
test('dormant forms and cached candidate answers cannot turn an entry Apply button into a final submit', () => {
  assert.equal(classify({label:'Apply',hasApplicantFields:false,afterFields:false}),'navigation');
  assert.equal(classify({label:'Apply',hasApplicantFields:false,nativeSubmit:true,submitEvent:true}),'navigation');
});
test('a real Apply submit is final even before the applicant has filled any fields', () => {
  for (const label of ['Apply','Apply now','Apply for this job']) {
    assert.equal(classify({label,hasApplicantFields:true,nativeSubmit:true}),'final');
  }
});
test('form-less SPA final Apply and review-page Apply stay protected', () => {
  assert.equal(classify({label:'Apply',hasApplicantFields:true,afterFields:true}),'final');
  assert.equal(classify({label:'Apply',review:true}),'final');
});
test('Enter submission and wizard navigation are classified independently of filled values', () => {
  assert.equal(classify({submitEvent:true,hasApplicantFields:true}),'final');
  assert.equal(classify({submitEvent:true,hasApplicantFields:true,intermediate:true}),'step');
  assert.equal(classify({label:'Apply',hasApplicantFields:true,nativeSubmit:true,intermediate:true}),'step');
  assert.equal(classify({label:'Continue',hasApplicantFields:true,nativeSubmit:true}),'step');
  assert.equal(classify({label:'Save draft',submitEvent:true,hasApplicantFields:true}),'navigation');
  assert.equal(classify({label:'Back to jobs',intermediate:true}),'unknown');
});
test('explicit final submits remain protected and HUD interactions remain excluded', () => {
  assert.equal(classify({label:'Submit application'}),'final');
  assert.equal(classify({label:'Send',nativeSubmit:true,hasApplicantFields:true}),'final');
  assert.equal(classify({label:'Apply',ignored:true,hasApplicantFields:true,nativeSubmit:true}),'ignore');
});
test('the intent classifier is loaded before interception in the packaged manifest', () => {
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../manifest.json'),'utf8'));
  const scripts=manifest.content_scripts[0].js;
  assert.ok(scripts.indexOf('content/submit-intent.js')>=0);
  assert.ok(scripts.indexOf('content/submit-intent.js')<scripts.indexOf('content/content.js'));
});
