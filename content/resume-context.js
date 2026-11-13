/* Resume-only facts. Never use this parser to replace ApplyFlow's candidate profile. */
(function(root) {
  'use strict';
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const datePart = '(?:[A-Za-z]{3,9}\\s+\\d{4}|\\d{1,2}[/-]\\d{4}|\\d{4}[/-]\\d{1,2}|\\d{4})';
  const range = new RegExp('(' + datePart + ')\\s*(?:[-–—]|\\bto\\b)\\s*(' + datePart + '|present|current|now)\\s*$', 'i');
  const role = /engineer|developer|architect|consultant|manager|analyst|designer|director|specialist|lead|intern|scientist|administrator|officer|associate|technician|coordinator/i;
  function date(raw) {
    if (/^(present|current|now)$/i.test(raw)) return {value:'', current:true};
    let m = /^(\d{4})[/-](\d{1,2})$/.exec(raw);
    if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? {value:m[1]+'-'+m[2].padStart(2,'0')} : null;
    m = /^(\d{1,2})[/-](\d{4})$/.exec(raw);
    if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? {value:m[2]+'-'+m[1].padStart(2,'0')} : null;
    m = /^([a-z]+)\s+(\d{4})$/i.exec(raw);
    if (m && monthNames.includes(m[1].slice(0,3).toLowerCase())) return {value:m[2]+'-'+String(monthNames.indexOf(m[1].slice(0,3).toLowerCase())+1).padStart(2,'0')};
    return /^\d{4}$/.test(raw) ? {value:raw} : null;
  }
  function parse(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const start = lines.findIndex(l => /^(professional experience|work experience|employment(?: history)?|experience|career history)$/i.test(l.replace(/:$/, '')));
    const workHistory = [], needsReview = [];
    if (start >= 0) {
      let end = lines.findIndex((l,i) => i>start && /^(education|technical skills|skills|certifications|projects|references|target job description)$/i.test(l.replace(/:$/, '')));
      if (end < 0) end = lines.length;
      const section = lines.slice(start+1,end), headers = [];
      for (let i=0;i<section.length;i++) {
        const m = range.exec(section[i]); if (!m) continue;
        const from=date(m[1]), to=date(m[2]); if (!from || !to) continue;
        const prefix=section[i].slice(0,m.index).replace(/[|,\s]+$/,'').trim();
        const previous=section[i-1] || '', next=section[i+1] || '';
        let title='', company='', first=i, after=i+1;
        const parts=prefix.split(/\s+[|]\s+/).filter(Boolean);
        if (role.test(prefix)) {
          title=parts.find(p=>role.test(p)) || prefix;
          company=parts.find(p=>!role.test(p)) || '';
          if (!company && previous && !range.test(previous) && !/^[•*-]/.test(previous) && !role.test(previous)) {company=previous;first=i-1;}
          if (!company && next && !range.test(next) && !/^[•*-]/.test(next)) {company=next;after=i+2;}
        } else if (prefix && role.test(previous)) {company=prefix;title=previous;first=i-1;}
        else if (!prefix && role.test(previous) && i>=2) {title=previous;company=section[i-2];first=i-2;}
        else if (prefix && role.test(next)) {company=prefix;title=next;after=i+2;}
        if (!title || !company || company.length>160 || title.length>200) {needsReview.push(section[i]);continue;}
        headers.push({first,after,title,company,from,to,range:m[0]});
      }
      headers.forEach((h,i) => {
        const stop=headers[i+1]?.first ?? section.length;
        const description=section.slice(h.after,stop).join('\n');
        workHistory.push({company:h.company,title:h.title,startDate:h.from.value,endDate:h.to.value,
          current:h.to.current === true,description,dateRange:h.range,
          evidence:section.slice(h.first,stop).join('\n')});
      });
    }
    const skillYears = {};
    const explicit = /\b(\d{1,2}(?:\.\d+)?)\s*(\+)?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+)?(?:experience\s+)?(?:with|in|using)\s+([a-z][a-z0-9#+.\/-]*(?:[ \t]+[a-z][a-z0-9#+.\/-]*){0,2})/gi;
    let m;
    while ((m=explicit.exec(text))) {
      const tech=m[3].split(/\s+(?:and|or|building|developing|working|for|at)\b/i)[0].trim().replace(/[.,;:]+$/,'');
      if (tech) skillYears[tech.toLowerCase()]={value:Number(m[1]),minimum:Boolean(m[2]),evidence:m[0]};
    }
    const total = /\b(\d{1,2}(?:\.\d+)?)\s*(\+)?\s*(?:years?|yrs?)\s+of\s+(?:(?:professional|software|engineering|development)\s+){0,3}experience\b/i.exec(text);
    return {workHistory,skillYears,totalYears:total ? {value:Number(total[1]),minimum:Boolean(total[2]),evidence:total[0]} : null,needsReview};
  }
  function experienceValue(history, label, index, type) {
    const entry=history[index]; if (!entry) return undefined;
    const key=String(label).toLowerCase().replace(/[*:]/g,'').trim();
    if (/^(company|company name|employer|employer name|organization|organisation)$/.test(key)) return entry.company;
    if (/^(job title|title|position|position title|role)$/.test(key)) return entry.title;
    if (/^(description|job description|responsibilities|duties|role description|achievements)$/.test(key)) return entry.description;
    const part=/^(start|end) (month|year)$/.exec(key);
    if(part) {
      const value=entry[part[1]==='start'?'startDate':'endDate'];
      if (!value || part[1]==='end' && entry.current) return undefined;
      return part[2]==='year' ? value.slice(0,4) : /^\d{4}-\d{2}$/.test(value) ?
        ['January','February','March','April','May','June','July','August','September','October','November','December'][Number(value.slice(5))-1] : undefined;
    }
    if (/^(start date|from|employment start date)$/.test(key)) return type==='date' ? undefined : entry.startDate;
    if (/^(end date|to|employment end date)$/.test(key)) return entry.current || type==='date' ? undefined : entry.endDate;
    return undefined;
  }
  function numericFact(question,facts) {
    const q=String(question).toLowerCase(); if (!/years?|yrs?/.test(q)) return null;
    if (/\b(and|or|both)\b/.test(q)) return null;
    const skill=Object.entries(facts?.skillYears || {}).find(([name]) => q.includes(name));
    if (skill) return skill[1];
    return /(?:total|overall|professional|software|engineering).*experience|experience.*(?:total|overall)/.test(q) ? facts?.totalYears : null;
  }
  function numberMismatch(question,answer,facts) {
    const fact=numericFact(question,facts); if(!fact) return null;
    const range=/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/.exec(String(answer).trim());
    if(range) return !fact.minimum && (fact.value<Number(range[1]) || fact.value>Number(range[2])) ? fact : null;
    const exact=/^(\d+(?:\.\d+)?)(\+)?(?:\s*(?:years?|yrs?))?$/.exec(String(answer).trim());
    return exact && !fact.minimum && (exact[2] ? Number(exact[1])>fact.value : Number(exact[1])!==fact.value) ? fact : null;
  }
  root.SQCResumeContext={parse,experienceValue,numericFact,numberMismatch};
  if(typeof module!=='undefined') module.exports=root.SQCResumeContext;
})(typeof window!=='undefined'?window:globalThis);
