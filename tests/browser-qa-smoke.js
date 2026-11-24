/* Optional real-Chrome smoke test: node tests/browser-qa-smoke.js */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const sidebar=process.argv.includes('--sidebar');
const browser=process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(browser)) throw new Error('Set CHROME_PATH to a Chrome executable.');
const artifacts=path.join(root,'.test-artifacts','qa-browser');fs.mkdirSync(artifacts,{recursive:true});
const profile=path.join(artifacts,'profile-'+Date.now());
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':'text/html');
  fs.createReadStream(file).pipe(res);
});
server.listen(0,'127.0.0.1',async()=>{
  const url=`http://127.0.0.1:${server.address().port}/${sidebar?'sidebar/sidebar.html':'ai/app.html'}`;
  const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--user-data-dir='+profile,'--remote-debugging-port=0','--window-size=380,820',url],{windowsHide:true});
  let errors='',socket,sequence=0;const pending=new Map();
  child.stderr.on('data',b=>{errors+=b;});child.stdout.resume();
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const timeout=setTimeout(()=>{child.kill();server.close();console.error('Browser smoke test timed out');process.exitCode=1;},35000);
  try {
    let port;
    for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break;}catch(_){}await delay(100);}
    if(!port)throw new Error(errors.slice(-1500)||'Chrome debugging port did not become available.');
    let target;
    for(let i=0;i<50;i++){const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();target=pages.find(p=>p.type==='page'&&p.url===url);if(target)break;await delay(100);}
    if(!target)throw new Error('The smoke-test page was not opened.');
    socket=new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('message',event=>{const data=JSON.parse(event.data),request=pending.get(data.id);if(!request)return;pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result);});
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    if(sidebar){
      await call('Page.enable');
      await call('Page.addScriptToEvaluateOnNewDocument',{source:fs.readFileSync(path.join(__dirname,'fixtures/sidebar-chrome.js'),'utf8')});
      await call('Page.navigate',{url});
      for(let i=0;i<100;i++){const ready=await call('Runtime.evaluate',{expression:'!!window.__context && !!window.chrome?.runtime',returnByValue:true});if(ready.result.value)break;await delay(50);}
    }
    await call('Emulation.setDeviceMetricsOverride',{width:380,height:820,deviceScaleFactor:1,mobile:false});
    for(let i=0;i<100;i++){const ready=await call('Runtime.evaluate',{expression:'document.readyState==="complete" && !!document.getElementById("questions")',returnByValue:true});if(ready.result.value)break;await delay(50);}
    const script=fs.readFileSync(path.join(__dirname,sidebar?'sidebar-browser-check.js':'qa-browser-check.js'),'utf8');
    const result=await call('Runtime.evaluate',{expression:script+(sidebar?';runSidebarSmoke()':';runQASmoke()'),awaitPromise:true,returnByValue:true});
    const state=result.exceptionDetails ? {state:'failed',text:result.exceptionDetails.exception?.description || result.exceptionDetails.text} : {state:'passed',text:result.result.value};
    if(state.state==='passed'&&!sidebar){
      const bridge=fs.readFileSync(path.join(root,'ai/form-state.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'ai/form-bridge.js'),'utf8'),formTest=fs.readFileSync(path.join(__dirname,'qa-form-browser-check.js'),'utf8');
      const forms=await call('Runtime.evaluate',{expression:bridge+'\n'+formTest+';runFormBridgeSmoke()',awaitPromise:true,returnByValue:true});
      if(forms.exceptionDetails){state.state='failed';state.text=forms.exceptionDetails.exception?.description || forms.exceptionDetails.text;}
    }
    if(state.state==='passed'&&!sidebar){
      const paylocity=fs.readFileSync(path.join(__dirname,'qa-paylocity-browser-check.js'),'utf8');
      const result=await call('Runtime.evaluate',{expression:paylocity+';runPaylocitySmoke()',awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails){state.state='failed';state.text=result.exceptionDetails.exception?.description || result.exceptionDetails.text;}
    }
    if(state.state==='passed'&&!sidebar){
      const script=fs.readFileSync(path.join(__dirname,'qa-defaults-browser-check.js'),'utf8');
      const result=await call('Runtime.evaluate',{expression:script+';runDefaultsSmoke()',awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails){state.state='failed';state.text=result.exceptionDetails.exception?.description || result.exceptionDetails.text;}
    }
    if(state.state==='passed'&&!sidebar){
      const script=fs.readFileSync(path.join(__dirname,'qa-whole-form-browser-check.js'),'utf8');
      const result=await call('Runtime.evaluate',{expression:script+';runWholeFormSmoke()',awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails){state.state='failed';state.text=result.exceptionDetails.exception?.description || result.exceptionDetails.text;}
    }
    if(state.state==='passed'&&!sidebar){
      const script=fs.readFileSync(path.join(__dirname,'qa-attachment-browser-check.js'),'utf8');
      const result=await call('Runtime.evaluate',{expression:script+';runAttachmentSmoke()',awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails){state.state='failed';state.text=result.exceptionDetails.exception?.description || result.exceptionDetails.text;}
    }
    if(state.state==='passed'&&sidebar){
      const script=fs.readFileSync(path.join(__dirname,'resume-experience-browser-check.js'),'utf8');
      const result=await call('Runtime.evaluate',{expression:script+';runExperienceSmoke()',awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails){state.state='failed';state.text=result.exceptionDetails.exception?.description||result.exceptionDetails.text;}
    }
    if(state.state==='passed'&&sidebar){
      const oracle=fs.readFileSync(path.join(__dirname,'oracle-history-browser-check.js'),'utf8');
      const rippling=fs.readFileSync(path.join(__dirname,'rippling-attachment-browser-check.js'),'utf8');
      const ripplingResult=await call('Runtime.evaluate',{expression:rippling+';runRipplingAttachmentSmoke()',awaitPromise:true,returnByValue:true});
      if(ripplingResult.exceptionDetails)throw new Error(ripplingResult.exceptionDetails.exception?.description||ripplingResult.exceptionDetails.text);
      const oracleResult=await call('Runtime.evaluate',{expression:oracle+';runOracleHistorySmoke()',awaitPromise:true,returnByValue:true});
      if(oracleResult.exceptionDetails)throw new Error(oracleResult.exceptionDetails.exception?.description||oracleResult.exceptionDetails.text);
      const script=fs.readFileSync(path.join(__dirname,'embedded-navigation-browser-check.js'),'utf8');
      const result=await call('Runtime.evaluate',{expression:script+';runEmbeddedNavigationSmoke()',awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails){state.state='failed';state.text=result.exceptionDetails.exception?.description||result.exceptionDetails.text;}
    }
    if(state.state==='passed'&&!sidebar){
      const source=fs.readFileSync(path.join(root,'content/extractor.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'content/validator.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'platform-coverage-browser-check.js'),'utf8');
      const result=await call('Runtime.evaluate',{expression:source+';runPlatformCoverageSmoke()',awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails){state.state='failed';state.text=result.exceptionDetails.exception?.description||result.exceptionDetails.text;}
    }
    if(state.state==='passed'&&sidebar){
      const source=fs.readFileSync(path.join(root,'content/sidebar-launch.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'sidebar-launch-browser-check.js'),'utf8');
      const result=await call('Runtime.evaluate',{expression:source+';runSidebarLauncherSmoke()',awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails){state.state='failed';state.text=result.exceptionDetails.exception?.description||result.exceptionDetails.text;}
    }
    const dom=await call('Runtime.evaluate',{expression:'document.documentElement.outerHTML',returnByValue:true});fs.writeFileSync(path.join(artifacts,'result.html'),dom.result.value);
    const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,sidebar?'sidebar.png':'qa.png'),Buffer.from(shot.data,'base64'));
    if(sidebar&&state.state==='passed')for(const view of ['overview','resume']){
      await call('Runtime.evaluate',{expression:"document.getElementById('tab-"+view+"').click();document.getElementById('workspace-feedback').hidden=true;window.scrollTo(0,0)"});
      await delay(200);
      const preview=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'sidebar-'+view+'.png'),Buffer.from(preview.data,'base64'));
    }
    if(state?.state!=='passed')throw new Error(state?.text || errors.slice(-1500));
    console.log(sidebar?'Real Chrome passed: unified SQC/Q&A sidebar, assigned context, no floating HUD, and portal-only completion evidence.':'Real Chrome passed: standalone Q&A, resume uploads, exact choices and manual-edit protection (test API).');
  }catch(error){console.error(error.message);process.exitCode=1;}
  finally{clearTimeout(timeout);if(socket?.readyState===1){await call('Browser.close').catch(()=>{});socket.close();}child.kill();server.close();}
});
