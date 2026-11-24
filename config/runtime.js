(function(root){
  'use strict';
  const defaults={schemaVersion:1,resume:{mode:'tailored',allowUpload:true,autoAttach:true,closeAfterAttach:true,experienceOrder:'newest-first'},
    autofill:{enabled:true,experience:true,skills:true,demographics:true,compensation:true,customQuestions:true},validation:{mode:'active',minScreeningLength:15,detectCaptcha:true,streamLiveEvents:true},questions:{autoDetect:true,applyChoices:true,applyText:true},
    answers:{sponsorship:'No',gender:'Male',race:'Two or more races',raceFallback:'Prefer not to say',hispanicLatino:'No',veteranStatus:'I am not a protected veteran',smsUpdates:'No'},
    tracking:{inheritNewTabs:true,captureAnswers:true,maxApplications:30,maxStepsPerApplication:40},submission:{requirePortalConfirmation:true,requireAcknowledgement:true,refreshApplyFlowStatus:true}};
  function validate(input){
    if(!input||input.schemaVersion!==1)throw new Error('settings.json requires schemaVersion 1.');
    const check=(actual,expected,path='settings')=>{if(!actual||typeof actual!=='object'||Array.isArray(actual))throw new Error(path+' must be an object.');for(const name of Object.keys(actual))if(!(name in expected))throw new Error('Unknown setting: '+path+'.'+name);for(const [name,value] of Object.entries(expected)){const next=actual[name];if(value&&typeof value==='object')check(next,value,path+'.'+name);else if(typeof next!==typeof value)throw new Error('Invalid setting: '+path+'.'+name);}};
    check(input,defaults);
    if(Object.values(input.answers).some(value=>!value.trim()||value.length>200))throw new Error('Default answers must contain 1-200 characters.');
    if(!['active','audit'].includes(input.validation.mode)||!Number.isInteger(input.validation.minScreeningLength)||input.validation.minScreeningLength<1||input.validation.minScreeningLength>500)throw new Error('Invalid validation settings.');
    if(!['fixed','tailored'].includes(input.resume.mode)||input.resume.experienceOrder!=='newest-first')throw new Error('Resume mode must be fixed or tailored; experienceOrder must be newest-first.');
    for(const [name,max] of [['maxApplications',100],['maxStepsPerApplication',100]])if(!Number.isInteger(input.tracking[name])||input.tracking[name]<1||input.tracking[name]>max)throw new Error('Invalid tracking limit: '+name);
    if(!input.submission.requirePortalConfirmation||!input.submission.requireAcknowledgement)throw new Error('Completion evidence and acknowledgement cannot be disabled.');
    return structuredClone(input);
  }
  function create({url,fetch}){let ready;return {load:()=>ready||=(async()=>{const response=await fetch(url);if(!response.ok)throw new Error('Could not load extension settings.json.');return validate(await response.json());})()};}
  root.SQCDeploymentRuntime={defaults,validate,create};if(typeof module!=='undefined')module.exports=root.SQCDeploymentRuntime;
})(globalThis);
