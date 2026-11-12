'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  const el = id => document.getElementById(id);
  const send = message => chrome.runtime.sendMessage(message);
  const model = SQCSettings;
  const icons = {
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    sliders: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
    link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    sparkles: '<path d="m12 3-2.5 6.5L3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3Z"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${icons[name] || icons.shield}</svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const initials = name => String(name || 'AF').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const time = value => { const d = new Date(value); return value && Number.isFinite(d.getTime()) ? d.toLocaleString([], {month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Not available'; };
  let config = null, saved, draft, history = [], historyLoaded = false, saving = false, syncing = false, loadError = '';
  let search = '', filter = 'all', selectedRecord = null, checkedAt = null, historyError = '';
  const section = () => ['account', 'history'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'preferences';
  const dirty = () => Boolean(draft && JSON.stringify(draft) !== JSON.stringify(saved));

  function notice(message, tone = 'success') {
    const node = el('page-notice'); node.textContent = message; node.dataset.tone = tone; node.hidden = !message;
    if (message && tone === 'error') node.scrollIntoView({block:'nearest'});
  }
  async function request(message) {
    const result = await send(message);
    if (!result?.success) throw new Error(result?.error || 'The extension could not complete this request.');
    return result;
  }
  async function openWorkspace() {
    try { await request({type:'OPEN_SETUP'}); }
    catch (error) { notice(error.message, 'error'); }
  }
  function updateSidebar() {
    const i = config?.integration || {}, name = i.applier?.name || 'Your workspace';
    el('sidebar-account').innerHTML = `<span class="sidebar-avatar">${escape(initials(name))}</span><span><strong>${escape(name)}</strong><small>${escape(i.applier?.email || (i.apiOrigin ? 'Sign-in required' : 'Setup not completed'))}</small></span>`;
    el('history-count').textContent = history.length;
    el('history-count').hidden = !historyLoaded || !history.length;
    document.querySelectorAll('[data-section]').forEach(link => {
      if (link.dataset.section === section()) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
  }
  function updateSaveBar() {
    const changed = dirty();
    el('save-bar').hidden = !draft || (section() !== 'preferences' && !changed);
    el('save-preferences').disabled = !changed || saving;
    el('discard-changes').disabled = !changed || saving;
    el('discard-changes').hidden = !changed;
    el('save-state').innerHTML = saving ? '<span class="loader"></span>Saving your preferences…' : changed ? '<span class="unsaved-dot"></span><span>Unsaved changes<small>Apply them to this browser when you’re ready.</small></span>' : `${icon('check')}<span>All changes saved<small>Preferences are stored in this Chrome profile.</small></span>`;
    el('save-bar').classList.toggle('has-changes',changed);
  }
  function pageHeading(label, title, description, action = '') {
    return `<header class="section-header"><div><p class="eyebrow">${label}</p><h1 id="section-heading" tabindex="-1">${title}</h1><p>${description}</p></div>${action}</header>`;
  }
  function panelHeading(name, title, description) {
    return `<div class="settings-panel-heading"><span class="section-icon">${icon(name)}</span><div><h2>${title}</h2><p>${description}</p></div></div>`;
  }
  function toggle(key, label, description, dependent = false) {
    return `<label class="preference-row ${dependent?'dependent-row':''}" for="pref-${key}"><span><strong>${label}</strong><small>${description}</small></span><input class="switch" type="checkbox" id="pref-${key}" data-pref="${key}" ${draft[key]?'checked':''}></label>`;
  }
  function profileSummary() {
    const i = config.integration || {}, p = config.activeProfile;
    return `<aside class="settings-companion"><div class="companion-top">${icon('shield')}<span>YOUR WORKSPACE</span></div><div class="companion-identity"><span class="sidebar-avatar">${escape(initials(p?.fullName || i.applier?.name || 'AF'))}</span><strong>${escape(p?.fullName || (i.applier ? 'Awaiting assignment' : 'Finish your setup'))}</strong><p>${p ? 'Your assigned candidate' : i.applier ? 'Your account is connected. Your candidate assignment will appear here.' : 'Sign in and sync your assigned candidate to start applying.'}</p></div><div class="companion-meta"><span>Applier</span><strong>${escape(i.applier?.name || 'Not signed in')}</strong></div><div class="companion-note">${icon('lock')}<p>Candidate and job assignments are verified by ApplyFlow. Both validation modes require a verified application.</p></div><button type="button" data-action="account" class="text-button companion-link">View account &amp; connection${icon('arrow')}</button></aside>`;
  }
  function renderPreferences() {
    return `${pageHeading('PREFERENCES','Your workspace. Your workflow.','Fine-tune how the gatekeeper supports you, from the first field to the final submission.')}<div class="preferences-layout"><form id="preferences-form" class="preferences-stack"><section class="settings-panel">${panelHeading('shield','Application protection','Choose how validation works on verified job portals.')}<fieldset class="validation-options"><legend class="sr-only">Validation mode</legend><label class="validation-option"><input type="radio" name="interceptionMode" data-pref="interceptionMode" value="active" ${draft.interceptionMode==='active'?'checked':''}><span class="option-icon">${icon('shield')}</span><strong>Active gate <span class="recommended">Recommended</span></strong><small>Resolve blocking issues before submitting an application.</small><span class="option-indicator">${icon('check')}</span></label><label class="validation-option"><input type="radio" name="interceptionMode" data-pref="interceptionMode" value="audit" ${draft.interceptionMode==='audit'?'checked':''}><span class="option-icon">${icon('activity')}</span><strong>Passive audit</strong><small>Review and record issues without blocking submission.</small><span class="option-indicator">${icon('check')}</span></label></fieldset><div class="settings-divider"></div>${toggle('detectCaptchaAndAlert','CAPTCHA alerts','Let the HUD flag a CAPTCHA that needs your attention.')}</section><section class="settings-panel">${panelHeading('sparkles','Verified autofill','Fill supported fields with details from your assigned candidate.')}${toggle('autoAutofillOnPageLoad','Autofill on page load','Fill verified details when an assigned application opens.')}<div id="autofill-details" class="nested-preferences">${toggle('autoFillDemographics','Demographic responses','Use only demographic details provided in the verified profile.',true)}${toggle('autoFillCompensation','Compensation details','Use the candidate’s verified compensation information.',true)}${toggle('autoFillCustomQuestions','Screening responses','Use approved answers from the assigned profile.',true)}</div><p class="panel-footnote">Unknown details are left empty. Existing entries are preserved.</p></section><section class="settings-panel">${panelHeading('sliders','Screening &amp; sync','Set your answer threshold and live feedback preference.')}<div class="preference-row"><label for="pref-minScreeningLength"><strong>Minimum screening answer length</strong><small>Flag qualitative answers shorter than this number of characters.</small></label><div class="number-control"><input type="number" id="pref-minScreeningLength" data-pref="minScreeningLength" min="1" max="500" step="1" value="${draft.minScreeningLength}" required><span>characters</span></div></div>${toggle('streamLiveEvents','Sync live application feedback','Send verified application progress to your configured ApplyFlow server.')}</section></form>${profileSummary()}</div>`;
  }
  function accountState() {
    const i = config.integration || {};
    if (!i.apiOrigin) return {label:'Not configured',tone:'neutral'};
    if (['UNAVAILABLE','INVALID_CONTEXT','FORBIDDEN'].includes(i.state)) return {label:'Needs attention',tone:'warning'};
    if (!i.applier) return {label:'Sign-in required',tone:'warning'};
    return {label:'Account connected',tone:'success'};
  }
  function renderAccount() {
    const i = config.integration || {}, p = config.activeProfile, state = accountState();
    return `${pageHeading('ACCOUNT &amp; CONNECTION','Everything connected. One workspace.','Your applier account, assigned candidate, and saved ApplyFlow server.',`<button class="button secondary" type="button" data-action="sync" ${syncing?'disabled':''}>${icon('refresh')}${syncing?'Checking…':'Sync account'}</button>`)}<div class="account-grid"><section class="settings-panel">${panelHeading('user','Your applier account','The account signed in to this extension.')}<div class="account-person"><span class="account-avatar">${escape(initials(i.applier?.name || 'AF'))}</span><div><h3>${escape(i.applier?.name || 'Sign in to your workspace')}</h3><p>${escape(i.applier?.email || 'Connect with your ApplyFlow email and password.')}</p></div></div><span class="result-badge" data-tone="${state.tone}"><span class="status-dot"></span>${state.label}</span>${!i.applier?'<button type="button" class="button secondary panel-action" data-action="workspace">Continue setup</button>':''}</section><section class="settings-panel assignment-panel">${panelHeading('shield','Assigned candidate','Synced from your ApplyFlow account.')}<div class="account-person"><span class="account-avatar candidate-avatar">${p?escape(initials(p.fullName)):icon('user')}</span><div><h3>${escape(p?.fullName || 'Waiting for an assignment')}</h3><p>${escape(p?.primaryEmail || p?.email || (p?'Verified candidate profile':'No active candidate profile has been returned.'))}</p></div></div><span class="managed-label">${icon('lock')}Managed in ApplyFlow</span></section><section class="settings-panel server-panel">${panelHeading('link','Saved backend URL','Used for sign-in, assignment verification, and application sync.')}<div class="saved-url"><span class="server-symbol">${icon('link')}</span><code>${escape(i.apiOrigin || 'No server configured')}</code>${i.apiOrigin?'<button type="button" class="text-button" data-action="copy-url">Copy URL</button>':''}</div><div class="server-details"><span>${icon('check')}Saved in this Chrome profile</span><span>Last checked ${escape(checkedAt ? time(checkedAt) : '—')}</span></div><div class="connection-note"><p>Your backend URL stays saved across browser restarts and sign-out. ApplyFlow can be open in another Chrome profile.</p><button type="button" class="text-button" data-action="workspace">${i.apiOrigin?'Manage connection':'Connect workspace'}${icon('arrow')}</button></div></section></div><section class="settings-panel session-panel">${panelHeading('lock','Account security','Manage your password and sign-in from the protected workspace.')}<div class="session-actions"><button class="button secondary" type="button" data-action="workspace">Open account workspace${icon('arrow')}</button>${i.applier?'<button class="text-button danger" type="button" data-action="signout">Sign out of this extension</button>':''}</div></section>${i.message && state.tone==='warning'?`<div class="inline-note">${icon('shield')}<p>${escape(i.message)}</p></div>`:''}`;
  }
  const filtered = () => model.historyRows(history,search,filter);
  function renderHistory() {
    const acknowledged = history.filter(r=>r.delivery_status==='ACKNOWLEDGED').length;
    return `${pageHeading('AUDIT HISTORY','Every application leaves a clear trail.','Review the submission events saved by this extension and their ApplyFlow delivery status.',`<button class="button secondary" type="button" data-action="refresh-history">${icon('refresh')}Refresh history</button>`)}<div class="history-stats"><div><span>Local records</span><strong>${history.length}</strong></div><div><span>Acknowledged by ApplyFlow</span><strong>${acknowledged}</strong></div><div><span>Latest recorded event</span><strong class="latest-date">${history[0]?escape(time(history[0].timestamp)):'No events yet'}</strong></div></div><section class="settings-panel audit-panel"><div class="audit-toolbar"><div class="search-field">${icon('search')}<label for="history-search" class="sr-only">Search audit history</label><input type="search" id="history-search" placeholder="Search candidate, company, or role…" value="${escape(search)}"></div><label for="history-filter" class="sr-only">Filter audit results</label><select id="history-filter"><option value="all" ${filter==='all'?'selected':''}>All results</option><option value="passed" ${filter==='passed'?'selected':''}>Passed</option><option value="attention" ${filter==='attention'?'selected':''}>Needs attention</option></select><details class="export-menu"><summary class="button secondary">${icon('download')}Export</summary><div><button type="button" data-action="export-json">Download JSON</button><button type="button" data-action="export-csv">Download CSV</button></div></details></div><div id="audit-results">${renderHistoryRows()}</div></section><div class="history-footer"><p>These records are stored in this browser. Your team’s application records remain in ApplyFlow.</p>${history.length?'<button type="button" class="text-button danger" data-action="clear-history">Clear local history</button>':''}</div>`;
  }
  function renderHistoryRows() {
    const rows = filtered();
    if (!rows.length) return `<div class="audit-empty"><span>${icon('activity')}</span><h2>${history.length?'No matching records.':'Your application history starts here.'}</h2><p>${history.length?'Try another search or clear the filters.':'Submission records appear here after ApplyFlow acknowledges an application event.'}</p>${history.length?'<button type="button" class="button secondary" data-action="reset-filters">Clear filters</button>':''}</div>`;
    return `<div class="audit-table-scroll"><table class="audit-table"><thead><tr><th scope="col">Candidate &amp; time</th><th scope="col">Application</th><th scope="col">Validation</th><th scope="col">Delivery</th><th scope="col"><span class="sr-only">Record details</span></th></tr></thead><tbody>${rows.map(({record:r,index})=>{const outcome=model.outcome(r);return `<tr><td><div class="table-person"><span class="table-avatar">${escape(initials(r.profile_name||r.profile_assigned||'AF'))}</span><div><strong>${escape(r.profile_name||r.profile_assigned||r.candidate_id||'Unknown candidate')}</strong><small>${escape(time(r.timestamp))}</small></div></div></td><td><strong>${escape(r.extracted_data?.job_title||'Application event')}</strong><small>${escape(r.extracted_data?.company||'Company not recorded')}</small></td><td><span class="result-badge" data-tone="${outcome.tone}">${escape(outcome.label)}</span></td><td><span class="delivery-label ${r.delivery_status==='ACKNOWLEDGED'?'is-acknowledged':''}">${r.delivery_status==='ACKNOWLEDGED'?icon('check'):''}${escape(r.delivery_status==='ACKNOWLEDGED'?'Acknowledged':r.delivery_status?.toLowerCase().replaceAll('_',' ')||'Recorded locally')}</span></td><td><button type="button" class="record-button" data-action="inspect" data-index="${index}" aria-label="View record for ${escape(r.extracted_data?.job_title||'application')}">${icon('chevron')}</button></td></tr>`;}).join('')}</tbody></table></div><div class="audit-count" role="status">Showing ${rows.length} of ${history.length} records</div>`;
  }
  function render(focus = false) {
    updateSidebar();
    const target=el('settings-content'); target.setAttribute('aria-busy','false');
    if (!config && !loadError && section()!=='history') {
      target.innerHTML='<div class="loading"><span class="loader"></span>Loading your settings…</div>';
      target.setAttribute('aria-busy','true');
    } else if (loadError && section()!=='history') {
      target.innerHTML=`${pageHeading('SETTINGS','Your workspace needs a moment.','The extension couldn’t load your current preferences.')}<div class="settings-panel load-error"><span class="section-icon">${icon('link')}</span><h2>Unable to load settings</h2><p>${escape(loadError)}</p><button type="button" class="button secondary" data-action="retry">Try again</button></div>`;
    } else if (section()==='history'&&!historyLoaded) {
      target.innerHTML=`${pageHeading('AUDIT HISTORY','Your application history.','Review the records saved in this browser.')}${historyError ? `<div class="settings-panel load-error"><h2>History could not be loaded.</h2><p>${escape(historyError)}</p><button class="button secondary" type="button" data-action="refresh-history">Try again</button></div>` : '<div class="loading"><span class="loader"></span>Loading audit history…</div>'}`;
    } else target.innerHTML=section()==='history'?renderHistory():section()==='account'?renderAccount():renderPreferences();
    updateSaveBar(); updateDependentFields();
    if (focus) {el('section-heading')?.focus({preventScroll:true}); window.scrollTo(0,0);}
  }
  function updateDependentFields() {
    const details=el('autofill-details');
    if(details){details.classList.toggle('is-disabled',!draft.autoAutofillOnPageLoad);details.querySelectorAll('input').forEach(input=>{input.disabled=!draft.autoAutofillOnPageLoad||saving;});}
  }
  async function loadConfig(force=false) {
    config=await request({type:'GET_CONFIG',force}); checkedAt=Date.now(); loadError='';
    if(!dirty()){saved=model.preferences(config.settings);draft={...saved};}
  }
  async function loadHistory() {
    let response;
    try { response=await request({type:'GET_HISTORY'}); historyError=''; }
    catch (error) { historyError=error.message; throw error; }
    history=Array.isArray(response.history)?response.history.filter(r=>r&&typeof r==='object'):[];
    historyLoaded=true;
  }
  async function savePreferences() {
    if(saving||!dirty())return;
    const form=el('preferences-form'); if(form&&!form.reportValidity())return;
    let settings;
    try{settings=model.validate(draft);}catch(error){notice(error.message,'error');return;}
    saving=true;updateSaveBar();el('preferences-form')?.querySelectorAll('input').forEach(node=>{node.disabled=true;});
    try{
      const result=await request({type:'SAVE_SETTINGS',settings});
      config=result; saved=model.preferences(result.settings); draft={...saved};
      render();notice('Preferences saved. Your next verified application will use these settings.');
    }catch(error){notice(error.message,'error');}
    finally{saving=false;el('preferences-form')?.querySelectorAll('input').forEach(node=>{node.disabled=false;});updateDependentFields();updateSaveBar();}
  }
  function download(content,filename,type) {
    const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function inspect(index) {
    const record=history[index];if(!record)return;selectedRecord=record;
    const outcome=model.outcome(record);
    el('record-content').innerHTML=`<div class="record-summary"><span class="result-badge" data-tone="${outcome.tone}">${escape(outcome.label)}</span><h3>${escape(record.extracted_data?.job_title||'Application event')}</h3><p>${escape(record.extracted_data?.company||'Company not recorded')}</p></div><dl class="record-fields">${[['Candidate',record.profile_name||record.profile_assigned||record.candidate_id],['Applier',record.applier_name||record.applier_email],['Recorded',time(record.timestamp)],['Delivery',record.delivery_status||'Recorded locally'],['Resume',record.extracted_data?.resume_uploaded||'Not recorded'],['Job ID',record.job_id]].map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value||'Not recorded')}</dd></div>`).join('')}</dl><details class="raw-record"><summary>Event payload</summary><pre>${escape(JSON.stringify(record,null,2))}</pre></details>`;
    el('record-feedback').textContent='';el('record-dialog').showModal();
  }
  el('open-workspace').addEventListener('click',openWorkspace);
  el('save-preferences').addEventListener('click',savePreferences);
  el('discard-changes').addEventListener('click',()=>{draft={...saved};render();notice('Your unsaved preference changes were discarded.');});
  el('settings-content').addEventListener('input',event=>{
    const node=event.target;
    if(node.dataset.pref){draft[node.dataset.pref]=node.type==='checkbox'?node.checked:node.type==='number'?Number(node.value):node.value;updateSaveBar();updateDependentFields();notice('');}
    if(node.id==='history-search'){search=node.value;el('audit-results').innerHTML=renderHistoryRows();}
  });
  el('settings-content').addEventListener('change',event=>{
    if(event.target.id==='history-filter'){filter=event.target.value;el('audit-results').innerHTML=renderHistoryRows();}
  });
  el('settings-content').addEventListener('submit',event=>{if(event.target.id==='preferences-form'){event.preventDefault();savePreferences();}});
  el('settings-content').addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');if(!button)return;
    const action=button.dataset.action, previousContent=button.innerHTML;
    try{
      if(action==='workspace')await openWorkspace();
      if(action==='account')location.hash='account';
      if(action==='retry'){await loadConfig();render();}
      if(action==='copy-url'){await navigator.clipboard.writeText(config.integration.apiOrigin);button.textContent='Copied';notice('Backend URL copied.');}
      if(action==='sync'){
        if(syncing)return;syncing=true;button.disabled=true;button.innerHTML='<span class="loader"></span>Checking…';
        try{await loadConfig(true);render();const state=accountState();notice(config.integration?.state==='UNASSIGNED'?'Account checked. ApplyFlow has not returned an active candidate assignment.':state.tone==='success'?'Account and assignment checked with ApplyFlow.':config.integration?.message||'Continue setup to connect your account.',state.tone==='success'?'success':'warning');}finally{syncing=false;render();}
      }
      if(action==='signout'){button.disabled=true;const result=await request({type:'SQC_LOGOUT'});config=result;await chrome.storage.local.remove('sqcSetupConfirmation');render();notice(result.remoteSignedOut===false?'Signed out locally. ApplyFlow could not revoke the remote session.':'Signed out. Your saved backend URL and preferences are kept.',result.remoteSignedOut===false?'warning':'success');}
      if(action==='refresh-history'){button.disabled=true;button.innerHTML='<span class="loader"></span>Refreshing…';try{await loadHistory();render();notice('Audit history is up to date.');}finally{button.disabled=false;}}
      if(action==='reset-filters'){search='';filter='all';render();el('history-search')?.focus();}
      if(action==='inspect')inspect(Number(button.dataset.index));
      if(action==='export-json'||action==='export-csv'){
        const records=filtered().map(row=>row.record);if(!records.length){notice('There are no matching records to export.','warning');return;}
        const csv=action==='export-csv';download(csv?model.csv(records):JSON.stringify(records,null,2),`applyflow-audit-${new Date().toISOString().slice(0,10)}.${csv?'csv':'json'}`,csv?'text/csv;charset=utf-8':'application/json');button.closest('details')?.removeAttribute('open');notice(`Exported ${records.length} audit record${records.length===1?'':'s'}.`);
      }
      if(action==='clear-history')el('clear-dialog').showModal();
    }catch(error){button.disabled=false;button.innerHTML=previousContent;notice(error.message,'error');}
  });
  el('close-record').addEventListener('click',()=>el('record-dialog').close());
  el('record-dialog').addEventListener('close',()=>{if(section()==='history')render();});
  el('record-dialog').addEventListener('click',event=>{if(event.target===el('record-dialog')){const bounds=event.target.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)event.target.close();}});
  el('copy-record').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(selectedRecord,null,2));el('record-feedback').textContent='Record JSON copied.';}catch{el('record-feedback').textContent='Unable to copy. Download the record instead.';}});
  el('download-record').addEventListener('click',()=>{if(selectedRecord)download(JSON.stringify(selectedRecord,null,2),'applyflow-audit-record.json','application/json');});
  el('cancel-clear').addEventListener('click',()=>el('clear-dialog').close());
  el('confirm-clear').addEventListener('click',async()=>{const button=el('confirm-clear');button.disabled=true;try{await request({type:'CLEAR_HISTORY'});history=[];historyLoaded=true;el('clear-dialog').close();render();notice('Local audit history cleared. ApplyFlow server records are unchanged.');}catch(error){el('clear-feedback').textContent=error.message;}finally{button.disabled=false;}});
  window.addEventListener('hashchange',async()=>{notice('');render(true);if(section()==='history'&&!historyLoaded){try{await loadHistory();render();}catch(error){el('settings-content').innerHTML='<div class="settings-panel load-error"><h2>History could not be loaded.</h2><button class="button secondary" type="button" data-action="refresh-history">Try again</button></div>';notice(error.message,'error');}}});
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();savePreferences();}});
  chrome.storage.onChanged.addListener(async(changes,area)=>{
    if(area!=='local'||saving||syncing)return;
    try{
      if(changes.sqcConnection){await loadConfig();render();}
      else if(changes.settings&&!dirty()){await loadConfig();render();}
      if(changes.submissionsHistory){await loadHistory();if(section()==='history'&&!el('record-dialog').open)render();else updateSidebar();}
    }catch(error){notice(error.message,'error');}
  });
  el('settings-version').textContent=`Quality Gatekeeper · v${chrome.runtime.getManifest().version}`;
  try{await loadConfig();}catch(error){loadError=error.message;}
  if(section()==='history'){try{await loadHistory();}catch(error){notice(error.message,'error');}}
  render();
});
