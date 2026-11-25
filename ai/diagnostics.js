/* Allowlisted Q&A error metadata. Never serialize request bodies, answers or credentials. */
(function(root){
  'use strict';
  function from(error={},context={}){
    const prior=error.debug||{},message=String(error.message||error.reason||error.error||'');
    const token=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:/-]{1,180}$/.test(value)&&! /^(?:sk-|sess-|rk-|Bearer|eyJ)/i.test(value)?value:undefined;
    const status=value=>Number.isInteger(Number(value))&&Number(value)>=100&&Number(value)<=599?Number(value):undefined;
    const httpStatus=status(error.status||prior.httpStatus)||status(/ApplyFlow HTTP\s+(\d{3})/i.exec(message)?.[1]);
    const providerStatus=status(error.providerStatus||prior.providerStatus)||status(/(?:\:\s*|provider[^\n]{0,30})(429|401|403|500|502|503)\b/i.exec(message)?.[1]);
    let classification=['PROVIDER_QUOTA','PROVIDER_AUTH','RATE_LIMIT','CONTEXT_CHANGED','TIMEOUT','APPLYFLOW_AUTH','CANCELLED','REQUEST_FAILED'].includes(prior.classification)?prior.classification:'REQUEST_FAILED',summary='The answer request failed. Inspect the status and request IDs below.',action='Retry once; share these details with the ApplyFlow administrator if it fails again.';
    if(/no credits|insufficient.quota|quota.{0,25}(?:exhaust|exceed)|credit.{0,20}remaining/i.test(message)||classification==='PROVIDER_QUOTA'){classification='PROVIDER_QUOTA';summary='The AI provider has no available credits or quota.';action='Ask the ApplyFlow administrator to check the provider account, project quota and billing. Retrying will not restore credits.';}
    else if(/invalid.api.key|incorrect.api.key|provider.{0,30}(?:unauthorized|authentication)/i.test(message)||classification==='PROVIDER_AUTH'){classification='PROVIDER_AUTH';summary='The AI provider rejected its credentials.';action='Ask the ApplyFlow administrator to verify the deployed provider key and project.';}
    else if(httpStatus===429||providerStatus===429||/rate.limit/i.test(message)){classification='RATE_LIMIT';summary='The request was rate limited.';action='Wait before retrying; check the provider/server rate limits if this persists.';}
    else if(/version|assignment.{0,20}changed|resume.{0,20}changed|context.*match/i.test(message)||/VERSION|CONTEXT/.test(error.state||'')){classification='CONTEXT_CHANGED';summary='Application verification changed during the request.';action='Refresh the application context and request fresh answers.';}
    else if(/timeout|timed out/i.test(message)||error.state==='TIMEOUT'){classification='TIMEOUT';summary='Answer generation timed out.';action='Retry a smaller batch and check provider latency.';}
    else if(httpStatus===401||httpStatus===403){classification='APPLYFLOW_AUTH';summary='ApplyFlow rejected authorization for this request.';action='Check the extension sign-in and assigned job permissions.';}
    else if(/CANCELLED|stopped|cancelled/i.test(error.state||message)){classification='CANCELLED';summary='The answer request was cancelled.';action='Start a new request when ready.';}
    const rawPath=error.path||prior.path||/\bat\s+(\/api\/[^\s:]+)/i.exec(message)?.[1]||'',path=typeof rawPath==='string'&&rawPath.startsWith('/api/')?rawPath.split(/[?#]/)[0].slice(0,300):undefined;
    const providerFailure=classification.startsWith('PROVIDER_')||providerStatus;
    return Object.fromEntries(Object.entries({schemaVersion:1,at:new Date().toISOString(),requestId:token(context.requestId||prior.requestId),batchRequestId:token(context.batchRequestId||prior.batchRequestId||error.batchRequestId||(context.requestId&&context.requestId!==prior.requestId?prior.requestId:undefined)),
      extensionVersion:token(context.extensionVersion||prior.extensionVersion),classification,summary,action,
      stage:token(error.stage||prior.stage||context.stage)||(providerFailure?'provider':/\/requests\/|\/runs\//.test(path||'')?'polling':'applyflow_request'),
      httpStatus,providerStatus,path,code:token(error.backendCode||error.code||error.state||prior.code),jobStatus:token(error.jobStatus||prior.jobStatus),provider:token(error.provider||prior.provider),runId:token(error.runId||prior.runId),
      questionCount:Number.isInteger(context.questionCount)?context.questionCount:Number.isInteger(prior.questionCount)?prior.questionCount:undefined}).filter(([,value])=>value!==undefined));
  }
  root.SQCQADiagnostics={from};if(typeof module!=='undefined')module.exports=root.SQCQADiagnostics;
})(globalThis);
