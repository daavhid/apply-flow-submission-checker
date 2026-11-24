(function(root){
  'use strict';
  const privateField=/password|passcode|one.time|verification.code|captcha|passport|social.security|search/i;
  const meaningful=value=>value!==false&&value!=null&&!/^(?:\s*|[-–—]+|select(?: an? (?:item|option)| one)?|choose(?: an? option)?|no file(?: selected| uploaded)?|none|not uploaded|undefined|null)$/i.test(String(value).trim());
  const entries=data=>(data?.all_entries||[]).filter(entry=>!['hidden','password'].includes(entry.type)&&!privateField.test([entry.label,entry.question,entry.name,entry.id].join(' ')));
  function hasData(data){if(Array.isArray(data?.all_entries))return entries(data).some(entry=>meaningful(entry.value??entry.answer))||meaningful(data?.resume_uploaded);return ['candidate_name','candidate_first_name','email_entered','phone_entered','salary_expected','resume_uploaded'].some(key=>meaningful(data?.[key]));}
  function fingerprint(data){
    const value=JSON.stringify([entries(data).map(entry=>[entry.label||entry.question||entry.name||entry.id,entry.value??entry.answer??'']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),data?.resume_uploaded||'']);
    let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
    return value.length+':'+(hash>>>0).toString(16);
  }
  function mergeScreenshots(shots,shot){
    const image=shot.data_url||shot.dataUrl;
    const duplicate=shots.find(existing=>existing.page_url===shot.page_url&&(existing.data_url||existing.dataUrl)===image);
    if(duplicate)return {screenshot:duplicate,screenshots:shots,duplicate:true};
    const index=shots.findIndex(existing=>existing.step_key===shot.step_key);
    const next=[...shots];if(index>=0)next[index]=shot;else next.push(shot);
    return {screenshot:shot,screenshots:next.slice(-8),duplicate:false};
  }
  root.SQCLiveProgress={hasData,entries,fingerprint,mergeScreenshots};if(typeof module!=='undefined')module.exports=root.SQCLiveProgress;
})(globalThis);
