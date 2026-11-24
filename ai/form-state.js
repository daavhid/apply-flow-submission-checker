(function(root){
  'use strict';
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const uploadAttempts=root.__SQC_UPLOAD_ATTEMPTS||(root.__SQC_UPLOAD_ATTEMPTS=new WeakMap());
  function claimUpload(key,doc,manual=false){if(!key||!doc)return true;let seen=uploadAttempts.get(doc);if(!seen){seen=new Set();uploadAttempts.set(doc,seen);}if(!manual&&seen.has(key))return false;seen.add(key);return true;}
  const empty=value=>!clean(value)||/^(?:select(?: an? (?:item|option)| one)?|choose(?: an? option| one)?|please select|search|[-–—]+)(?:\s*[.\u2026]*)?$/i.test(clean(value));
  const shown=node=>node?.isConnected&&!node.closest('[hidden],[inert],[aria-hidden="true"]')&&node.getClientRects().length>0&&node.ownerDocument.defaultView.getComputedStyle(node).visibility!=='hidden';
  function selected(node){
    const explicit=clean(node.getAttribute('aria-valuetext'));if(!empty(explicit))return explicit;
    // React Select keeps the committed value beside its empty search input.
    // Search text and hidden option IDs are not committed answers.
    for(let container=node,depth=0;container&&depth<5;container=container.parentElement,depth++){
      if(container!==node&&container.querySelectorAll('[role="combobox"]').length>1)break;
      const values=Array.from(container.querySelectorAll('[class*="singleValue"],[class*="single-value"],[class*="multiValue__label"],[class*="multi-value__label"],.select2-selection__rendered,.selected-value,.ant-select-selection-item,.ng-value-label,[data-selected-value]'))
        .filter(shown).map(el=>clean(el.textContent)).filter(value=>!empty(value));
      if(values.length)return [...new Set(values)].join('\n');
      if(container.matches('fieldset,form,[data-question],.form-field,.field,.application-question,.question'))break;
    }
    if(node.tagName==='BUTTON'&&!empty(node.textContent))return clean(node.textContent);
    return '';
  }
  function uploaded(node){
    if(node.files?.length)return node.files[0].name;
    for(let container=node.parentElement,depth=0;container&&container.tagName!=='FORM'&&depth<6;container=container.parentElement,depth++){
      if(container.querySelectorAll('input[type=file]').length>1)break;
      if(container.closest('[hidden],[inert],[aria-hidden="true"]'))continue;
      for(const chip of container.querySelectorAll('[class*="file"],[class*="File"],[data-automation-id*="uploaded"],a,span,p')){
        const value=clean(chip.textContent);
        if(shown(chip)&&value.length<=200&&/^[^<>\n]+\.(?:pdf|docx?|rtf|txt|odt)\s*$/i.test(value))return value;
      }
    }
    return '';
  }
  function attachments(scope){
    const filename=node=>{
      if(!shown(node))return '';
      const name=value=>{value=clean(value);const match=/^([^<>]{1,200}\.(?:pdf|docx?|rtf|txt|odt))(?:\s*[×✕✖])?$/i.exec(value);return match?match[1]:'';};
      for(const attribute of ['title','download','data-file-name','data-filename','aria-label']){const value=name(node.getAttribute(attribute));if(value)return value;}
      const copy=node.cloneNode(true);copy.querySelectorAll('button,[role=button],svg,input,textarea,select').forEach(child=>child.remove());
      return name(copy.textContent);
    };
    const kind=node=>clean(node.textContent).replace(/[\s*:]+$/g,'');
    const isHeading=node=>/^(?:resume(?:\s*\/\s*cv)?|cv|curriculum vitae|cover letter)$/i.test(kind(node));
    const result=[];
    const fileIn=area=>{
      const native=area.querySelector('input[type=file]');if(native?.files?.length)return native.files[0].name;
      return Array.from(area.querySelectorAll('[title],[download],[data-file-name],[data-filename]')).map(filename).find(Boolean)||
        Array.from(area.querySelectorAll('[role="button"],button,span,a,p,div')).map(filename).find(Boolean)||filename(area)||'';
    };
    // Rippling labels its drop area with several ARIA IDs (file count + CV).
    // Its filename is direct text inside a clickable Chip, not a file-name span.
    for(const area of scope.querySelectorAll('[data-testid="resume"],[data-testid="cover-letter"],label[aria-labelledby]')){
      if(!shown(area)||area.closest('.sqc-root,#sqc-hud-container,#sqc-modal-overlay'))continue;
      const heading=String(area.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>area.ownerDocument.getElementById(id)).find(node=>node&&isHeading(node));
      const question=heading?kind(heading):area.getAttribute('data-testid')==='resume'?'Resume / CV':'';
      if(question)result.push({anchor:heading||area,question,filename:fileIn(area)});
    }
    for(const heading of scope.querySelectorAll('label,legend,h2,h3,h4,strong,b,span,p,div,[data-automation-id="formLabel"],[class*="label"]')){
      if(!isHeading(heading)||!shown(heading)||heading.closest('.sqc-root,#sqc-hud-container,#sqc-modal-overlay'))continue;
      if(result.some(group=>group.anchor===heading))continue;
      let name='';
      // Greenhouse may remove its file input after upload. Read the visible file
      // row following its label, stopping before the next upload/question label.
      for(let anchor=heading,depth=0;anchor&&depth<4&&!name;anchor=anchor.parentElement,depth++){
        if(anchor===scope.body||anchor.tagName==='FORM'||anchor.tagName==='BODY')break;
        for(let row=anchor.nextElementSibling;row;row=row.nextElementSibling){
          const uploadLabel=row.matches('label')&&Boolean(row.querySelector('input[type=file]'));
          if(row.matches('label,legend,h2,h3,h4')&&!uploadLabel||Array.from(row.querySelectorAll('label,legend,strong,b')).some(isHeading))break;
          name=fileIn(row);
          if(name)break;
          // Do not read past an unrelated application field/control.
          if(row.querySelector('input:not([type=file]),textarea,select,[role=combobox]'))break;
        }
      }
      if(!name){const parent=heading.parentElement;if(parent?.querySelectorAll('input[type=file]').length===1){const input=parent.querySelector('input[type=file]');name=uploaded(input);}}
      result.push({anchor:heading,question:kind(heading),filename:name});
    }
    return result;
  }
  root.SQCFormState={selected,uploaded,attachments,empty,claimUpload};if(typeof module!=='undefined')module.exports=root.SQCFormState;
})(globalThis);
