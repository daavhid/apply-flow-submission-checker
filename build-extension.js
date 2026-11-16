/* Build the full SQC release and the standalone Q&A release from shared sources. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const JSZip=require('jszip');
const client=require('./ai/client');
const ROOT_DIR=__dirname;
const PROFILES={
  sqc:{manifest:'manifest.json',files:['background','content','popup','onboarding','ui','options','ai','icons'],folder:'extension',zip:'submission-checker-extension.zip'},
  qa:{manifest:'manifests/qa.json',files:['ai','icons'],folder:'qa/extension',zip:'qa/applyflow-qa-extension.zip'}
};
function safeOutput(relative){
  const dist=path.join(ROOT_DIR,'dist'),target=path.resolve(dist,relative),inside=path.relative(dist,target);
  if(!inside||inside.startsWith('..')||path.isAbsolute(inside))throw new Error('Build output must stay inside dist.');
  for(let current=target;current!==ROOT_DIR;current=path.dirname(current))if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('Build output cannot use symbolic links.');
  return target;
}
async function build(profileName='sqc'){
  const profile=PROFILES[profileName];if(!profile)throw new Error('Choose --profile=sqc or --profile=qa.');
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT_DIR,profile.manifest),'utf8'));
  if(profileName==='qa'){
    const scope={};vm.runInNewContext(fs.readFileSync(path.join(ROOT_DIR,'ai/config.js'),'utf8'),scope);
    const config=scope.SQC_AI_CONFIG;
    if(config.endpoint)manifest.host_permissions=[...new Set([...(manifest.host_permissions||[]),...[config.endpoint,config.localEndpoint].filter(Boolean).map(value=>new URL(client.endpoint(value)).origin+'/*')])];
    else console.warn('Internal AI endpoint is not configured; this Q&A build cannot fetch live answers.');
  }
  const output=safeOutput(profile.folder),archive=safeOutput(profile.zip);
  fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
  for(const item of profile.files)fs.cpSync(path.join(ROOT_DIR,item),path.join(output,item),{recursive:true});
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const zip=new JSZip();
  function include(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())include(file);else zip.file(path.relative(output,file).split(path.sep).join('/'),fs.readFileSync(file));}}
  include(output);fs.mkdirSync(path.dirname(archive),{recursive:true});fs.writeFileSync(archive,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log(profileName.toUpperCase()+' unpacked: '+output);console.log(profileName.toUpperCase()+' ZIP: '+archive);
  return {profile:profileName,output,archive};
}
if(require.main===module){
  const args=process.argv.slice(2),selected=args.find(arg=>arg.startsWith('--profile='));
  (async()=>{if(args.includes('--all')){await build('sqc');await build('qa');}else await build(selected?selected.slice('--profile='.length):'sqc');})().catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={build,PROFILES};
