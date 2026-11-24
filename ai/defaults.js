(function(root){
  'use strict';
  // Extension-wide defaults requested by the user; resume-specific edits override them.
  const starter=`Extension defaults apply automatically. Names, contact details and experience come from the selected resume.
Restrictive covenants, non-competes, non-solicitation or confidentiality obligations restricting this role: No.
Terminated or suspended from previous employment, including misconduct: No.
Government or quasi-public agency employment currently or in the past five years: No.
FINRA registration, current or past: No.
Referred by an employee: No. Referral employee name: Not applicable.
How I heard about the role: Job platform.
Security clearance: No.
Valid driver's license: Yes.
Professional or job-related licenses/certifications: No.
Languages other than English: No.
Race/ethnicity answer preference: Two or more races; if unavailable, Prefer not to say.
Gender answer: Male.
Hispanic/Latino answer: No.
Veteran status answer: I am not a protected veteran.
SMS application updates consent: No.
Legal-gender identification, pronouns and sexual orientation: Not specified - ask for confirmation. Do not infer these from gender or race/ethnicity.

Work authorization: Yes, as confirmed by the applier; confirm the applicable country before using this for country-specific questions. This does not establish citizenship or sponsorship status.
Visa sponsorship now or in future: No.
Salary preference: Prefer the upper boundary of the posted base salary range; the midpoint is also acceptable if it is strictly above 100,000 annually. Confirm the currency before applying this threshold. For a numeric expected base salary, prefer the posted upper boundary when it exceeds that threshold. If no posted range is supplied, or the upper boundary is 100,000 or less, ask for confirmation. Do not invent a posted range, include bonus/equity in base salary, or convert hourly/monthly pay without confirmed units.
Notice period and start availability: Not specified - ask for confirmation.
Location, onsite/hybrid preferences and travel: Not specified - ask for confirmation.

Names, contact details, education and technical experience must match the selected resume. Do not reuse another candidate's details. If this template conflicts with the resume, ask for clarification.`;
  function create({session,local,deployment=root.SQCDeployment,onChange=()=>{},id=()=>root.crypto.randomUUID()}){
    let queue=Promise.resolve();
    const serial=work=>{const result=queue.then(work);queue=result.catch(()=>{});return result;};
    const text=value=>{if(typeof value!=='string'||value.trim().length>100000)throw new Error('Answer facts must be text up to 100,000 characters.');return value.trim();};
    async function read(version){
      if(deployment){const policy=await deployment.load(),a=policy.answers;let text=starter;
        for(const [from,to] of [['Visa sponsorship now or in future: No.','Visa sponsorship now or in future: '+a.sponsorship+'.'],['Gender answer: Male.','Gender answer: '+a.gender+'.'],['Hispanic/Latino answer: No.','Hispanic/Latino answer: '+a.hispanicLatino+'.'],['Veteran status answer: I am not a protected veteran.','Veteran status answer: '+a.veteranStatus+'.'],['SMS application updates consent: No.','SMS application updates consent: '+a.smsUpdates+'.'],['Race/ethnicity answer preference: Two or more races; if unavailable, Prefer not to say.','Race/ethnicity answer preference: '+a.race+'; if unavailable, '+a.raceFallback+'.']])text=text.replace(from,to);
        return {text,version:'deployment:'+JSON.stringify(a),resumeVersion:version,source:'extension_defaults'};
      }
      const value=(await session.get('qaAnswerDefaults')).qaAnswerDefaults;return value&&value.resumeVersion===version?value:{text:starter,version:'extension-defaults-2.9.0',resumeVersion:version,source:'extension_defaults'};
    }
    const state=version=>serial(async()=>({active:await read(version),template:(await local.get('qaDefaultTemplate')).qaDefaultTemplate ?? starter,starter}));
    const save=(input,version)=>serial(async()=>{
      if(deployment)throw new Error('Default answers are managed in config/settings.json.');
      if(!version || input?.resumeVersion!==version)throw new Error('The resume changed. Review these facts for the current resume.');
      const value=text(input.text);if(!value)throw new Error('Enter the answer facts first.');
      const active={text:value,version:id(),resumeVersion:version,source:'user_confirmed'};
      await session.set({qaAnswerDefaults:active});onChange();return active;
    });
    const clear=()=>serial(async()=>{await session.remove('qaAnswerDefaults');onChange();return null;});
    const saveTemplate=value=>serial(async()=>{const template=text(value);await local.set({qaDefaultTemplate:template});return template;});
    const snapshot=version=>serial(()=>read(version));
    const assertCurrent=(snapshot,version)=>serial(async()=>{if((await read(version))?.version!==snapshot?.version||snapshot?.resumeVersion!==version)throw new Error('The answer defaults changed. Request fresh answers.');});
    return {state,save,clear,saveTemplate,snapshot,assertCurrent};
  }
  root.SQCQADefaults={create,starter};if(typeof module!=='undefined')module.exports={create,starter};
})(globalThis);
