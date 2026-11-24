(function(root){
  'use strict';
  const version='2.13.1';
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const questionText=value=>clean(value).replace(/\s*(?:\*|\(\s*required\s*\))\s*$/i,'').trim();
  const excluded=/password|social security|passport|verification code|captcha|\b(?:privacy policy|terms of|terms and|i agree|i accept)\b/i;
  function attention(question,type,autocomplete=''){
    if(!question || question.length>4000 || excluded.test(question) || /(?:^|\s)(?:username|current-password|new-password|one-time-code|cc-\S+)(?:\s|$)/i.test(autocomplete))return false;
    // ATS labels often omit question marks and use short titles such as "Expected pay".
    return true;
  }
  function create(doc){
    const ids=new WeakMap(),targets=new Map();
    const selectors='input,textarea,select,[role="radio"],[role="checkbox"],[role="combobox"],[role="textbox"],[aria-haspopup="listbox"],button[data-automation-id="selectWidget"]';
    const emptyChoice=value=>!clean(value)||/^(?:[-–—]+|select(?: an? item| an? option| one)?|choose(?: an? option| one)?|please select|search)(?:\s*\.{1,3})?$/i.test(clean(value));
    const autoLabels={'given-name':'First name','family-name':'Last name',name:'Full name','additional-name':'Middle name',email:'Email',tel:'Phone number','street-address':'Street address','address-line1':'Address line 1','address-line2':'Address line 2','address-level2':'City','address-level1':'State / province','postal-code':'Postal code','country-name':'Country',country:'Country',organization:'Current company'};
    const fallbackLabel=node=>node.getAttribute('placeholder')&&!emptyChoice(node.getAttribute('placeholder'))?node.getAttribute('placeholder'):autoLabels[node.autocomplete?.split(/\s+/).pop()]||node.name?.replace(/[_-]/g,' ');
    const text=node=>clean(node?.textContent);
    const labelText=node=>{if(!node)return '';const clone=node.cloneNode(true);clone.querySelectorAll('input,textarea,select,button,script,style').forEach(child=>child.remove());return text(clone);};
    const labelled=node=>clean((node.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>text(node.getRootNode().getElementById?.(id)||doc.getElementById(id))).filter(value=>!/^Total\s+\d+\s+files?\s+selected$/i.test(value)).join(' '));
    const described=node=>clean((node?.getAttribute('aria-describedby')||'').split(/\s+/).map(id=>text(node?.getRootNode().getElementById?.(id)||doc.getElementById(id))).join(' '));
    const label=node=>clean(labelled(node)||Array.from(node.labels||[]).map(owner=>labelled(owner)||labelText(owner)).join(' ')||node.getAttribute('aria-label')||text(node.querySelector?.('[data-label]'))||node.getAttribute('data-label'));
    const option=node=>label(node)||text(node)||node.value;
    function uploadProxy(node){
      if(node.type!=='file'||node.parentElement?.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
      for(let container=node.parentElement,depth=0;container&&container!==doc.body&&depth<5;container=container.parentElement,depth++){
        const files=container.querySelectorAll('input[type=file]');if(files.length>1)break;
        const description=clean([node.id,node.name,node.getAttribute('aria-label'),label(node),container.querySelector('label,h2,h3,p')?.textContent].join(' '));
        if(!/resume|curriculum|\bcv\b|cover.?letter/i.test(description))continue;
        if(Array.from(container.querySelectorAll('button,a,[role=button],label')).some(proxy=>proxy.getClientRects().length>0&&!proxy.closest('[hidden],[inert],[aria-hidden="true"]')&&/attach|upload|browse|choose|select/i.test(text(proxy))))return true;
      }
      return false;
    }
    function visible(node){
      if(node?.isConnected&&node.type==='file'&&(root.SQCFormState?.uploaded(node)||!node.disabled&&uploadProxy(node)))return true;
      if(!node.isConnected || node.disabled || node.readOnly || node.getAttribute('aria-disabled')==='true' || node.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
      const displayed=element=>element.getClientRects().length>0 && doc.defaultView.getComputedStyle(element).visibility!=='hidden' && !element.closest('[hidden],[inert],[aria-hidden="true"]');
      if(displayed(node))return true;
      // Styled ATS choices often hide the native input and expose its associated label.
      return node.matches('input[type=radio],input[type=checkbox],input[type=file]') && Array.from(node.labels||[]).some(displayed);
    }
    const heading=node=>node?clean(labelled(node)||node.getAttribute('aria-label')||labelText(node.querySelector(':scope > legend,:scope > label,:scope > h2,:scope > h3,:scope > .label,:scope > .control-label,:scope > .field-label,:scope > .question-label,:scope > [data-label],:scope > .application-label,:scope > [data-automation-id="formLabel"],:scope > [data-automation-id="questionLabel"],:scope > p'))):'';
    function group(node){
      const known=node.closest('[role="radiogroup"],[role="group"],fieldset,[data-question],.multi-question,.text-question,.editable-screener,.form-group,.form-field,.field,.application-question,.question,[data-automation-id^="formField"],.ashby-application-form-field,.posting-question');
      if(known && heading(known))return known;
      // Many ATS widgets have a sibling paragraph/label without for/ARIA links.
      for(let parent=node.parentElement,depth=0;parent&&parent!==doc.body&&depth<6;parent=parent.parentElement,depth++){
        const title=heading(parent);if(!title||!attention(questionText(title),typeOf(node)))continue;
        const controls=Array.from(parent.querySelectorAll(selectors)).filter(visible);
        const homogeneous=controls.every(control=>control.type===node.type && (!node.name||control.name===node.name));
        if(controls.length===1||['radio','checkbox'].includes(node.type)&&homogeneous)return parent;
      }
      return null;
    }
    const required=(nodes,container)=>nodes.some(n=>n.required||n.getAttribute('aria-required')==='true')||container?.getAttribute('aria-required')==='true'||container?.classList.contains('form-required')===true||/(?:\*|\(\s*required\s*\))\s*$/i.test(label(nodes[0])||heading(container))||/\(\s*required\s*\)\s*$/i.test(heading(container));
    const checked=node=>node.matches('input')?node.checked:node.getAttribute('aria-checked')==='true';
    const typeOf=node=>node.tagName==='SELECT'?(node.multiple?'checkbox':'select'):node.tagName==='TEXTAREA'||node.getAttribute('role')==='textbox'?'textarea':node.getAttribute('role')==='combobox'||node.getAttribute('aria-haspopup')==='listbox'||node.getAttribute('data-automation-id')==='selectWidget'?'custom-select':node.getAttribute('role')||node.type;
    const current=target=>JSON.stringify(target.nodes.map(node=>target.customSelect?[node.getAttribute('aria-valuetext'),node.value,node.querySelector('input')?.value,text(node)]:['radio','checkbox'].includes(target.type)&&node.tagName!=='SELECT'?checked(node):node.tagName==='SELECT'&&node.multiple?Array.from(node.selectedOptions).map(o=>o.value):node.isContentEditable?node.textContent:node.value));
    function customOptions(node){
      const ids=clean([node.getAttribute('aria-controls'),node.getAttribute('aria-owns')].join(' ')).split(/\s+/);
      return ids.flatMap(id=>{const list=node.getRootNode().getElementById?.(id)||doc.getElementById(id);return list?Array.from(list.querySelectorAll('[role="option"]')).filter(n=>visible(n)&&n.getAttribute('aria-disabled')!=='true'):[];});
    }
    function optionsFor(target){
      if(target.customSelect)return customOptions(target.nodes[0]).map(text);
      if(target.nodes[0].tagName==='SELECT')return Array.from(target.nodes[0].options).filter(o=>!o.disabled&&!o.hidden&&o.value!==''&&!emptyChoice(text(o))).map(text);
      return target.nodes.map(option);
    }
    const shape=target=>JSON.stringify([target.readQuestion(),target.type,required(target.nodes,group(target.nodes[0])),target.nodes.map(n=>[label(n),n.required,n.getAttribute('aria-required'),n.maxLength,n.getAttribute('min'),n.getAttribute('max'),n.getAttribute('step'),described(n)]),described(group(target.nodes[0])),target.options?optionsFor(target):null]);
    function roots(scope){const found=[scope];for(const node of scope.querySelectorAll('*'))if(node.shadowRoot)found.push(...roots(node.shadowRoot));return found;}
    function scan(scope=doc){
      const questions=[],fields=[],uploads=[],seen=new Set(),diagnostics={controls:0,visible:0,unlabeled:0,filtered:0,answered:0,unsupported:0,manual:0};
      for(const context of roots(scope))for(const node of context.querySelectorAll(selectors)){
        diagnostics.controls++;
        if(!visible(node))continue;
        diagnostics.visible++;
        if(node.closest('[role="option"],[role="listbox"]') || node.parentElement?.closest('[role="combobox"]'))continue;
        if(node.getAttribute('role') && node.getAttribute('role')!=='combobox' && Array.from(node.querySelectorAll('input,select,textarea')).some(visible))continue;
        let type=typeOf(node);if(!['text','textarea','number','date','email','url','tel','radio','checkbox','select','custom-select','file'].includes(type)){if(!['submit','reset','button','hidden','password'].includes(type))diagnostics.unsupported++;continue;}
        let nodes=[node],anchor=node,question=label(node),container=group(node),grouped=false;
        if(type==='file'&&!question){const name=clean(node.name||node.id);if(/resume|\bcv\b/i.test(name))question='Resume / CV';else if(/cover.?letter/i.test(name))question='Cover letter';}
        if(type==='radio'){
          if(node.matches('input')&&node.name)nodes=Array.from(context.querySelectorAll('input[type="radio"]')).filter(n=>n.name===node.name&&n.form===node.form&&visible(n));
          else if(container)nodes=Array.from(container.querySelectorAll('[role="radio"]')).filter(visible);
          grouped=Boolean(heading(container));question=heading(container)||question;anchor=nodes[0];
        }else if(type==='checkbox' && node.tagName!=='SELECT'){
          const name=heading(container);
          if(name && attention(questionText(name),type)){
            nodes=Array.from(container.querySelectorAll('input[type="checkbox"],[role="checkbox"]')).filter(n=>visible(n)&&!excluded.test(label(n)));
            // Prefer native controls when a widget exposes the same option twice.
            const labels=new Set();nodes=nodes.filter(n=>{const value=option(n);if(labels.has(value))return false;labels.add(value);return true;});
            grouped=true;question=name;anchor=nodes[0];
          }
        }
        if(!anchor || seen.has(anchor))continue;seen.add(anchor);
        const customSelect=type==='custom-select',manualUpload=type==='file';
        if(customSelect)type=customOptions(node).length?'select':'text';
        if(manualUpload)type='text';
        question=questionText(question||heading(container)||fallbackLabel(node));
        if(!question){diagnostics.unlabeled++;continue;}
        if(!attention(question,type,node.autocomplete)){diagnostics.filtered++;continue;}
        let id=ids.get(anchor);if(!id){id='dom_'+root.crypto.randomUUID();ids.set(anchor,id);}
        const filename=manualUpload?(root.SQCFormState?.uploaded(node)||node.files?.[0]?.name||''):'';
        const answer=manualUpload?filename:customSelect?(root.SQCFormState?.selected(node)||clean(node.getAttribute('aria-valuetext'))):node.tagName==='SELECT'?Array.from(node.selectedOptions).filter(o=>o.value!==''&&!emptyChoice(text(o))).map(text).join('\n'):['checkbox','radio'].includes(type)?nodes.filter(checked).map(option).join('\n'):node.isContentEditable?clean(node.textContent):clean(node.value);
        const manual=manualUpload||customSelect&&!customOptions(node).length;
        fields.push({id,question,type:manualUpload?'file':type,answer,filled:Boolean(answer),manual:manual&&!answer,required:required(nodes,container)});
        if(manual&&!answer)diagnostics.manual++;
        if(answer&&!manualUpload){diagnostics.answered++;continue;}
        const target={nodes,type,question,customSelect,manualUpload,url:doc.location.href,readQuestion:()=>manualUpload?questionText(label(node)||heading(group(node))||fallbackLabel(node)||question):questionText((grouped?heading(group(node)):label(node))||heading(group(node))||fallbackLabel(node))};
        if(['radio','checkbox','select'].includes(type)){
          target.options=optionsFor(target);
          if(!target.options.length||target.options.length>100||target.options.some(v=>!v||v.length>1000)||new Set(target.options).size!==target.options.length)continue;
        }
        target.initial=current(target);target.shape=shape(target);targets.set(id,target);
        if(manualUpload){uploads.push({id,question,filename,size:node.files?.[0]?.size||0,snapshot:target.shape});if(filename){diagnostics.answered++;continue;}}
        const employment=root.chrome?.runtime?.getManifest?.().side_panel?.default_path==='sidebar/sidebar.html'&&node.closest('[data-sqc-resume-group],[data-sqc-experience],.experience-item,.work-experience-item,[data-employment-row],[data-automation-id^="workExperience-"]');
        const help=clean([manualUpload?'File upload: attach the original requested document manually.':employment?'Resume employment field: review the mapped resume row; do not guess a company, title or date.':customSelect&&!target.options?'Custom dropdown: choices are not available in the DOM. Answer for manual selection; do not invent available options.':'',described(node),described(container)].join(' ')).slice(0,2000);
        const limits={};if(type==='number')for(const name of ['min','max','step'])if(node.getAttribute(name)!==null)limits[name]=node.getAttribute(name);
        questions.push({id,question,type,...(target.options?{options:target.options}:{}),...(node.maxLength>0?{maxLength:Math.min(node.maxLength,50000)}:{}),...limits,...(help?{help}:{}),required:required(nodes,container),snapshot:target.shape});
      }
      for(const context of roots(scope))for(const group of root.SQCFormState?.attachments(context)||[]){
        if(!group.filename)continue;
        const key=value=>questionText(value).replace(/[^a-z0-9]/gi,'').toLowerCase();
        let field=fields.find(field=>field.type==='file'&&key(field.question)===key(group.question));
        if(!field){let id=ids.get(group.anchor);if(!id){id='dom_'+root.crypto.randomUUID();ids.set(group.anchor,id);}field={id,question:group.question,type:'file',required:false};fields.push(field);}
        field.answer=group.filename;field.filled=true;field.manual=false;
        const index=questions.findIndex(question=>question.id===field.id);if(index>=0)questions.splice(index,1);
        const upload=uploads.find(upload=>upload.id===field.id);if(upload)upload.filename=group.filename;
        else uploads.push({id:field.id,question:group.question,filename:group.filename,size:0,snapshot:'portal-chip',readable:false});
      }
      return {url:doc.location.href,questions,fields,uploads,diagnostics};
    }
    function fill(message){
      if(message.manual===false){const active=doc.activeElement;if(active?.matches?.('select,input,textarea,[role=combobox],[contenteditable=true]')||Array.from(doc.querySelectorAll('[role=combobox][aria-expanded=true]')).some(node=>node.getClientRects().length>0))throw new Error('You are editing a field. Finish your selection, then use Fill answer when ready.');}
      const target=targets.get(message.id);
      if(!target || message.url!==doc.location.href || target.url!==doc.location.href)throw new Error('The application page changed. Detect this question again.');
      if(root.chrome?.runtime?.getManifest?.().side_panel?.default_path==='sidebar/sidebar.html'&&root.JobFormExtractor?.isApplicationControl&&!root.JobFormExtractor.isApplicationControl(target.nodes[0]))throw new Error('This control is outside the application form. Career searches, filters and site navigation are not filled.');
      if(message.question!==target.question || message.snapshot!==target.shape || shape(target)!==target.shape || !target.nodes.every(visible) || current(target)!==target.initial)throw new Error('The field, options or your selection changed. Review this answer manually.');
      if(target.manualUpload)throw new Error('Attach the original document using the application upload control.');
      if(target.customSelect && target.options){
        const option=customOptions(target.nodes[0]).find(node=>text(node)===message.answer);
        if(!option || option.closest('a[href],button:not([type="button"]),input[type="submit"],input[type="reset"]'))throw new Error('The dropdown options changed. Select the answer manually.');
        const node=target.nodes[0];option.click();
        if(option.getAttribute('aria-selected')!=='true' && ![node.getAttribute('aria-valuetext'),node.value,node.querySelector('input')?.value,text(node)].some(value=>clean(value)===message.answer))throw new Error('The custom dropdown did not confirm the selection. Review it manually.');
        target.initial=current(target);return {success:true};
      }
      if(!['checkbox','radio','select'].includes(target.type)){
        const node=target.nodes[0],value=String(message.answer||'');
        if(!value.trim())throw new Error('Enter an answer first.');
        if(target.customSelect)throw new Error('Select this custom dropdown option manually. The exact choices are not available.');
        if(node.isContentEditable){
          if(node.querySelectorAll('*:not(br)').length)throw new Error('This rich-text editor needs manual pasting.');
          node.textContent=value;
        }else{
          const prototype=node.tagName==='TEXTAREA'?doc.defaultView.HTMLTextAreaElement.prototype:node.tagName==='INPUT'?doc.defaultView.HTMLInputElement.prototype:null;
          if(!prototype)throw new Error('This custom field needs manual pasting.');
          if(node.maxLength>0&&value.length>node.maxLength)throw new Error('Shorten this answer to fit the field character limit.');
          const setter=Object.getOwnPropertyDescriptor(prototype,'value').set,before=node.value;setter.call(node,value);
          if(node.value!==value || node.validity && !node.validity.valid){setter.call(node,before);throw new Error('The answer does not fit this field format or limits. Review it manually.');}
        }
        for(const event of ['input','change'])node.dispatchEvent(new doc.defaultView.Event(event,{bubbles:true,composed:true}));
        target.initial=current(target);return {success:true};
      }
      const values=target.type==='checkbox'?(Array.isArray(message.answer)?message.answer:String(message.answer||'').split('\n').filter(Boolean)):[message.answer];
      if(values.some(value=>!target.options.includes(value)) || target.type!=='checkbox'&&values.length!==1)throw new Error('The answer does not match the actual choices.');
      for(const node of target.nodes){
        if(!node.isConnected || doc.location.href!==target.url)throw new Error('The page changed during selection. Review this field.');
        if(node.tagName==='SELECT'){
          const descriptor=Object.getOwnPropertyDescriptor(doc.defaultView.HTMLSelectElement.prototype,'value');
          if(node.multiple){for(const option of node.options)option.selected=values.includes(text(option));}
          else {const match=Array.from(node.options).find(o=>text(o)===values[0]&&!o.disabled);if(!match)throw new Error('This option is unavailable.');descriptor.set.call(node,match.value);}
          for(const event of ['input','change'])node.dispatchEvent(new doc.defaultView.Event(event,{bubbles:true,composed:true}));
        }else{
          const wanted=values.includes(option(node));if(checked(node)===wanted)continue;
          if(node.closest('a[href]') || node.tagName==='BUTTON'&&node.type!=='button')throw new Error('This custom option cannot be selected safely. Select it manually.');
          node.click();if(checked(node)!==wanted)throw new Error('The custom choice did not accept the selection. Select it manually.');
        }
      }
      target.initial=current(target);return {success:true};
    }
    function attach(message){
      const target=targets.get(message.id),node=target?.nodes[0];
      if(!target?.manualUpload||!node||node.type!=='file'||message.url!==doc.location.href||target.url!==doc.location.href||message.question!==target.question||message.snapshot!==target.shape||shape(target)!==target.shape||!visible(node)||current(target)!==target.initial)throw new Error('The upload field changed. Detect it again before attaching.');
      if(!/\b(?:resume|cv|curriculum vitae)\b/i.test(target.question)||/cover letter/i.test(target.question))throw new Error('Choose a Resume or CV upload field for this document.');
      if(node.files.length)throw new Error('A file is already attached. Remove it manually before replacing it.');
      const file=message.file,extension=file?.filename?.match(/\.(pdf|docx|txt)$/i)?.[0]?.toLowerCase();
      const match=String(file?.dataUrl||'').match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/);
      if(!extension||!match||!match[2]||match[2].length>14*1024*1024)throw new Error('The original resume file is invalid. Upload it again.');
      const accept=node.accept.toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
      if(accept.length&&!accept.some(value=>value===extension||value===file.mimeType||value==='*/*'||value.endsWith('/*')&&file.mimeType.startsWith(value.slice(0,-1))))throw new Error('This portal does not accept the uploaded file format. Upload a supported original resume to the extension.');
      const bytes=Uint8Array.from(doc.defaultView.atob(match[2]),char=>char.charCodeAt(0));
      if(!bytes.length||bytes.length>10*1024*1024)throw new Error('The resume exceeds the supported file size.');
      if(file.uploadKey&&root.SQCFormState?.claimUpload(file.uploadKey,doc,message.manual===true)===false)throw new Error('This resume was already sent to the upload control. Check the portal upload status; use Attach to page for an explicit retry.');
      const transfer=new doc.defaultView.DataTransfer();transfer.items.add(new doc.defaultView.File([bytes],file.filename,{type:file.mimeType}));
      node.files=transfer.files;
      for(const event of ['input','change'])node.dispatchEvent(new doc.defaultView.Event(event,{bubbles:true,composed:true}));
      if(!node.files.length)return {success:true,queued:true,filename:file.filename};
      if(node.files[0].name!==file.filename)throw new Error('The portal did not accept the attachment. Use its upload control manually.');
      target.initial=current(target);return {success:true,filename:file.filename};
    }
    async function readUpload(message){
      const target=targets.get(message.id),node=target?.nodes[0],file=node?.files?.[0];
      if(!target?.manualUpload||!file||message.url!==doc.location.href||target.url!==doc.location.href||message.question!==target.question||message.snapshot!==target.shape||shape(target)!==target.shape||!visible(node)||!/resume|\bcv\b|curriculum/i.test(target.question)||/cover.?letter/i.test(target.question))throw new Error('Detect the currently attached Resume / CV again.');
      if(file.size>10*1024*1024||! /\.(pdf|docx|txt)$/i.test(file.name))throw new Error('The attached file must be a PDF, DOCX or TXT up to 10 MB.');
      const bytes=new Uint8Array(await file.arrayBuffer());if(node.files[0]!==file)throw new Error('The portal attachment changed while reading it.');
      let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
      return {success:true,file:{filename:file.name,mimeType:file.type||'application/octet-stream',dataUrl:'data:'+(file.type||'application/octet-stream')+';base64,'+doc.defaultView.btoa(binary)}};
    }
    async function normalizeUpload(message){
      const original=await readUpload(message),node=targets.get(message.id).nodes[0],file=node.files[0];
      if(original.file.dataUrl.split(',')[1]!==String(message.file?.dataUrl||'').split(',')[1])throw new Error('The portal file differs from the selected job resume. It was not replaced.');
      const extension=file.name.match(/\.(pdf|docx|txt)$/i)?.[0];if(!extension||!message.file.filename.toLowerCase().endsWith(extension.toLowerCase()))throw new Error('The file format must remain unchanged.');
      if(file.name===message.file.filename)return {success:true,filename:file.name};
      const transfer=new doc.defaultView.DataTransfer();transfer.items.add(new doc.defaultView.File([file],message.file.filename,{type:file.type,lastModified:file.lastModified}));node.files=transfer.files;
      for(const event of ['input','change'])node.dispatchEvent(new doc.defaultView.Event(event,{bubbles:true,composed:true}));
      return {success:true,filename:node.files[0].name};
    }
    return {scan,fill,attach,readUpload,normalizeUpload};
  }
  if(root.document && root.SQCQAFormBridge?.version!==version){
    const bridge=root.SQCQAFormBridge=create(root.document);bridge.version=version;
    root.chrome?.runtime?.onMessage?.addListener((message,sender,reply)=>{
      if(root.SQCQAFormBridge!==bridge)return;
      if(sender.id!==root.chrome.runtime.id || !['QA_FORM_FILL','QA_FORM_ATTACH_RESUME','QA_FORM_READ_RESUME','QA_FORM_NORMALIZE_RESUME'].includes(message.type))return;
      if(['QA_FORM_READ_RESUME','QA_FORM_NORMALIZE_RESUME'].includes(message.type)){(message.type==='QA_FORM_READ_RESUME'?bridge.readUpload(message):bridge.normalizeUpload(message)).then(reply).catch(error=>reply({success:false,error:error.message}));return true;}
      try{reply(message.type==='QA_FORM_ATTACH_RESUME'?root.SQCQAFormBridge.attach(message):root.SQCQAFormBridge.fill(message));}catch(error){reply({success:false,error:error.message});}
    });
  }
  if(typeof module!=='undefined')module.exports={create,attention};
})(globalThis);
