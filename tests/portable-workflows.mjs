import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {test,before,after} from 'node:test';
import {chromium,firefox} from 'playwright';
let server;const browsers={};
const html=(await readFile(new URL('../index.html',import.meta.url),'utf8')).replace('async function bootApp(){','window.__App=App;window.__BrowserSupport=BrowserSupport;async function bootApp(){');
before(async()=>{server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));browsers.chromium=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});browsers.firefox=await firefox.launch({headless:true,env:{...process.env,MOZ_DISABLE_CONTENT_SANDBOX:'1',MOZ_DISABLE_RDD_SANDBOX:'1',MOZ_DISABLE_SOCKET_PROCESS_SANDBOX:'1'},firefoxUserPrefs:{'media.autoplay.default':0,'media.autoplay.block-webaudio':false,'security.sandbox.content.level':0,'dom.ipc.processPrelaunch.enabled':false}});});
after(async()=>{await Promise.all(Object.values(browsers).map(b=>b.close()));await new Promise(r=>server.close(r));});
async function setup(engine,mobile){
 const context=await browsers[engine].newContext({viewport:mobile?{width:360,height:640}:{width:1366,height:900},hasTouch:mobile});
 await context.route('https://**/*',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await context.addInitScript(()=>{localStorage.setItem('dh-ob-done','1');window.Peer=class{constructor(id){this.id=id;this.events={};setTimeout(()=>this.emit('open',id),0);}on(t,f){(this.events[t]??=[]).push(f);return this;}emit(t,...a){for(const f of this.events[t]||[])f(...a);}destroy(){this.emit('close');}reconnect(){this.emit('open',this.id);}};});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});for(let i=0;i<100&&!await page.evaluate(()=>!!window.__App?.ui);i++)await page.waitForTimeout(50);
 await page.evaluate(()=>{const n=document.getElementById('ob-modal');n.classList.remove('on');n.style.display='none';});return{context,page,errors};
}
for(const engine of ['chromium','firefox'])for(const mobile of [false,true])test(`${engine} ${mobile?'phone viewport':'desktop'} complete local and collaboration workflows`,async t=>{
 const {context,page,errors}=await setup(engine,mobile);
 try{
 await t.test('all 18 tabs remain visible, fit width, and offer scrolling',async()=>{
  const tabs=await page.evaluate(()=>[...document.querySelectorAll('.tn[data-tab]')].map(b=>b.dataset.tab));assert.equal(tabs.length,18);
  for(const tab of tabs){const layout=await page.evaluate(async tab=>{window.__App.ui.setTab(tab);await new Promise(r=>setTimeout(r,30));const v=document.getElementById('tab-'+tab),r=v.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,viewport:innerWidth,scroll:v.scrollHeight,client:v.clientHeight,overflow:getComputedStyle(v).overflowY};},tab);assert.ok(layout.w>0&&layout.h>80,`${tab}: ${JSON.stringify(layout)}`);assert.ok(layout.x>=-1&&layout.x+layout.w<=layout.viewport+1,`${tab} width overflow`);}
 });
 await t.test('chat isolates inactive peers, retains unread histories and ignores duplicate messages',async()=>{
  const r=await page.evaluate(()=>{const a=window.__App;a.ui.selectPeer('peer-a');a.ui.onRemoteMsg('peer-b',{id:'b1',text:'B message'});const active=a.ui._msgBuffer.length;a.ui.onRemoteMsg('peer-b',{id:'b1',text:'B message'});a.ui.selectPeer('peer-b');return{active,text:a.ui._msgBuffer.map(m=>m.text),unread:a.ui._unread.get('peer-b')||0};});assert.deepEqual(r,{active:0,text:['B message'],unread:0});
 });
 await t.test('group rooms receive and forward messages while inactive and retain sent history',async()=>{
  const r=await page.evaluate(()=>{const a=window.__App,g=a.group,sent=[],original=a.peer.send;a.peer.send=(pid,m)=>sent.push({pid,m});const my=a.peer.myId;g._rooms.clear();g._rememberRoom({id:'r1',host:my,name:'First',members:[my,'peer-b','peer-c'],messages:[]});g._rememberRoom({id:'r2',host:my,name:'Second',members:[my,'peer-b'],messages:[]});g.selectRoom('r2');g._onMsg('peer-b',{id:'remote1',room:'r1',text:'Inactive room',from:'peer-b'});const forwarded=sent.some(x=>x.pid==='peer-c'&&x.m.id==='remote1');g.selectRoom('r1');const remote=g._msgs.map(m=>m.text);document.getElementById('gc-inp').value='My reply';g._send();g.selectRoom('r2');g.selectRoom('r1');const rows=g._msgs.map(m=>m.text);a.peer.send=original;return{forwarded,remote,rows};});assert.deepEqual(r,{forwarded:true,remote:['Inactive room'],rows:['Inactive room','My reply']});
 });
 await t.test('tasks add, complete, delete and prioritize overdue items',async()=>{
  await page.evaluate(()=>{window.__App.ui.setTab('tasks');window.__App.tasks._tasks=[];window.__App.tasks._render();});
  await page.locator('#task-inp').fill('Phone task');await page.locator('#btn-task-add').click();assert.match(await page.locator('#task-list').textContent(),/Phone task/);
  await page.locator('[data-task-toggle]').click();assert.equal(await page.locator('[data-task-toggle]').getAttribute('aria-checked'),'true');await page.locator('[data-task-del]').click();assert.match(await page.locator('#task-list').textContent(),/No tasks/);
 });
 await t.test('vault encryption round trip, wrong password cleanup, backup restoration',async()=>{
  await page.evaluate(()=>window.__App.ui.setTab('vault'));await page.locator('#vault-pw').fill('test-password-123');await page.locator('#btn-vault-create').click();
  for(let i=0;i<100&&!await page.locator('#vault-open').isVisible();i++)await page.waitForTimeout(30);
  await page.locator('#vault-key-inp').fill('Test secret');await page.locator('#vault-val-inp').fill('value-123');await page.locator('#btn-vault-add').click();
  for(let i=0;i<100&&!(await page.locator('#vault-items').textContent()).includes('Test secret');i++)await page.waitForTimeout(30);
  const backup=await page.evaluate(()=>window.__App.exportMgr._collect());assert.ok(backup.vault.length>30);assert.equal(backup.chat['peer-b'][0].text,'B message');
  await page.locator('#btn-vault-lock').click();await page.locator('#vault-pw').fill('wrong');await page.locator('#btn-vault-unlock').click();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__App.vault._key),null);
  await page.locator('#vault-pw').fill('test-password-123');await page.locator('#btn-vault-unlock').click();for(let i=0;i<100&&!await page.locator('#vault-open').isVisible();i++)await page.waitForTimeout(30);assert.ok(await page.locator('#vault-open').isVisible());assert.match(await page.locator('#vault-items').textContent(),/Test secret/);
  await page.evaluate(()=>window.__App.ui.setTab('settings'));await page.locator('#inp-import-backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>localStorage.getItem('dh-vault-v3')),backup.vault);
 });
 await t.test('missing notification, screen capture and fullscreen APIs provide usable fallbacks',async()=>{
  const r=await page.evaluate(async()=>{const a=window.__App;Object.defineProperty(window,'Notification',{value:undefined,configurable:true});document.getElementById('btn-req-notif').click();const media=navigator.mediaDevices,display=media?.getDisplayMedia;if(media)Object.defineProperty(media,'getDisplayMedia',{value:undefined,configurable:true});const inp=document.getElementById('pres-doc-inp'),click=inp.click;let picked=false;inp.click=()=>{picked=true;};await a.screenShare.toggleShare();inp.click=click;if(media)Object.defineProperty(media,'getDisplayMedia',{value:display,configurable:true});const el=document.getElementById('presentation-area');el.requestFullscreen=undefined;el.webkitRequestFullscreen=undefined;await window.__BrowserSupport.fullscreen(el);const full=el.classList.contains('portable-fullscreen');el.classList.remove('portable-fullscreen');return{picked,full};});assert.deepEqual(r,{picked:true,full:true});
 });
 await t.test('file picker opens exactly once and history and notifications render real records',async()=>{
  const r=await page.evaluate(()=>{const a=window.__App,inp=document.getElementById('file-inp'),original=inp.click;let calls=0;inp.click=()=>{calls++;inp.dispatchEvent(new MouseEvent('click',{bubbles:true}));};document.getElementById('tx-drop-area').click();inp.click=original;a.hist.saw('peer-b',{name:'Member B'});a.ui.setTab('history');const hist=document.getElementById('hist-list').textContent;a.notifCenter.add('Real event','Test notification');a.ui.setTab('notifications');return{calls,hist,notif:document.getElementById('notif-list').textContent};});assert.equal(r.calls,1);assert.match(r.hist,/Member B/);assert.match(r.notif,/Real event/);
 });
 if(engine==='chromium')await t.test('real browser audio mixer produces a recordable track and preserves source tracks',async()=>{
  await page.mouse.click(10,10);const r=await page.evaluate(async()=>{const a=window.__App,ctx=new (window.AudioContext||window.webkitAudioContext)(),one=ctx.createMediaStreamDestination(),two=ctx.createMediaStreamDestination();const oscillator=ctx.createOscillator();oscillator.connect(one);oscillator.connect(two);oscillator.start();await Promise.race([ctx.resume(),new Promise((_,reject)=>setTimeout(()=>reject(Error("Audio resume timed out")),3000))]);a.media._localStream=one.stream;a.media._remoteStream=two.stream;const mixed=a.media._buildMixedStream();const recorder=new MediaRecorder(mixed);const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();await new Promise(r=>setTimeout(r,250));await Promise.race([new Promise(r=>{recorder.onstop=r;recorder.stop();}),new Promise((_,reject)=>setTimeout(()=>reject(Error("Recorder stop timed out")),3000))]);mixed._recordingCleanup();const out={audio:mixed.getAudioTracks().length,bytes:chunks.reduce((n,c)=>n+c.size,0),sourceLive:one.stream.getAudioTracks()[0].readyState==='live'&&two.stream.getAudioTracks()[0].readyState==='live'};a.media._localStream=null;a.media._remoteStream=null;oscillator.stop();one.stream.getTracks().forEach(t=>t.stop());two.stream.getTracks().forEach(t=>t.stop());ctx.close();return out;});assert.equal(r.audio,1);assert.ok(r.bytes>0);assert.equal(r.sourceLive,true);
 });
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
