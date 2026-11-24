/* Local tailored documents retain their source; they never replace candidate identity. */
(function (root) {
  'use strict';
  const binding = (auth, c) => JSON.stringify([auth.apiOrigin, auth.applier.id,
    c.applicationSessionId, c.assignment.profileAssignmentId, c.assignment.profileAssignmentVersion,
    c.profile.id, c.profile.version, c.job.id]);
  const fixedBinding=(auth,c)=>JSON.stringify([auth.apiOrigin,auth.applier.id,c.assignment.profileAssignmentId,c.assignment.profileAssignmentVersion,c.profile.id,c.profile.version]);
  function sameBinding(saved,current){
    if(saved===current)return true;
    try{const old=JSON.parse(saved);if(old.length===10){old.splice(9,1);old.splice(1,1);}else if(old.length===7)old.splice(1,1);return JSON.stringify(old)===current;}catch(_){return false;}
  }
  async function validate(input, profile) {
    if (input?.confirmed !== true) throw new Error('Confirm that this resume belongs to the assigned candidate and current job.');
    const filename = String(input.filename || '').replace(/[\\/]/g, '_');
    const extension = filename.split('.').pop().toLowerCase();
    const types = {pdf:'application/pdf', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt:'text/plain'};
    const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(input.dataUrl || '');
    if (!types[extension] || !match || match[2].length > 14 * 1024 * 1024 || filename.length > 200) throw new Error('Choose a PDF, DOCX, or TXT resume up to 10 MB.');
    const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Choose a nonempty resume up to 10 MB.');
    if (extension === 'pdf' && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-' ||
        extension === 'docx' && (bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4)) throw new Error('The document contents do not match its file type.');
    const text = (extension === 'txt' ? new TextDecoder().decode(bytes) : String(input.text || '')).trim();
    if(root.SQCCandidateReference?.isPromptDocument(text))throw new Error('This is candidate reference content with generation instructions, not an actual resume. Upload the original job resume instead.');
    if (text.length < 40 || text.length > 200000) throw new Error('Extract or paste the resume text (40–200,000 characters) before using this file.');
    const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const header = new Set(normalize(text.slice(0, 1500)).split(' '));
    const names = [profile.fullName, profile.legalName, profile.preferredName, ...(profile.nameAliases || [])].filter(Boolean);
    const emails = [profile.primaryEmail, ...(profile.emailAliases || [])].filter(Boolean);
    if (!names.some(name => normalize(name).split(' ').every(token => header.has(token))) &&
        !emails.some(email => text.slice(0, 1500).toLowerCase().includes(email.toLowerCase()))) {
      throw new Error('The resume header must identify the assigned candidate. Check the document or its extracted text.');
    }
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const facts=root.SQCResumeContext?.parse(text) || {workHistory:[],skills:[],skillYears:{},totalYears:null,needsReview:[]};
    const skills = Array.isArray(input.skills)&&input.skills.length ? [...new Set(input.skills.filter(s => typeof s === 'string' && s.trim() && s.length <= 100))].slice(0, 100) : facts.skills||[];
    return {id:'sqc-upload:' + sha256, version:sha256, source:'sqc_upload', verified:false,
      text, skills, facts,
      kind:'tailored', profileId:profile.id,
      file:{filename, mimeType:types[extension], sha256, dataUrl:`data:${types[extension]};base64,${match[2].replace(/\s/g, '')}`}};
  }
  function memoryStore() {
    const records = new Map();
    return { async get(id, key) { const r = records.get(id); return r&&sameBinding(r.binding,key) ? r.resume : null; },
      async put(id, key, resume) { records.set(id, {binding:key, resume}); },
      async remove(id) { records.delete(id); }, async clear() { records.clear(); } };
  }
  function createStore({session, indexedDB = root.indexedDB}) {
    let database;
    const open = () => database ||= new Promise((resolve, reject) => {
      const req = indexedDB.open('sqc-local-tailored-resumes', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('resumes', {keyPath:'tabId'});
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    async function transact(mode, action) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('resumes', mode), req = action(tx.objectStore('resumes'));
        let result; req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not save the local resume.'));
      });
    }
    // The epoch makes documents from a prior browser session unavailable and prunes them on first access.
    const epoch = (async () => {
      const data = await session.get('sqcLocalResumeEpoch');
      if (data.sqcLocalResumeEpoch) return data.sqcLocalResumeEpoch;
      const value = crypto.randomUUID(); await session.set({sqcLocalResumeEpoch:value});
      await transact('readwrite', store => store.clear()); return value;
    })();
    epoch.catch(() => {}); // Surface storage errors on upload, without an unhandled startup rejection.
    return {
      async get(id, key) { const e = await epoch, r = await transact('readonly', s => s.get(id));
        if (!r) return null; if (r.epoch !== e) { await this.remove(id); return null; }
        return sameBinding(r.binding,key) ? r.resume : null; },
      async put(id, key, resume) { const e = await epoch;
        const all = await transact('readonly', s => s.getAll());
        if(all.length>=100&&!all.some(r=>r.tabId===id))throw new Error('Resume storage is full. Close finished job tabs before uploading another document.');
        await transact('readwrite', s => s.put({tabId:id,binding:key,resume,epoch:e,savedAt:Date.now()})); },
      async remove(id) { await epoch; await transact('readwrite', s => s.delete(id)); },
      async clear() { await epoch; await transact('readwrite', s => s.clear()); }
    };
  }
  root.SQCLocalResume = {binding, fixedBinding, validate, createStore, memoryStore};
  if (typeof module !== 'undefined') module.exports = root.SQCLocalResume;
})(globalThis);
