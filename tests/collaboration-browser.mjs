import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {test,before,after} from 'node:test';
import {chromium} from 'playwright';
async function outputMatches(check){for(let i=0;i<100;i++){if(check(await page.locator('#ce-output').textContent()))return;await page.waitForTimeout(100);}throw Error('Unexpected output: '+await page.locator('#ce-output').textContent());}
let browser,server,page;
const html=(await readFile(new URL('../index.html',import.meta.url),'utf8')).replace('async function bootApp(){','window.__App=App;async function bootApp(){');
before(async()=>{
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.route('https://**/*',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.addInitScript(()=>{
  localStorage.setItem('dh-ob-done','1');
  window.Peer=class{constructor(id){this.id=id;this.events={};setTimeout(()=>this.emit('open',id),0);}on(t,f){(this.events[t]??=[]).push(f);return this;}emit(t,...a){for(const f of this.events[t]||[])f(...a);}destroy(){this.emit('close');}reconnect(){this.emit('open',this.id);}};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 for(let i=0;i<100&&!await page.evaluate(()=>!!window.__App?.ui);i++)await page.waitForTimeout(50);
 await page.evaluate(()=>{const n=document.getElementById('ob-modal');n.classList.remove('on');n.style.display='none';});
});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
test('whiteboard maps screen coordinates, keeps taps and synchronizes undo/redo',async()=>{
 const result=await page.evaluate(async()=>{
  const app=window.__App;app.ui.setTab('whiteboard');await app.board.initOnce();
  const b=app.board,c=document.getElementById('wb-canvas'),r=c.getBoundingClientRect(),messages=[];
  const old=app.peer.broadcast;app.peer.broadcast=m=>messages.push(m);
  const p=b._pos({clientX:r.left+r.width/2,clientY:r.top+r.height/2});
  const capture=c.setPointerCapture;c.setPointerCapture=()=>{};c.releasePointerCapture=()=>{};c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:42,clientX:r.left+20,clientY:r.top+20,bubbles:true}));
  c.dispatchEvent(new PointerEvent('pointerup',{pointerId:42,clientX:r.left+20,clientY:r.top+20,bubbles:true}));
  c.setPointerCapture=capture;const stroke=b._strokes.at(-1);b._undo();const removed=b._strokes.length===0;b._redo2();
  b._onRemoteStroke('x',{stroke});const dedup=b._strokes.length===1;
  b._onRemote({action:'remove',id:stroke.id});app.peer.broadcast=old;
  return{p,tap:stroke.pts.length,removed,dedup,final:b._strokes.length,types:messages.map(x=>x.action||x.type)};
 });
 assert.deepEqual(result.p,{x:800,y:500});assert.equal(result.tap,2);assert.equal(result.removed,true);assert.equal(result.dedup,true);assert.equal(result.final,0);assert.deepEqual(result.types,['wb-stroke','remove','wb-stroke']);
});
test('code runner returns logs and syntax errors and terminates infinite loops',async()=>{
 await page.evaluate(()=>window.__App.ui.setTab('code'));
 await page.locator('#code-editor-area').fill('console.log("working", 42)');
 await page.locator('#btn-code-run').click();await outputMatches(t=>t==='working 42');
 await page.locator('#code-editor-area').fill('const = broken');await page.locator('#btn-code-run').click();
 await outputMatches(t=>t.startsWith('Error:'));
 await page.locator('#code-editor-area').fill('while(true){}');await page.locator('#btn-code-run').click();
 await outputMatches(t=>t==='Execution timed out.');
 assert.equal(await page.evaluate(()=>document.querySelectorAll('iframe[sandbox]').length),0);
});
test('meeting camera changes video without muting microphone',async()=>{
 const r=await page.evaluate(()=>{const a=window.__App,audio={enabled:true},video={enabled:true};a.groupVideo._stream={getVideoTracks:()=>[video]};a.meetings.toggleCamera();const off=!video.enabled;a.meetings.toggleCamera();a.groupVideo._stream=null;return{off,on:video.enabled,audio:audio.enabled};});
 assert.deepEqual(r,{off:true,on:true,audio:true});
});
test('camera addition releases unused microphone and failed acquisition tracks',async()=>{
 const r=await page.evaluate(async()=>{
  const a=window.__App,m=a.media,unused={kind:'audio',stop(){this.stopped=true;}},video={kind:'video',enabled:true,stop(){this.stopped=true;}};
  const original=m.acquire;m.acquire=async()=>({getAudioTracks:()=>[unused],getVideoTracks:()=>[video],getTracks:()=>[unused,video]});
  m._call={peerConnection:{addTrack(){}}};m._localStream=new MediaStream();await m.toggleVideo();
  const failed=video.stopped===true;m._call=null;m._localStream=null;m.acquire=original;return{mic:unused.stopped,failed};
 });
 // Fake track cannot form a native MediaStream: catch must release both tracks.
 assert.deepEqual(r,{mic:true,failed:true});
});
test('presentation zoom changes the rendered page and stopping clears video',async()=>{
 const r=await page.evaluate(()=>{const a=window.__App,p=a.presentation,old=p._renderPage;let calls=0;p._renderPage=async()=>{calls++;};document.getElementById('doc-zoom').dispatchEvent(new Event('input'));p._renderPage=old;p.stop();return{calls,video:document.getElementById('presenter-video').srcObject,empty:document.getElementById('pres-empty').style.display};});
 assert.deepEqual(r,{calls:1,video:null,empty:''});
});
test('stream replacement preserves shared microphone tracks and stops removed tracks',async()=>{
 const r=await page.evaluate(()=>{
  const registry=new window.__App.streamReg.constructor();const mic={stop(){this.stopped=true;}},oldVideo={stop(){this.stopped=true;}},camera={stop(){this.stopped=true;}};
  const original={getTracks:()=>[mic,oldVideo]},replacement={getTracks:()=>[mic,camera]};
  registry.register('call',original);registry.register('call',replacement);registry.register('call',replacement);
  const preserved=!mic.stopped&&!camera.stopped&&oldVideo.stopped;registry.stop('call');return{preserved,stopped:mic.stopped&&camera.stopped};
 });assert.deepEqual(r,{preserved:true,stopped:true});
});
test('saved code restores after a fresh lazy module initialization',async()=>{
 const value=await page.evaluate(async()=>{localStorage.setItem('dh-code-saved','console.log("restored")');const code=new window.__App.code.constructor();await Promise.all([code.initOnce(),code.initOnce()]);return document.getElementById('code-editor-area').value;});
 assert.equal(value,'console.log("restored")');
});
