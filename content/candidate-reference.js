/* Extract explicitly supplied facts, never generation instructions or examples. */
(function(root){
  'use strict';
  const tidy=value=>String(value||'').replace(/\*\*/g,'').trim();
  const prompt=text=>/resume\s+(?:json\s+)?generator|execution rules|jd.first tailoring/i.test(text||'')&&/(?:^|\n)\s*(?:Act as\b|(?:#+\s*)?Execution rules\b|[-*]\s*ALWAYS generate)/im.test(String(text||'').replace(/\*\*/g,''));
  const month=value=>{const match=/([a-z]+)\s+(\d{4})/i.exec(value||'');if(!match)return '';const index=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[1].slice(0,3).toLowerCase());return index<0?'':match[2]+'-'+String(index+1).padStart(2,'0');};
  const locationFields=new Set(['city','state','zip','country','address','location']);
  const usableLocation=value=>typeof value==='string'&&value.trim()&&!/^(?:optimized|optimised|tailored|generated|remote|hybrid|onsite|unknown|undefined|null|n\/?a|not provided|tbd)$/i.test(value.trim())&&!/[\r\n{}<>]|\b(?:act as|generate (?:a|the)|optimi[sz](?:e|ed) (?:for|the)|insert (?:city|address)|replace (?:with|this))\b/i.test(value);
  function parse(text){
    const raw=String(text||''),section=/^##\s*(?:\d+[.)]?\s*)?Candidate Information\s*$/im.exec(raw);
    let block=section?raw.slice(section.index+section[0].length):prompt(raw)?'':raw;
    const end=/^##\s+/m.exec(block);if(end)block=block.slice(0,end.index);
    const lines=block.split(/\r?\n/).map(tidy).filter(Boolean),contact={},workHistory=[],education=[];
    const fields={name:'fullName',location:'location',phone:'phone',email:'email',linkedin:'linkedin',address:'address','street address':'address',street:'address','address line 1':'address',city:'city',state:'state',zip:'zip','postal code':'zip',country:'country'};
    for(const line of lines){const pair=/^([A-Za-z][A-Za-z ]{1,40}):\s*(.+)$/.exec(line);if(pair&&fields[pair[1].toLowerCase()])contact[fields[pair[1].toLowerCase()]]=pair[2].trim();}
    for(const key of locationFields)if(contact[key]&&!usableLocation(contact[key]))delete contact[key];
    const location=/^([^,]+),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/.exec(contact.location||'');
    if(location&&usableLocation(location[1])){contact.city??=location[1];contact.state??=location[2];if(location[3])contact.zip??=location[3];}else if(location)delete contact.location;
    for(const line of lines){
      const parts=line.replace(/^[-*]\s*/,'').split(/\s*\|\s*/),header=parts[0].split(/\s+[—–-]\s+/);
      if(header.length!==2)continue;
      const dates=/([A-Za-z]+\s+\d{4})\s*[—–-]\s*([A-Za-z]+\s+\d{4}|Present|Current)/i.exec(parts.at(-1)||'');
      if(dates&&/engineer|developer|architect|manager|analyst|consultant|specialist|intern/i.test(header[1]))workHistory.push({company:header[0],title:header[1],location:parts.length>2?parts[1]:'',startDate:month(dates[1]),endDate:month(dates[2]),current:/present|current/i.test(dates[2]),description:'',source:'candidate_reference'});
      if(/bachelor|master|doctor|associate|degree|diploma/i.test(header[1])){
        const date=/([A-Za-z]+)\s+(?:(\d{1,2}),?\s+)?(\d{4})/.exec(parts.at(-1)||'');
        const graduationMonth=date?month(date[1]+' '+date[3]):'';
        education.push({school:header[0],degree:header[1],...(date?{graduationYear:date[3],graduationDate:graduationMonth+(date[2]?'-'+date[2].padStart(2,'0'):'')}:{}),source:'candidate_reference'});
      }
    }
    workHistory.sort((a,b)=>Number(b.current)-Number(a.current)||(b.endDate||b.startDate).localeCompare(a.endDate||a.startDate));
    return {contact,workHistory,education,source:'candidate_reference',instructionsExcluded:prompt(raw)};
  }
  function merge(profile,text){
    const parsed=text?parse(text):profile.candidateReferenceFacts||parse('');
    const facts={...parsed,contact:{...parsed.contact},education:parsed.education||[],workHistory:parsed.workHistory||[]},normalize=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const result={...profile,candidateFieldSources:{...profile.candidateFieldSources}};
    for(const key of locationFields){
      if(result[key]!=null&&(typeof result[key]==='string'&&!usableLocation(result[key])||typeof result[key]!=='string'&&key!=='location')){delete result[key];delete result.candidateFieldSources[key];}
      if(facts.contact[key]&&!usableLocation(facts.contact[key]))delete facts.contact[key];
    }
    const location=/^([^,]+),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/.exec(facts.contact.location||'');
    if(location&&usableLocation(location[1])){facts.contact.city??=location[1];facts.contact.state??=location[2];if(location[3])facts.contact.zip??=location[3];}else if(location)delete facts.contact.location;
    if(facts.contact.fullName&&normalize(facts.contact.fullName)!==normalize(profile.fullName))return {...result,candidateReferenceFacts:undefined,candidateReferenceError:'Candidate reference name does not match the locked profile.'};
    result.candidateReferenceFacts=facts;
    for(const [key,value] of Object.entries(facts.contact))if(key!=='fullName'){
      if(locationFields.has(key)&&value){
        if(key==='location'&&result.location&&typeof result.location==='object'){
          result.location={...result.location};for(const part of ['city','state','zip','country','address'])if(facts.contact[part])result.location[part]=facts.contact[part];
          result.candidateFieldSources.location='applyflow_base_context';continue;
        }
        result[key]=value;result.candidateFieldSources[key]='applyflow_base_context';
      }else if(!result[key]){result[key]=value;result.candidateFieldSources[key]='applyflow_base_context';}
    }
    if(!result.education?.length&&facts.education.length)result.education=facts.education;
    if(!result.graduationYear&&facts.education[0]?.graduationYear)result.graduationYear=facts.education[0].graduationYear;
    return result;
  }
  const api={parse,merge,isPromptDocument:prompt,usableLocation};root.SQCCandidateReference=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
