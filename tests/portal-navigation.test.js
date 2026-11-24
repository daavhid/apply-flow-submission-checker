'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Ashby routing diagnostics observe only the actual embedded board without changing navigation',async()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'../content/content.js'),'utf8');
  const start=source.indexOf('  function observePortalNavigation('),end=source.indexOf('\n  // Global initialization',start);
  const messages=[],board={},window={};window.top=window;
  const scope={window,URL,Promise,document:{querySelectorAll:()=>[{src:'https://jobs.ashbyhq.com/mimica/embed',contentWindow:board}]},chrome:{runtime:{sendMessage:async message=>messages.push(message)}}};
  vm.createContext(scope);vm.runInContext(source.slice(start,end)+';this.observe=observePortalNavigation;',scope);
  scope.observe({origin:'https://unrelated.test',source:board,data:'reset_jid'});
  scope.observe({origin:'https://jobs.ashbyhq.com',source:{},data:'reset_jid'});
  scope.observe({origin:'https://jobs.ashbyhq.com',source:board,data:{type:'SUBMITTED'}});
  assert.equal(messages.length,0);
  scope.observe({origin:'https://jobs.ashbyhq.com',source:board,data:'reset_jid'});
  assert.equal(messages.length,1);assert.equal(messages[0].kind,'ATS_RESET_JOB_SELECTION');
  assert.equal(messages[0].type,'SQC_RECORD_PORTAL_NAVIGATION');
});
