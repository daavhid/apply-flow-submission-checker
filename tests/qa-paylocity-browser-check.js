async function runPaylocitySmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const fixture=document.createElement('section');fixture.id='paylocity-fixture';
  const questions=[
    'Are you legally authorized to work in the United States for any employer without current or future visa sponsorship?',
    'This position is not available to candidates based in California. Are you currently based in California?',
    'The salary range for this role is $120,000 - $150,000 + up to $15K in bonus. Does this align with your salary expectations?'
  ];
  // Reproduce the visible component markup from Paylocity's public-apply bundle:
  // paragraph/span headings, option labels, nested text labels without htmlFor.
  fixture.innerHTML='<form><div class="application-screener-override">'+questions.map((question,index)=>`<div><div class="row editable-screener margin-right"><div class="col-xs-12 editable-interior"><div class="row-float-fill"><div class="col-fluid"><div class="drag-edit toggle toggle-inline padding-bottom-none multi-question"><p><span class="type-semibold">${question}</span> (required)</p><div class="drag-edit-radios"><input type="radio" name="multiQuestionAnswer${index}" id="multiQuestionAnswer${index}_0"><label for="multiQuestionAnswer${index}_0">Yes</label></div><div class="drag-edit-radios"><input type="radio" name="multiQuestionAnswer${index}" id="multiQuestionAnswer${index}_1"><label for="multiQuestionAnswer${index}_1">No</label></div></div></div></div></div></div></div>`).join('')+`<div class="row editable-screener"><div class="col-xs-12 editable-interior"><div class="row-float-fill"><div class="col-fluid"><div class="drag-edit padding-bottom-none text-question"><p><label>Please provide a direct link to your LinkedIn profile, if you have one. If your LinkedIn profile is included on your resume, please paste the direct URL here as well. If you do not have a LinkedIn profile, please enter N/A.</label></p><textarea id="screener-question-3-textarea" rows="4"></textarea></div></div></div></div></div>
    <div class="multi-question"><p><span>Which technologies have you used?</span> (required)</p><div class="drag-edit-radios"><input type="checkbox" name="multiQuestionAnswer4" id="multiQuestionAnswer4_0"><label for="multiQuestionAnswer4_0">Python</label></div><div class="drag-edit-radios"><input type="checkbox" name="multiQuestionAnswer4" id="multiQuestionAnswer4_1"><label for="multiQuestionAnswer4_1">SQL</label></div><div class="drag-edit-radios"><input type="checkbox" name="multiQuestionAnswer4" id="multiQuestionAnswer4_2"><label for="multiQuestionAnswer4_2">Rust</label></div></div>
    <div class="form-group form-required"><label>How many years of Python experience? <em>(required)</em></label><input type="number"></div>
    </div></form>`;
  const hiddenState=document.createElement('script');hiddenState.type='application/json';hiddenState.textContent=JSON.stringify({questions:[{title:'Hidden metadata must not be used',correctAnswer:'Not a visible option'}]});fixture.appendChild(hiddenState);
  document.body.appendChild(fixture);
  const result=SQCQAFormBridge.scan(fixture),items=result.questions;
  check(!JSON.stringify(result).includes('Hidden metadata') && !JSON.stringify(result).includes('Not a visible option'),'Hidden page state entered the extracted questions');
  check(items.length===6,'Paylocity screening questions were missed: '+JSON.stringify(items.map(q=>q.question)));
  for(let index=0;index<3;index++){
    check(items[index].question===questions[index] && items[index].type==='radio','Paylocity option labels were used as the question');
    check(items[index].required && items[index].options.join('|')==='Yes|No','Paylocity required flags or exact choices were lost');
  }
  check(items[3].question.startsWith('Please provide a direct link') && items[3].type==='textarea','Unassociated nested textarea label was missed');
  check(!items[3].required && items[4].required && items[5].required,'Required/optional extraction is incorrect');
  check(items[4].type==='checkbox' && items[4].options.length===3,'Paylocity checkbox choices were not grouped');
  const fill=(q,answer)=>SQCQAFormBridge.fill({id:q.id,question:q.question,answer,url:location.href,snapshot:q.snapshot});
  fill(items[0],'No');fill(items[1],'Yes');fill(items[2],'No');fill(items[4],'Python\nSQL');
  check(fixture.querySelectorAll('input[type=radio]:checked').length===3 && fixture.querySelectorAll('input[type=checkbox]:checked').length===2,'Paylocity choice mapping failed');
  check(!fixture.querySelector('#screener-question-3-textarea').value,'Written Paylocity answers were auto-filled');
  check(SQCQAFormBridge.scan(fixture).questions.length===2,'Answered Paylocity choice groups were not excluded');
  const requiredMarker=fixture.querySelector('.multi-question p');requiredMarker.textContent='Different question? (required)';
  let refused=false;try{fill(items[0],'Yes');}catch(_){refused=true;}check(refused,'Changed Paylocity question text was not rejected');
  fixture.remove();
  const identity=document.createElement('section');
  identity.innerHTML='<div class="form-group"><label for="race-choice">What is your ethnic/racial identity?</label><select id="race-choice"><option value="">Select an Item</option><option value="multi">Two or more races</option><option value="private">Prefer not to say</option></select></div><div class="form-group"><label for="race-custom">Ethnicity</label><input id="race-custom" role="combobox" aria-expanded="false"></div>';
  document.body.appendChild(identity);
  const identityQuestions=SQCQAFormBridge.scan(identity).questions;
  check(identityQuestions.length===2,'Optional race questions were excluded from detection');
  const native=identityQuestions.find(q=>q.type==='select');
  check(native && native.options.join('|')==='Two or more races|Prefer not to say','Literal optional identity choices were lost');
  const resultChoice=SQCQAFormBridge.fill({id:native.id,question:native.question,answer:'Two or more races',url:location.href,snapshot:native.snapshot});
  check(identity.querySelector('select').value==='multi','Optional race dropdown did not accept the exact preference');
  const custom=identityQuestions.find(q=>q.help?.includes('Custom dropdown'));
  check(custom && !custom.options,'Unavailable custom-dropdown choices were invented');
  identity.remove();return 'Passed: Paylocity screening and optional race detection, exact choices and manual handling of custom dropdowns.';
}
