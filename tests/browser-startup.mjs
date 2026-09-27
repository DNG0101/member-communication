import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {test,before,after} from 'node:test';
import {chromium} from 'playwright';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
let browser,server,url;const opened=[];
before(async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url));
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/member/`;
 browser=await chromium.launch({headless:true});
});
after(async()=>{for(const c of opened)await c.close();await browser?.close();await new Promise(r=>server?.close(r));});
async function open({viewport={width:1440,height:900},storageBlocked=false,network='stub'}={}){
 const context=await browser.newContext({viewport});opened.push(context);
 await context.route('https://**/*',r=>network==='offline'?r.abort():r.fulfill({contentType:'application/javascript',body:''}));
 await context.addInitScript(({storageBlocked,network})=>{
  if(storageBlocked){Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage disabled','SecurityError');}});Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Storage disabled','SecurityError');}});}
  if(network==='stub')window.Peer=class{
   constructor(id){this.id=id;this.events={};this.destroyed=false;this.disconnected=false;setTimeout(()=>this.emit('open',id),0);}
   on(type,fn){(this.events[type]??=[]).push(fn);return this;}
   emit(type,...args){for(const fn of this.events[type]||[])fn(...args);}
   reconnect(){this.disconnected=false;this.emit('open',this.id);}
   destroy(){this.destroyed=true;this.emit('close');}
   call(){throw Error('Media not used in startup tests');}
  };
 },{storageBlocked,network});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await page.locator('#btn-ob-start').waitFor({state:'visible'});return {page,errors};
}
async function visibleStep(page,n){assert.equal(await page.locator('.ob-step:visible').count(),1);assert.equal(await page.locator(`#ob-step-${n}`).isVisible(),true);assert.equal(await page.locator('#ob-modal').getAttribute('aria-labelledby'),`ob-title-${n}`);}

test('desktop: complete onboarding, visit all 17 tabs and retain completion after reload',async()=>{
 const {page,errors}=await open();await visibleStep(page,0);await page.locator('#ob-name').fill('Nithish');await page.locator('#btn-ob-start').click();await visibleStep(page,1);
 // The second boot-complete timer must not reset or rebind this page.
 await page.waitForTimeout(700);await visibleStep(page,1);assert.equal(await page.locator('#ob-title-1').textContent(),'Connect with a member');
 await page.locator('#btn-ob-next').click();await visibleStep(page,2);await page.screenshot({path:join(tmpdir(),'member-onboarding-desktop.png'),animations:'disabled'});await page.locator('#btn-ob-finish').click();assert.equal(await page.locator('#ob-modal').isVisible(),false);
 const tabs=await page.locator('.tn[data-tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.tab));assert.equal(tabs.length,17);
 for(const tab of tabs){await page.locator(`.tn[data-tab="${tab}"]`).click();assert.equal(await page.locator(`#tab-${tab}`).isVisible(),true,tab);}
 assert.equal(await page.evaluate(()=>localStorage.getItem('dh-name')),'Nithish');await page.reload();await page.waitForTimeout(800);assert.equal(await page.locator('#ob-modal').isVisible(),false);assert.deepEqual(errors,[]);
});

test('mobile: pages and Back/Skip stay usable in a narrow, short viewport',async()=>{
 const {page,errors}=await open({viewport:{width:320,height:440}});await page.locator('#btn-ob-start').click();await visibleStep(page,1);await page.locator('#btn-ob-next').click();await visibleStep(page,2);await page.locator('#btn-ob-back-2').click();await visibleStep(page,1);await page.locator('#btn-ob-back-1').click();await visibleStep(page,0);
 await page.locator('#btn-ob-start').click();await page.screenshot({path:join(tmpdir(),'member-onboarding-mobile.png'),animations:'disabled'});await page.locator('#btn-ob-skip').click();assert.equal(await page.locator('#ob-modal').isVisible(),false);assert.deepEqual(errors,[]);
});

test('keyboard: Enter advances, Tab stays inside, Escape dismisses and restores focus',async()=>{
 const {page,errors}=await open();await page.locator('#ob-name').fill('Keyboard user');await page.keyboard.press('Enter');await visibleStep(page,1);
 await page.locator('#btn-ob-next').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-ob-close');await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-ob-next');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#ob-modal').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'jin');assert.deepEqual(errors,[]);
});

test('storage disabled: welcome can close and does not return in the same page',async()=>{
 const {page,errors}=await open({storageBlocked:true});await page.locator('#ob-name').fill('Guest');await page.locator('#btn-ob-start').click();await visibleStep(page,1);await page.locator('#btn-ob-close').click();await page.waitForTimeout(700);assert.equal(await page.locator('#ob-modal').isVisible(),false);assert.deepEqual(errors,[]);
});

test('unavailable PeerJS: guide and local modules remain usable after the startup timeout',async()=>{
 const {page,errors}=await open({network:'offline'});await page.locator('#btn-ob-start').click();await visibleStep(page,1);await page.locator('#btn-ob-next').click();await visibleStep(page,2);await page.locator('#btn-ob-finish').click();
 await page.locator('#btn-peerjs-dismiss').click();assert.equal(await page.locator('#peerjs-fail-banner').isVisible(),false);await page.locator('.tn[data-tab="notes"]').click();await page.locator('#notepad').fill('Local notes remain usable.');await page.waitForTimeout(11000);
 assert.equal(await page.locator('#ob-modal').isVisible(),false);assert.equal(await page.locator('#notepad').inputValue(),'Local notes remain usable.');assert.deepEqual(errors,[]);
});
