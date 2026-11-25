/* Resume-only facts. Never use this parser to replace ApplyFlow's candidate profile. */
(function(root) {
  'use strict';
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const datePart = '(?:[A-Za-z]{3,9}\\s+\\d{4}|\\d{1,2}[/-]\\d{4}|\\d{4}[/-]\\d{1,2}|\\d{4})';
  const range = new RegExp('(' + datePart + ')\\s*(?:[-–—]|\\bto\\b)\\s*(' + datePart + '|present|current|now)\\s*$', 'i');
  const role = /engineer|developer|architect|consultant|manager|analyst|designer|director|specialist|lead|intern|scientist|administrator|officer|associate|technician|coordinator/i;
  const companyLine = value => value && value.length<=120 && !/^[•*\-]/.test(value) &&
    !/\b(maintaining|implemented|developed|delivered|worked|built|addressing|updated|reduced|improved|designed|collaborated|mentored)\b/i.test(value) &&
    !/[.!?]$/.test(value.replace(/\b(?:Inc|Corp|Ltd|Co)\.$/i,''));
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
  function skillNames(input){
    const result=[],seen=new Set();
    const add=value=>{for(const name of String(value).split(/[,;\n]/)){const text=name.trim();if(!text||text.length>100||/^\[object\s+object\]$/i.test(text)||seen.has(text.toLowerCase()))continue;seen.add(text.toLowerCase());result.push(text);}};
    const visit=(value,depth=0)=>{
      if(depth>6||value==null)return;
      if(typeof value==='string'){add(value);return;}
      if(Array.isArray(value)){value.forEach(item=>visit(item,depth+1));return;}
      if(typeof value!=='object')return;
      let collection=false;for(const key of ['skills','primaryStackKeywords','items','technologies','values'])if(Array.isArray(value[key])){collection=true;visit(value[key],depth+1);}if(collection)return;
      for(const key of ['name','skillName','skill','label','technology','title','value'])if(typeof value[key]==='string'&&value[key].trim()){add(value[key]);return;}
      if(value.skill&&typeof value.skill==='object')visit(value.skill,depth+1);
    };visit(input);return result;
  }
  function parse(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const start = lines.findIndex(l => /^(professional experience|work experience|employment(?: history)?|experience|career history)$/i.test(l.replace(/:$/, '')));
    const workHistory = [], education=[], needsReview = [];
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
          if (!company && companyLine(previous) && !range.test(previous) && !role.test(previous)) {company=previous;first=i-1;}
          if (!company && companyLine(next) && !range.test(next) && !role.test(next)) {company=next;after=i+2;}
        } else if (prefix && role.test(previous)) {company=prefix;title=previous;first=i-1;}
        else if (!prefix && role.test(previous) && i>=2) {title=previous;company=section[i-2];first=i-2;}
        else if (prefix && role.test(next)) {company=prefix;title=next;after=i+2;}
        if (!title || !companyLine(company) || title.length>200) {needsReview.push(section[i]);continue;}
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
    const compareDate=(a,b)=>{if(a.slice(0,4)!==b.slice(0,4))return b.slice(0,4).localeCompare(a.slice(0,4));return a.length===7&&b.length===7?b.localeCompare(a):0;};
    workHistory.forEach((entry,index)=>{entry.sourceOrder=index;});
    workHistory.sort((a,b)=>Number(b.current)-Number(a.current)||compareDate(a.current?a.startDate:a.endDate,b.current?b.startDate:b.endDate)||compareDate(a.startDate,b.startDate));
    const educationStart=lines.findIndex(line=>/^(?:education|education history|academic qualifications|academic background)$/i.test(line.replace(/:$/,'')));
    if(educationStart>=0){
      let end=lines.findIndex((line,index)=>index>educationStart&&/^(?:skills|technical skills|certifications|projects|references|professional experience|work experience|employment history)$/i.test(line.replace(/:$/,'')));
      if(end<0)end=lines.length;
      const section=lines.slice(educationStart+1,end),school=/\b(?:university|college|institute|school|academy|polytechnic)\b/i,degree=/\b(?:bachelor(?:'s)?|master(?:'s)?|doctor(?:ate)?|associate(?:'s)?|ph\.?d\.?|[bm]\.?[as]\.?c?\.?|mba)\b/i;
      const schools=section.map((line,index)=>({line,index})).filter(({line})=>school.test(line));
      const degreeFirst=schools[0]?.index>0&&degree.test(section[schools[0].index-1]);
      schools.forEach(({line,index},ordinal)=>{
        const from=ordinal?schools[ordinal-1].index+1:0,to=schools[ordinal+1]?.index??section.length;
        const degreeLine=degree.test(line)?line:degreeFirst?(degree.test(section[index-1]||'')?section[index-1]:''):(degree.test(section[index+1]||'')?section[index+1]:'');
        const dateLine=section[index+(degreeFirst?1:2)]||'';
        const nearby=[line,degreeLine,...(/^(?:(?:graduated|graduation|completed)\s*:?\s*)?(?:[A-Za-z]+\s+)?(?:19|20)\d{2}(?:\s*[-–—]\s*(?:(?:[A-Za-z]+\s+)?(?:19|20)\d{2}|present))?$/i.test(dateLine)?[dateLine]:[])].filter(Boolean);
        const parts=line.split(/\s*\|\s*/),schoolName=parts.find(value=>school.test(value))?.replace(/\s*[,|–—-]\s*(?:19|20)\d{2}.*$/,'').trim();
        const years=nearby.join(' ').match(/\b(?:19|20)\d{2}\b/g)||[];
        const degreeParts=degreeLine.split(/\s*\|\s*/);let degreeName=degreeParts.find(value=>degree.test(value))||'';
        degreeName=degreeName.replace(/\s*[,|–—-]\s*(?:19|20)\d{2}.*$/,'').trim();
        const majorMatch=/\b(?:in|of)\s+(?:science|arts|engineering|business administration)\s+in\s+(.+)|\bin\s+(.+)$/i.exec(degreeName);
        const major=(majorMatch?.[1]||majorMatch?.[2]||'').trim();
        if(schoolName)education.push({school:schoolName,degree:degreeName,major,graduationYear:years.at(-1)||'',endDate:years.at(-1)||'',evidence:nearby.join('\n')});
      });
    }
    const skills=[];
    const skillStart=lines.findIndex(line=>/^(?:technical |core |professional )?(?:skills|skills & technologies|technologies|technical proficiencies)(?:\s*:.*)?$/i.test(line));
    if(skillStart>=0){
      let skillEnd=lines.findIndex((line,index)=>index>skillStart&&/^(?:professional experience|work experience|experience|education|employment history|projects|certifications|references)$/i.test(line.replace(/:$/,'')));
      if(skillEnd<0)skillEnd=lines.length;
      const values=lines.slice(skillStart,skillEnd);values[0]=values[0].includes(':')?values[0].slice(values[0].indexOf(':')+1):'';
      for(const line of values)for(const value of line.replace(/^(?:languages|frameworks|databases|cloud|tools|platforms|devops|technologies)\s*:\s*/i,'').split(/[,;|•]/)){const skill=value.replace(/^[*\-]\s*/,'').trim();if(skill&&skill.length<=80&&!skills.some(v=>v.toLowerCase()===skill.toLowerCase()))skills.push(skill);}
    }
    const skillYears = {};
    const explicit = /\b(\d{1,2}(?:\.\d+)?)\s*(\+)?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+)?(?:experience\s+)?(?:with|in|using)\s+([a-z][a-z0-9#+.\/-]*(?:[ \t]+[a-z][a-z0-9#+.\/-]*){0,2})/gi;
    let m;
    while ((m=explicit.exec(text))) {
      const tech=m[3].split(/\s+(?:and|or|building|developing|working|for|at)\b/i)[0].trim().replace(/[.,;:]+$/,'');
      if (tech) skillYears[tech.toLowerCase()]={value:Number(m[1]),minimum:Boolean(m[2]),evidence:m[0]};
    }
    const total = /\b(\d{1,2}(?:\.\d+)?)\s*(\+)?\s*(?:years?|yrs?)\s+of\s+(?:(?:professional|software|engineering|development)\s+){0,3}experience\b/i.exec(text);
    return {workHistory,education,skills,skillYears,totalYears:total ? {value:Number(total[1]),minimum:Boolean(total[2]),evidence:total[0]} : null,needsReview};
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
    if (/^(start date|from|employment start date)$/.test(key)) return type==='date'||type==='month'&&!/^\d{4}-\d{2}$/.test(entry.startDate) ? undefined : entry.startDate;
    if (/^(end date|to|employment end date)$/.test(key)) return entry.current || type==='date'||type==='month'&&!/^\d{4}-\d{2}$/.test(entry.endDate) ? undefined : entry.endDate;
    return undefined;
  }
  function numericFact(question,facts) {
    const q=String(question).toLowerCase(); if (!/years?|yrs?/.test(q)) return null;
    if (/\b(and|or|both)\b/.test(q)) return null;
    const skill=Object.entries(facts?.skillYears || {}).find(([name]) => q.includes(name));
    if (skill) return skill[1];
    return /(?:total|overall|professional|software|engineering).*experience|experience.*(?:total|overall)/.test(q) ? facts?.totalYears : null;
  }
  function educationValue(history,label,index,type){
    const entry=history[index];if(!entry)return undefined;
    const key=String(label).toLowerCase().replace(/[*:]/g,'').trim();
    if(/^(?:school|school name|university|college|institution|institution name)$/.test(key))return entry.school;
    if(/^(?:degree|degree earned|highest degree|qualification)$/.test(key))return entry.degree;
    if(/^(?:major|field of study|area of study)$/.test(key))return entry.major;
    if(/^(?:graduation year|year graduated|year of graduation|end year)$/.test(key))return entry.graduationYear;
    if(/^(?:start|end) (?:date|month|year)$/.test(key))return experienceValue([entry],key,0,type);
    return entry[key];
  }
  function numberMismatch(question,answer,facts) {
    const fact=numericFact(question,facts); if(!fact) return null;
    const range=/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/.exec(String(answer).trim());
    if(range) return !fact.minimum && (fact.value<Number(range[1]) || fact.value>Number(range[2])) ? fact : null;
    const exact=/^(\d+(?:\.\d+)?)(\+)?(?:\s*(?:years?|yrs?))?$/.exec(String(answer).trim());
    return exact && !fact.minimum && (exact[2] ? Number(exact[1])>fact.value : Number(exact[1])!==fact.value) ? fact : null;
  }
  root.SQCResumeContext={parse,skillNames,experienceValue,educationValue,numericFact,numberMismatch};
  if(typeof module!=='undefined') module.exports=root.SQCResumeContext;
})(typeof window!=='undefined'?window:globalThis);
