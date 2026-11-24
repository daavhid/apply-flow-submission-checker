const {test}=require('node:test'),assert=require('node:assert/strict'),{summarize}=require('../ai/question-status');
test('Q&A separates detected unsent questions from answers and processing',()=>{
 const questions=[{id:'a'},{id:'b'},{id:'c'}];let result=summarize(questions,[]);assert.equal(result.unsent,3);assert.equal(result.answered,0);
 result=summarize(questions,[{id:'a',answer:'No'}],{active:true,requestId:'one',resultRequestId:'one',order:['a','b']});assert.equal(result.processing,1);assert.equal(result.answered,1);assert.equal(result.unsent,1);
});
test('unknown facts, failed generations and applied answers have distinct states',()=>{
 const result=summarize([],[{id:'a',answer:'No'},{id:'b',needsInput:true},{id:'c',error:true},{id:'d',answer:'Draft',draft:true}],{choices:new Map([['a','applied']])});assert.equal(result.filled,1);assert.equal(result.answered,2);assert.equal(result.review,2);assert.equal(result.failed,1);assert.equal(result.pending,3);
});
test('page-filled answers count without any AI request and clearing a field removes applied status',()=>{
 const fields=[{id:'a',filled:true},{id:'b',filled:true},{id:'c',filled:false}];
 let result=summarize([{id:'c'}],[],{fields});assert.equal(result.total,3);assert.equal(result.answered,2);assert.equal(result.filled,2);assert.equal(result.pending,1);
 fields[0].filled=false;result=summarize([{id:'a'},{id:'c'}],[],{fields,choices:new Map([['a','applied']])});assert.equal(result.filled,1);assert.equal(result.unsent,2);
});
