'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse,experienceValue,numericFact,numberMismatch}=require('../content/resume-context');

test('education is parsed from the resume with its own school, degree, major and graduation year',()=>{
 const facts=parse('EDUCATION\nTest University\nBachelor of Science in Computer Science | 2017\nOther College\nMaster of Science in Engineering | 2020\nSKILLS\nPython');
 assert.equal(facts.education.length,2);assert.equal(facts.education[0].graduationYear,'2017');assert.equal(facts.education[1].graduationYear,'2020');
 assert.equal(facts.education[0].major,'Computer Science');assert.equal(facts.education[0].city,undefined);assert.equal(facts.education[0].gpa,undefined);
});
const resume=`Candidate One
8 years of professional experience. 5 years of experience with Python.
PROFESSIONAL EXPERIENCE
Acme Corp
Senior Software Engineer | January 2021 - Present
Built Python services and reduced latency by 25%.
Example Ltd
Software Developer | June 2017 - December 2020
Delivered SQL reporting APIs.
EDUCATION
Example University`;
test('employment entries retain their company, role, dates, descriptions, and source evidence',()=>{
  const f=parse(resume);assert.equal(f.workHistory.length,2);
  assert.equal(f.workHistory[0].company,'Acme Corp');assert.equal(f.workHistory[0].title,'Senior Software Engineer');
  assert.equal(f.workHistory[0].startDate,'2021-01');assert.equal(f.workHistory[0].current,true);
  assert.match(f.workHistory[0].description,/25%/);assert.ok(!f.workHistory[0].description.includes('Example Ltd'));
  assert.equal(f.workHistory[1].company,'Example Ltd');assert.equal(f.workHistory[1].endDate,'2020-12');
  assert.ok(!f.workHistory[1].description.includes('University'));
});
test('years-of-experience answers use explicit facts and never infer durations from a skills list',()=>{
  const f=parse(resume);assert.equal(numericFact('How many years of experience with Python?',f).value,5);
  assert.equal(numericFact('Total professional experience in years?',f).value,8);
  assert.equal(numericFact('Years using Java?',f),null);
  assert.equal(numberMismatch('Years with Python?','9',f).value,5);
  assert.equal(numberMismatch('Years with Python?','3-5 years',f),null);
  assert.equal(numberMismatch('Years with Python?','5+ years',f),null);
});
test('employment field mapping uses the selected row and does not invent precise dates',()=>{
  const h=parse(resume).workHistory;
  assert.equal(experienceValue(h,'Company name',1,'text'),'Example Ltd');
  assert.equal(experienceValue(h,'Start year',0,'text'),'2021');
  assert.equal(experienceValue(h,'Start month',0,'select'),'January');
  assert.equal(experienceValue(h,'Start date',0,'date'),undefined);
  assert.equal(experienceValue(h,'End date',0,'month'),undefined);
  assert.equal(experienceValue(h,'Company',3,'text'),undefined);
});
test('unstructured or ambiguous employment stays empty rather than borrowing candidate defaults',()=>{
  const f=parse('Candidate One\nSkills: Python, SQL\nExperienced professional.');
  assert.deepEqual(f.workHistory,[]);assert.equal(f.totalYears,null);assert.deepEqual(f.skillYears,{});
});
test('a responsibility sentence above a role is not treated as its company',()=>{
  const facts=parse(`Candidate One\nEXPERIENCE\nFirst Corp\nSenior Engineer | 2022 - 2024\nMaintaining design records, Git pull-request reviews, and governance through the SDLC.\nSoftware Engineer | 2020 - 2022\nSecond Corp\nBuilt APIs.\nEDUCATION`);
  assert.equal(facts.workHistory[1].company,'Second Corp');
});
test('employment is ordered current-to-oldest even when the document lists older work first',()=>{
  const facts=parse('Candidate One\nEXPERIENCE\nOld Corp\nSoftware Engineer | January 2010 - December 2015\nBuilt old systems.\nCurrent Corp\nSenior Engineer | January 2023 - Present\nBuilt current systems.\nMiddle Corp\nSoftware Developer | January 2016 - December 2022\nBuilt services.\nSKILLS\nLanguages: Python, TypeScript\nDatabases: PostgreSQL, SQL');
  assert.deepEqual(facts.workHistory.map(row=>row.company),['Current Corp','Middle Corp','Old Corp']);assert.deepEqual(facts.skills,['Python','TypeScript','PostgreSQL','SQL']);assert.match(facts.workHistory[0].description,/current systems/);assert.equal(facts.workHistory[0].description.includes('old systems'),false);
});
