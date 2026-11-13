/* Snapshot exact DOM controls before requesting answers; never use fuzzy matching for API replies. */
(function(root) {
  'use strict';
  const fieldIds = new WeakMap();
  const ignore = '.sqc-root, #sqc-hud-container, #sqc-modal-overlay';
  const clean = value => String(value || '').replace(/\s+/g,' ').trim();
  const placeholder = value => !clean(value) || /^(?:[-–—\s]*(?:select|choose|please select)(?:\s+(?:one|an option|option))?[.\s…-]*|no file chosen|unanswered)$/i.test(clean(value));
  const identity = /^(?:first name|last name|full name|legal name|email(?: address)?|phone(?: number)?|address|city|state|province|country|zip(?: code)?|postal code|linkedin(?: url)?|github(?: url)?|website|portfolio|resume(?: text)?|cv|technical skills|skills)$/i;
  const privateOrConsent = /password|social security|passport|date of birth|birth date|verification code|one.time code|captcha|agree to|privacy policy|terms (?:and|of|&)|consent to/i;
  function visible(node) {
    if (!node?.isConnected || node.disabled || node.readOnly || node.closest(ignore+', [hidden], [inert], [aria-hidden="true"]') || !node.getClientRects().length) return false;
    return node.ownerDocument.defaultView.getComputedStyle(node).visibility !== 'hidden';
  }
  const labelFor = node => clean(Array.from(node.labels || []).map(label => label.textContent).join(' ') || node.getAttribute('aria-label'));
  function radioNodes(node) {
    if (!node.name) return [node];
    return Array.from(node.getRootNode().querySelectorAll('input[type="radio"]')).filter(radio => radio.name === node.name && radio.form === node.form);
  }
  function nodesFor(node,type) { return type === 'radio' ? radioNodes(node) : [node]; }
  function choices(nodes,type) {
    if (type === 'select') return Array.from(nodes[0].options).filter(option => !option.disabled && !option.hidden && option.value !== '' && !placeholder(option.textContent)).map(option => clean(option.textContent));
    if (type === 'radio') return nodes.filter(node => !node.disabled).map(node => labelFor(node) || node.value);
    if (type === 'checkbox') return ['Yes','No'];
    return undefined;
  }
  const state = (nodes,type) => JSON.stringify(nodes.map(node => type === 'radio' || type === 'checkbox' ? node.checked : node.value));
  const shape = (nodes,type) => JSON.stringify({labels:nodes.map(labelFor),options:choices(nodes,type),limits:nodes.map(n => [n.getAttribute('maxlength'),n.getAttribute('min'),n.getAttribute('max'),n.getAttribute('step')])});
  function binding(settings) {
    const c=settings?.verifiedContext;
    return JSON.stringify([root.SQCScreeningPolicy.stamp(c),c?.applierId,c?.profileAssignmentId,c?.profileAssignmentVersion]);
  }
  function capture(entries,settings = root.__SQC_CONTEXT_SETTINGS,url = root.location.href) {
    if (!root.SQCContextPolicy?.ready(settings,url)) throw new Error('Verify the ApplyFlow assignment before answering questions.');
    const targets=new Map(), questions=[], seen=new Set();
    for (const entry of entries || []) {
      let node=entry?.element;
      const question=clean(entry?.label);
      if(node?.type==='radio' && !visible(node)) node=radioNodes(node).find(visible);
      if (!visible(node) || !question || question.length > 4000 || identity.test(question) || privateOrConsent.test(question)) continue;
      const type=node.tagName === 'SELECT' ? 'select' : node.tagName === 'TEXTAREA' ? 'textarea' : node.type;
      if (!['text','number','textarea','select','radio','checkbox'].includes(type)) continue;
      const nodes=nodesFor(node,type), anchor=nodes[0];
      if (seen.has(anchor)) continue; seen.add(anchor);
      if (type === 'radio' && nodes.some(radio => radio.checked)) continue;
      if (type === 'checkbox' && node.checked) continue;
      if (!['radio','checkbox'].includes(type) && !placeholder(type === 'select' ? node.selectedOptions[0]?.textContent : node.value)) continue;
      if (!(entry.required || entry.is_required || node.required || type === 'textarea' || /\?|^(?:why|how|what|do you|are you|have you|will you|can you|describe|tell us|years|experience)/i.test(question))) continue;
      const options=choices(nodes,type);
      if (options && (!options.length || options.length > 100 || new Set(options).size !== options.length)) continue;
      let id=fieldIds.get(anchor); if (!id) {id='sqc_'+crypto.randomUUID();fieldIds.set(anchor,id);}
      const item={id,question,type,required:Boolean(entry.required || entry.is_required || node.required)};
      if (options) item.options=options;
      if (node.maxLength > 0) item.maxLength=Math.min(node.maxLength,50000);
      questions.push(item);targets.set(id,{nodes,type,initial:state(nodes,type),shape:shape(nodes,type)});
      if (questions.length===100) break;
    }
    const c=settings.verifiedContext;
    return {requestId:crypto.randomUUID(),context:{...root.SQCScreeningPolicy.stamp(c),applierId:c.applierId,
      profileAssignmentId:c.profileAssignmentId,profileAssignmentVersion:c.profileAssignmentVersion},binding:binding(settings),url,questions,targets};
  }
  function mark(node,status,reason='') {
    node.classList.remove('sqc-ai-filled','sqc-ai-needs-input');node.classList.add(status==='filled'?'sqc-ai-filled':'sqc-ai-needs-input');
    node.dataset.sqcAiStatus=status;if(reason) node.dataset.sqcAiReason=reason;else delete node.dataset.sqcAiReason;
  }
  function emit(node) {
    const view=node.ownerDocument.defaultView;
    for (const type of ['input','change','blur','focusout']) node.dispatchEvent(new view.Event(type,{bubbles:true,composed:true}));
  }
  function setValue(node,value) {
    const view=node.ownerDocument.defaultView;
    const proto=node.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : node.tagName === 'SELECT' ? view.HTMLSelectElement.prototype : view.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);
  }
  function fill(target,answer) {
    const {nodes,type}=target,node=nodes[0];
    if (type==='select') {
      const option=Array.from(node.options).find(option=>!option.disabled && clean(option.textContent)===answer);
      if (!option) return false;setValue(node,option.value);
    } else if (type==='radio') {
      const match=nodes.find(radio=>!radio.disabled && (labelFor(radio)||radio.value)===answer);
      if(!match)return false;match.click();if(!match.isConnected || !match.checked)return false;emit(match);return true;
    } else if(type==='checkbox') {
      if(!['Yes','No'].includes(answer))return false;
      if(node.checked !== (answer==='Yes'))node.click();if(node.checked !== (answer==='Yes'))return false;
    } else {
      if(type==='number' && (!answer.trim() || !Number.isFinite(Number(answer))))return false;
      const before=node.value;setValue(node,answer);
      if(node.value!==answer || (type==='number' && (node.validity.badInput || node.validity.rangeUnderflow || node.validity.rangeOverflow || node.validity.stepMismatch))) {setValue(node,before);return false;}
    }
    emit(node);return true;
  }
  function apply(result,batch,settings=root.__SQC_CONTEXT_SETTINGS,url=root.location.href) {
    if(url!==batch.url || binding(settings)!==batch.binding || !root.SQCContextPolicy?.ready(settings,url)) throw new Error('The application changed while answers were generated. Refresh and try again.');
    const answers=root.SQCScreeningPolicy.answers(result,{...batch.context,requestId:batch.requestId},batch.questions);
    let count=0,needsInput=0,skipped=0;
    for(const answer of answers) {
      if(binding(root.__SQC_CONTEXT_SETTINGS)!==batch.binding || root.location.href!==batch.url ||
          !root.SQCContextPolicy?.ready(root.__SQC_CONTEXT_SETTINGS,root.location.href)) {skipped++;continue;}
      const target=batch.targets.get(answer.id);
      if(!target || !target.nodes.every(node=>node.isConnected) || !target.nodes.filter(node=>!node.disabled).every(visible) ||
          target.nodes.every(node=>node.disabled) || state(target.nodes,target.type)!==target.initial || shape(target.nodes,target.type)!==target.shape) {skipped++;continue;}
      if(answer.status==='NEEDS_INPUT') {needsInput++;target.nodes.forEach(node=>mark(node,'needs-input',answer.reason));continue;}
      if(fill(target,answer.answer)) {count++;target.nodes.forEach(node=>mark(node,'filled'));}
      else {needsInput++;target.nodes.forEach(node=>mark(node,'needs-input','This answer does not fit the current field.'));}
    }
    return {success:true,count,needsInput,skipped};
  }
  function applyReviewed(result,batch,id,text,settings=root.__SQC_CONTEXT_SETTINGS,url=root.location.href) {
    const question=batch.questions.find(q=>q.id===id),target=batch.targets.get(id);
    if(!question || !target) return {success:false,count:0,needsInput:0,skipped:1};
    // Clicking Fill explicitly approves replacement; shape, node, and context checks still apply.
    const reviewed={...batch,questions:[question],targets:new Map([[id,{...target,initial:state(target.nodes,target.type)}]])};
    return apply({...result,answers:[{id,status:'ANSWERED',answer:text}]},reviewed,settings,url);
  }
  root.SQCScreening={capture,apply,applyReviewed};
})(typeof window!=='undefined'?window:globalThis);
