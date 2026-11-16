async function runWholeFormSmoke(){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const fixture=document.createElement('section');
  fixture.innerHTML=`<form>
    <div class="form-field"><label>First name*</label><input id="whole-first" placeholder="First name" required></div>
    <label>Last name*<input id="whole-last" autocomplete="family-name" required></label>
    <label>Email*<input id="whole-email" type="email"></label>
    <label>Phone number*<input id="whole-phone" type="tel"></label>
    <label>Location*<input autocomplete="address-level2"></label>
    <label>LinkedIn Link<input type="url"></label>
    <label>CV*<input type="file" accept=".pdf,.docx" style="display:none" required></label>
    <label>Gender<select id="whole-gender"><option value="--">--</option><option value="m">Male</option><option value="f">Female</option></select></label>
    <label>Veteran Status<select><option value="">Select an Item</option><option>I am not a protected veteran</option></select></label>
    <div class="form-group"><label for="whole-pronouns">Pronouns</label><div id="whole-pronouns" role="combobox" aria-controls="whole-options" aria-expanded="true"><input placeholder="Search"></div></div>
    <div role="listbox" id="whole-options"><div role="option" id="whole-he">He/Him</div><div role="option">They/Them</div></div>
    <label>Already supplied<input value="Keep this answer"></label>
    <label>Password<input type="password"></label>
    <label><input type="checkbox">I agree to the privacy policy</label>
    <input autocomplete="given-name" id="whole-autocomplete">
  </form>`;
  document.body.appendChild(fixture);
  let submits=0;fixture.querySelector('form').addEventListener('submit',event=>{event.preventDefault();submits++;});
  const combo=fixture.querySelector('#whole-pronouns');
  fixture.querySelector('#whole-he').addEventListener('click',()=>{combo.setAttribute('aria-valuetext','He/Him');fixture.querySelector('#whole-options').hidden=true;});
  const found=SQCQAFormBridge.scan(fixture).questions;
  for(const name of ['First name','Last name','Email','Phone number','Location','LinkedIn Link','CV','Gender','Veteran Status','Pronouns'])check(found.some(q=>q.question===name),'Whole-form detection missed '+name);
  check(found.length===11,'Unexpected whole-form count or duplicate nested combobox: '+JSON.stringify(found.map(q=>q.question)));
  check(found.filter(q=>q.question==='First name').length===2,'Autocomplete-only name field was missed');
  const fill=(q,answer)=>SQCQAFormBridge.fill({id:q.id,question:q.question,answer,url:location.href,snapshot:q.snapshot});
  fill(found.find(q=>q.question==='First name'),'Nicholas');fill(found.find(q=>q.question==='Last name'),'Ruiz');
  fill(found.find(q=>q.question==='Email'),'nicholas@example.com');fill(found.find(q=>q.question==='Gender'),'Male');
  check(fixture.querySelector('#whole-first').value==='Nicholas'&&fixture.querySelector('#whole-email').value==='nicholas@example.com','Identity answers did not fill');
  check(fixture.querySelector('#whole-gender').value==='m','Placeholder -- was treated as an answered choice');
  const pronouns=found.find(q=>q.question==='Pronouns');check(pronouns.options.join('|')==='He/Him|They/Them','Associated custom dropdown choices were missed');
  fill(pronouns,'He/Him');check(combo.getAttribute('aria-valuetext')==='He/Him','Custom choice did not apply');
  const cv=found.find(q=>q.question==='CV');check(cv.help.startsWith('File upload:'),'Upload was not detected as a manual task');
  let refused=false;try{fill(cv,'Fake file');}catch{refused=true;}check(refused&&!fixture.querySelector('[type=file]').value,'File upload accepted a generated text answer');
  const original='%PDF-1.7 exact original resume bytes';
  const attachment={id:cv.id,question:cv.question,url:location.href,snapshot:cv.snapshot,file:{filename:'Nicholas Ruiz.pdf',mimeType:'application/pdf',dataUrl:'data:application/pdf;base64,'+btoa(original)}};
  const attached=SQCQAFormBridge.attach(attachment),file=fixture.querySelector('[type=file]').files[0];
  check(attached.success&&file.name==='Nicholas Ruiz.pdf'&&await file.text()===original,'Resume attachment changed the filename or original bytes');
  refused=false;try{SQCQAFormBridge.attach(attachment);}catch{refused=true;}check(refused,'An existing resume attachment was overwritten');
  fixture.querySelector('[type=file]').value='';fixture.querySelector('[type=file]').accept='.docx';
  const refreshedCV=SQCQAFormBridge.scan(fixture).questions.find(q=>q.question==='CV');
  refused=false;try{SQCQAFormBridge.attach({...attachment,id:refreshedCV.id,snapshot:refreshedCV.snapshot});}catch{refused=true;}check(refused&&!fixture.querySelector('[type=file]').files.length,'An unsupported file format was attached');
  check(submits===0&&!fixture.querySelector('[type=checkbox]').checked,'Whole-form filling submitted or accepted legal terms');
  fixture.remove();return 'Passed: Rippling-style identity/contact fields, autocomplete, uploads, demographic fields, custom choices, preserved entries and no submission.';
}
