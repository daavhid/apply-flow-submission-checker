async function runFormBridgeSmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Form integration did not reach the expected state.');};
  const fixture=document.createElement('section');fixture.id='job-form-fixture';fixture.innerHTML=`<form>
    <label>Full name<input name="name" autocomplete="name" required></label><label>Email<input type="email" required></label>
    <label>Why should we hire you?<textarea id="portal-open" required></textarea></label>
    <fieldset><legend>Have you used Python professionally?</legend><label><input type="radio" name="python" value="y">Yes</label><label><input type="radio" name="python" value="n">No</label></fieldset>
    <fieldset id="skills-group"><legend>Which technologies have you used?</legend><label><input type="checkbox" value="py">Python</label><label><input type="checkbox" value="sql">SQL</label><label><input type="checkbox" value="rust">Rust</label></fieldset>
    <label>Which is your primary programming language?<select id="portal-select"><option value="">Select one</option><option value="py">Python</option><option value="java">Java</option></select></label>
    <p id="years-help">Whole years only.</p><label>How many years of Python experience?<input type="number" min="0" max="50" step="1" required aria-describedby="years-help"></label>
    <label><input id="portal-consent" type="checkbox" required>I agree to the privacy policy</label>
    <label>Describe previous projects<textarea>Already answered by the applier.</textarea></label>
    <label hidden>What is hidden?<textarea></textarea></label>
    <div role="radiogroup" aria-label="Are you willing to relocate?"><div role="radio" aria-label="Yes" aria-checked="false" tabindex="0">Yes</div><div role="radio" aria-label="No" aria-checked="false" tabindex="0">No</div></div>
    <div role="combobox" aria-label="Which technology is your specialty?" tabindex="0"></div><div role="textbox" aria-label="Describe your approach to testing" contenteditable="true"></div><div id="question-shadow"></div></form>`;
  document.body.appendChild(fixture);
  const shadow=fixture.querySelector('#question-shadow').attachShadow({mode:'open'});shadow.innerHTML='<label>Describe your most relevant project.<textarea></textarea></label>';
  fixture.querySelectorAll('[role=radio]').forEach(node=>node.addEventListener('click',()=>{node.parentElement.querySelectorAll('[role=radio]').forEach(other=>other.setAttribute('aria-checked',String(other===node)));}));
  const scan=()=>SQCQAFormBridge.scan(fixture),initial=scan();
  check(initial.questions.length===11,'Detection missed identity fields or shadow/custom questions: '+JSON.stringify(initial.questions.map(q=>q.question)));
  const years=initial.questions.find(q=>q.type==='number');check(years.required && years.min==='0' && years.max==='50' && years.help==='Whole years only.','Question requirements or accessible help were dropped');
  check(initial.questions.some(q=>q.help?.includes('Custom dropdown')),'Closed custom dropdowns do not provide a copy-only fallback');
  check(scan().questions.every((q,index)=>q.id===initial.questions[index].id),'Detection changed stable field IDs');
  check(!fixture.querySelector('input:checked'),'Detection modified form choices');
  const fill=(q,answer)=>SQCQAFormBridge.fill({id:q.id,question:q.question,answer,url:location.href,snapshot:q.snapshot});
  const skills=initial.questions.find(q=>q.type==='checkbox'),radio=initial.questions.find(q=>q.question==='Have you used Python professionally?'),select=initial.questions.find(q=>q.type==='select');
  check(select.question==='Which is your primary programming language?','Dropdown option text leaked into the question label');
  let changes=0;fixture.addEventListener('change',()=>changes++);
  fill(skills,'Python\nSQL');check(fixture.querySelectorAll('#skills-group input:checked').length===2 && !fixture.querySelector('input[value=rust]').checked,'Checkbox answer did not select exactly the matching options');
  fill(radio,'Yes');check(fixture.querySelector('input[value=y]').checked && !fixture.querySelector('input[value=n]').checked,'Radio answer did not choose exactly one option');
  fill(select,'Python');check(fixture.querySelector('#portal-select').value==='py' && changes>=4,'Native change events or dropdown mapping failed');
  const custom=initial.questions.find(q=>q.question==='Are you willing to relocate?');fill(custom,'No');check(fixture.querySelector('[role=radio][aria-label=No]').getAttribute('aria-checked')==='true','ARIA radio selection failed');
  fixture.querySelector('input[value=n]').click();let refused=false;try{fill(radio,'Yes');}catch(_){refused=true;}check(refused && fixture.querySelector('input[value=n]').checked,'AI overwrote an applier selection');
  fixture.querySelector('#skills-group legend').textContent='Which other technologies do you prefer?';refused=false;try{fill(skills,'Rust');}catch(_){refused=true;}check(refused,'Changed question semantics were not rejected');
  fill(initial.questions.find(q=>q.type==='textarea'),'Written answer');check(fixture.querySelector('#portal-open').value==='Written answer','Written answer filling failed');
  fixture.querySelector('#portal-open').value='Applier edit';refused=false;try{fill(initial.questions.find(q=>q.type==='textarea'),'Replacement');}catch(_){refused=true;}check(refused && fixture.querySelector('#portal-open').value==='Applier edit','Written filling overwrote a manual edit');
  check(!fixture.querySelector('#portal-consent').checked,'Consent was selected automatically');
  fixture.querySelector('form').reset();fixture.querySelectorAll('[role=radio]').forEach(node=>node.setAttribute('aria-checked','false'));
  document.getElementById('clear-questions').click();
  let generated=0,copied='',connected=false,permissionRequests=0;const state={resume:{source:'upload',filename:'Test.txt',text:'Test Applicant has five years of Python and SQL experience.',version:'form-test'}};
  window.chrome.permissions={request:async options=>{permissionRequests++;check(options.origins.length===1 && options.origins[0]==='https://jobs.example/*','Connection requested more than the current site');connected=true;return true;}};
  window.chrome.runtime.sendMessage=async message=>{
    if(message.type==='QA_DEFAULTS_STATE')return {success:true,value:{active:null,template:''}};
    if(message.type==='QA_RESUME_STATE')return {success:true,state};
    if(message.type==='QA_SCAN_FORM'&&!connected)return {success:false,code:'SITE_ACCESS_REQUIRED',error:'Allow access to jobs.example.',access:{origin:'https://jobs.example/*',hostname:'jobs.example'},details:'Missing host permission.'};
    if(message.type==='QA_SCAN_FORM')return {success:true,pageKey:'test-job',questions:scan().questions.map(q=>({...q,source:{tabId:7,documentId:'test',url:location.href,snapshot:q.snapshot}}))};
    if(['QA_APPLY_CHOICE','QA_APPLY_ANSWER'].includes(message.type)){try{return fill({...message.item,snapshot:message.item.source.snapshot},message.item.answer);}catch(error){return {success:false,error:error.message};}}
    if(message.type==='QA_ANSWER'){check(message.questions.every(q=>!q.source && !q.snapshot),'Browser bindings were sent to the AI');generated++;return {success:true,requestId:message.requestId,answers:message.questions.map(q=>q.question.includes('relocate')?{...q,answer:'',needsInput:true,reason:'Confirm relocation preference.'}:{...q,answer:q.question==='Full name'?'Test Applicant':q.type==='email'?'test@example.com':q.type==='checkbox'?'Python\nSQL':q.type==='radio'?'Yes':q.type==='select'?'Python':q.type==='number'?'5':'I build Python APIs.'})};}
    return {success:true};
  };
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(value){copied=value;}}});
  await resumeAction('QA_RESUME_STATE');await detectQuestions(true);
  check(!document.getElementById('connect-page').hidden && generated===0,'Missing site access did not offer a connection action');
  document.getElementById('connect-page').click();await wait(()=>queuedQuestions.length===11 && document.getElementById('connect-page').hidden);
  check(permissionRequests===1,'The connection action did not request site access exactly once');
  check(queuedQuestions.length===11 && generated===0,'Detection did not queue questions locally or sent them without approval');
  document.getElementById('send').click();await wait(()=>generated===1 && fixture.querySelectorAll('#skills-group input:checked').length===2);
  check(fixture.querySelector('input[value=y]').checked && fixture.querySelector('#portal-open').value==='I build Python APIs.','Choice or written answer application failed');
  const open=Array.from(document.querySelectorAll('.answer')).find(card=>card.querySelector('h3').textContent==='Why should we hire you?');open.querySelector('.copy').click();await wait(()=>copied==='I build Python APIs.');
  check(!fixture.querySelector('#portal-consent').checked && !fixture.querySelector('[role=radio][aria-checked=true]'),'Consent or an unknown relocation answer was auto-selected');
  check(document.getElementById('insight-applied').textContent==='9','Applied field count is incorrect');
  document.getElementById('jump-review').click();check(document.querySelectorAll('.answer:not([hidden])').length===2,'Overview review shortcut is incorrect');
  document.getElementById('jump-applied').click();check(document.querySelectorAll('.answer:not([hidden])').length===9,'Overview applied shortcut is incorrect');
  document.querySelector('[data-answer-filter="all"]').click();
  const multi=answers.find(item=>item.type==='checkbox'),card=document.getElementById('answer-card-'+multi.id);
  check(card.querySelectorAll('.answer-checkboxes input[type=checkbox]').length===3,'Multiple answers are not exposed as individual checkboxes');
  card.querySelector('input[value=SQL]').click();card.querySelector('input[value=Rust]').click();
  check(multi.answer==='Python\nRust','Independent checkbox clicks lost the other selected answer');
  card.querySelector('.answer-actions button:last-child').click();await wait(()=>fixture.querySelector('input[value=rust]').checked);
  check(fixture.querySelector('input[value=py]').checked&&!fixture.querySelector('input[value=sql]').checked,'Edited multi-answer selection was not filled back exactly');

  fixture.remove();
  const extra=document.createElement('section');extra.innerHTML='<div class="question"><h3>Business domains</h3><label><input type="checkbox" style="display:none">Finance</label><label><input type="checkbox" style="display:none">Healthcare</label></div><div class="question"><h3>Expected pay</h3><div class="field"><input type="number"></div></div>';
  document.body.appendChild(extra);const found=SQCQAFormBridge.scan(extra).questions;
  check(found.length===2&&found[0].options.length===2&&found[0].question==='Business domains'&&found[1].question==='Expected pay','Short labels or nested field headings were missed');
  fill(found[0],['Finance','Healthcare']);check(extra.querySelectorAll('input:checked').length===2,'Array multi-answer input was not applied');extra.remove();
  return 'Passed: broader detection, individual multi-answer checkboxes, exact selection, preserved user edits and no automatic sending.';
}
