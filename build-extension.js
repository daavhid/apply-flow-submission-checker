/* Package only the internal Q&A extension. Legacy SQC sources are excluded. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const JSZip=require('jszip');
const client=require('./ai/client');
const ROOT_DIR=__dirname;
const EXTENSION_FILES = ['manifest.json', 'ai', 'icons'];
const DIST_DIR=path.join(ROOT_DIR,'dist');
const OUTPUT=path.join(DIST_DIR,'extension');
async function build(){
  const scope={};vm.runInNewContext(fs.readFileSync(path.join(ROOT_DIR,'ai/config.js'),'utf8'),scope);
  const config=scope.SQC_AI_CONFIG;
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT_DIR,'manifest.json'),'utf8'));
  if(config.endpoint){
    manifest.host_permissions=[...new Set([...(manifest.host_permissions||[]),...[config.endpoint,config.localEndpoint].filter(Boolean).map(value=>new URL(client.endpoint(value)).origin+'/*')])];
  }else{
    console.warn('Internal API endpoint is not configured. This review build cannot fetch live answers.');
  }
  const relative=path.relative(ROOT_DIR,DIST_DIR);
  if(!relative || relative.startsWith('..') || path.isAbsolute(relative) || fs.existsSync(DIST_DIR)&&fs.lstatSync(DIST_DIR).isSymbolicLink()) throw new Error('Build output must stay inside this workspace.');
  fs.rmSync(DIST_DIR,{recursive:true,force:true});fs.mkdirSync(OUTPUT,{recursive:true});
  for(const file of EXTENSION_FILES) fs.cpSync(path.join(ROOT_DIR,file),path.join(OUTPUT,file),{recursive:true});
  fs.writeFileSync(path.join(OUTPUT,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const zip=new JSZip();
  function include(folder){
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const file=path.join(folder,entry.name);
      if(entry.isDirectory()) include(file);
      else zip.file(path.relative(OUTPUT,file).split(path.sep).join('/'),fs.readFileSync(file));
    }
  }
  include(OUTPUT);
  const archive=path.join(DIST_DIR,'applyflow-qa-extension.zip');
  fs.writeFileSync(archive,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log('Q&A-only unpacked extension: '+OUTPUT);
  console.log('Q&A-only ZIP: '+archive);
}
if(require.main===module)build().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={build};
