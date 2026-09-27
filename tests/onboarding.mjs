import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {parseHTML} from 'linkedom';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('const OB={'),html.indexOf('\n};',html.indexOf('const OB={'))+3);
function setup({done=false,storedName='',available=true}={}){
 const {document,Event,KeyboardEvent}=parseHTML(html),values=new Map(),updates=[];
 if(done)values.set('dh-ob-done','1');if(storedName)values.set('dh-name',storedName);
 let active=document.body;Object.defineProperty(document,'activeElement',{get:()=>active});
 for(const node of document.querySelectorAll('button,input,h2,[tabindex]')){node.focus=()=>{active=node;};node.getClientRects=()=>node.closest('[hidden]')?[]:[{}];}
 const SafeStorage={get:(k,v)=>available?(values.get(k)??v):v,set:(k,v)=>{if(available)values.set(k,v);}};
 const Modal={show:id=>document.getElementById(id).classList.add('on'),hide:id=>document.getElementById(id).classList.remove('on')};
 const App={peer:{updateIdentity:()=>updates.push(values.get('dh-name'))}};
 const setEl=(id,value,fn)=>{const el=document.getElementById(id);if(!el)return;if(fn)fn(el);else el.textContent=value;};
 const ob=new Function('document','SafeStorage','Modal','App','setEl',source+';return OB;')(document,SafeStorage,Modal,App,setEl);
 const click=id=>document.getElementById(id).click();
 const key=(id,value,shiftKey=false)=>{const event=new Event('keydown',{bubbles:true,cancelable:true});event.key=value;event.shiftKey=shiftKey;document.getElementById(id).dispatchEvent(event);return event;};
 const visibleSteps=()=>[...document.querySelectorAll('.ob-step')].filter(n=>!n.hidden&&n.style.display!=='none').map(n=>n.id);
 return {ob,document,click,key,visibleSteps,values,updates};
}

test('first visit traverses all three pages without a blank blocking dialog',()=>{
 const h=setup();h.ob.init();assert.deepEqual(h.visibleSteps(),['ob-step-0']);
 h.click('btn-ob-start');assert.deepEqual(h.visibleSteps(),['ob-step-1']);
 assert.equal(h.document.getElementById('ob-modal').getAttribute('aria-labelledby'),'ob-title-1');
 h.click('btn-ob-next');assert.deepEqual(h.visibleSteps(),['ob-step-2']);
 h.click('btn-ob-finish');assert.equal(h.ob.opened,false);assert.equal(h.values.get('dh-ob-done'),'1');assert.equal(h.document.getElementById('ob-modal').classList.contains('on'),false);
});

test('duplicate boot completion neither binds twice nor resets the active page',()=>{
 const h=setup();h.ob.init();h.click('btn-ob-start');h.ob.init();assert.deepEqual(h.visibleSteps(),['ob-step-1']);
 h.document.getElementById('ob-name').value='Nithish';h.click('btn-ob-back-1');h.click('btn-ob-start');assert.equal(h.updates.length,1);
 h.click('btn-ob-close');h.ob.init();assert.equal(h.ob.opened,false);
});

test('name is persisted and propagated to the running connection identity',()=>{
 const h=setup();h.ob.init();h.document.getElementById('ob-name').value='  Nithish  ';h.key('ob-name','Enter');
 assert.equal(h.values.get('dh-name'),'Nithish');assert.equal(h.document.getElementById('my-name-btn').textContent,'Nithish');assert.deepEqual(h.updates,['Nithish']);assert.deepEqual(h.visibleSteps(),['ob-step-1']);
});

test('Back buttons restore the previous visible page',()=>{
 const h=setup();h.ob.init();h.click('btn-ob-start');h.click('btn-ob-next');h.click('btn-ob-back-2');assert.deepEqual(h.visibleSteps(),['ob-step-1']);h.click('btn-ob-back-1');assert.deepEqual(h.visibleSteps(),['ob-step-0']);
});

test('Skip, close and Escape release the overlay independently of peer readiness',()=>{
 for(const method of ['skip','close','escape']){const h=setup();h.ob.init();h.click('btn-ob-start');if(method==='skip')h.click('btn-ob-skip');else if(method==='close')h.click('btn-ob-close');else h.key('ob-title-1','Escape');assert.equal(h.ob.opened,false);assert.equal(h.document.getElementById('ob-modal').getAttribute('aria-hidden'),'true');assert.equal(h.document.activeElement.id,'jin');}
});

test('returning visits do not reopen completed onboarding',()=>{
 const h=setup({done:true});h.ob.init();assert.equal(h.ob.opened,false);assert.equal(h.document.getElementById('ob-modal').classList.contains('on'),false);
});

test('storage unavailability still allows dismissal for the current page',()=>{
 const h=setup({available:false});h.ob.init();h.click('btn-ob-close');h.ob.init();assert.equal(h.ob.opened,false);assert.equal(h.document.getElementById('ob-modal').classList.contains('on'),false);
});

test('keyboard focus remains in the visible dialog and active title follows navigation',()=>{
 const h=setup();h.ob.init();h.document.getElementById('btn-ob-start').focus();h.key('btn-ob-start','Tab');assert.equal(h.document.activeElement.id,'btn-ob-close');h.key('btn-ob-close','Tab',true);assert.equal(h.document.activeElement.id,'btn-ob-start');h.click('btn-ob-start');assert.equal(h.document.activeElement.id,'ob-title-1');h.ob._step(99);assert.deepEqual(h.visibleSteps(),['ob-step-1']);
});
