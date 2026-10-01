import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('class MemberMeetingsModule{');
const end=html.indexOf('/* Shared asynchronous consent UI',start);
const source=html.slice(start,end);

function setup(){
  const values=new Map(),els=new Map(),events=new Map();
  const element=id=>els.get(id)??els.set(id,{id,value:'',hidden:true,innerHTML:'',textContent:'',append(){},scrollTop:0,addEventListener(type,fn){(this.events??={})[type]=fn;},closest(){return null;}}).get(id);
  const document={visibilityState:'visible',getElementById:element,createElement(){return {textContent:'',};},addEventListener(type,fn){events.set(type,fn);}};
  const window={addEventListener(type,fn){events.set('window:'+type,fn);}};
  const SafeStorage={get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,String(v))};
  const sent=[];let now=Date.now();
  const App={peer:{myId:'peer-host',transport:{ready:true},send:(pid,msg)=>sent.push({pid,msg}),peerName:pid=>pid},ui:{activePeer:'peer-guest'},media:{_localStream:null},notifier:[]};
  const timers=[];const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
  globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};globalThis.clearTimeout=()=>{};
  const Meeting=new Function('SafeStorage','App','document','window','navigator','esc','setEl','uid',source+';return MemberMeetingsModule;')(
    SafeStorage,App,document,window,{onLine:true,mediaDevices:{enumerateDevices:async()=>[{kind:'audioinput'}]}},s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),(id,v)=>{element(id).textContent=v;},n=>'msg-'+n);
  const meetings=new Meeting();
  meetings._render=()=>{};
  const restore=()=>{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;};
  return {meetings,App,els,events,sent,timers,restore,setNow:v=>{now=v;Date.now=()=>now;}};
}

test('scheduling stores UTC instant, timezone metadata, recurrence and rejects malformed records',()=>{
  const h=setup();
  const ms=h.meetings._parseStart('2026-10-02T09:30','Asia/Kolkata');
  assert.equal(Number.isFinite(ms),true);
  const m=h.meetings._validate({id:'mtg-11111111-1111-4111-8111-111111111111',title:'Planning',startMs:ms,durationMin:45,timeZone:'Asia/Kolkata',hostId:'peer-host',attendees:['peer-host'],guests:['Guest'],roles:{'peer-host':'host'},lobby:[],locked:false,recordingConsent:[],status:'scheduled',repeat:'weekly',repeatUntil:null});
  assert.equal(m.repeat,'weekly');assert.match(h.meetings._format(ms,'Asia/Kolkata'),/Asia\/Kolkata/);
  assert.equal(h.meetings._validate({id:'bad',title:'x'}),null);h.restore();
});

test('host invite, attendee response, lock, lobby admission and attendance transitions',()=>{
  const h=setup(),id='mtg-22222222-2222-4222-8222-222222222222';
  h.meetings.meetings.set(id,{id,title:'Standup',description:'',startMs:Date.now()+60000,durationMin:30,timeZone:'UTC',repeat:'none',repeatUntil:null,hostId:'peer-host',attendees:['peer-host'],guests:[],roles:{'peer-host':'host'},lobby:[],locked:false,recordingConsent:[],status:'scheduled'});
  assert.equal(h.meetings.invite(id,'peer-guest'),true);assert.equal(h.sent.at(-1).pid,'peer-guest');
  assert.equal(h.meetings.respond(id,'tentative','peer-guest'),true);
  assert.equal(h.meetings.toggleLock(id),true);
  assert.deepEqual(h.meetings.join(id,'peer-guest'),{ok:false,reason:'meeting locked'});
  assert.equal(h.meetings.toggleLock(id),false);
  assert.deepEqual(h.meetings.join(id,'peer-guest'),{ok:true,state:'joined'});
  assert.equal(h.meetings.current.role,'participant');assert.equal(h.meetings.leave(),true);
  assert.ok(h.meetings.history.some(x=>x.event==='joined'));assert.ok(h.meetings.history.some(x=>x.event==='left'));h.restore();
});

test('pre-join check reports signaling, network and device readiness',async()=>{
  const h=setup();const result=await h.meetings.precheck();assert.equal(result.ok,true);assert.deepEqual(result.checks,{network:true,signaling:true,media:true,devices:true});h.restore();
});

test('mobile visibility and online events rejoin an active meeting',()=>{
  const h=setup();const id='mtg-33333333-3333-4333-8333-333333333333';
  h.meetings.meetings.set(id,{id,title:'Mobile',description:'',startMs:Date.now()+60000,durationMin:30,timeZone:'UTC',repeat:'none',repeatUntil:null,hostId:'peer-host',attendees:['peer-host'],guests:[],roles:{'peer-host':'host'},lobby:[],locked:false,recordingConsent:[],status:'scheduled'});
  h.meetings.init();h.meetings.join(id);h.meetings.current.state='reconnecting';h.events.get('visibilitychange')?.();assert.equal(h.meetings.current.state,'joined');h.events.get('window:online')?.();assert.equal(h.meetings.current.state,'joined');h.restore();
});

test('removed participant clears active session and duplicate or malformed chat is ignored',()=>{
  const h=setup();const id='mtg-44444444-4444-4444-8444-444444444444';
  h.meetings.meetings.set(id,{id,title:'Controls',description:'',startMs:Date.now()+60000,durationMin:30,timeZone:'UTC',repeat:'none',repeatUntil:null,hostId:'peer-host',attendees:['peer-host','peer-guest'],guests:[],roles:{'peer-host':'host','peer-guest':'participant'},lobby:[],locked:false,recordingConsent:[],status:'scheduled'});
  h.meetings.join(id,'peer-guest');assert.equal(h.meetings.current.pid,'peer-guest');
  h.App.peer.myId='peer-host';assert.equal(h.meetings.remove(id,'peer-guest'),true);assert.equal(h.meetings.current,null);
  h.meetings.current={id,pid:'peer-host',role:'host',state:'joined'};const meeting={id,title:'Controls',startMs:Date.now(),durationMin:30,timeZone:'UTC',repeat:'none',attendees:['peer-host'],guests:[],roles:{'peer-host':'host'},lobby:[],locked:false,recordingConsent:[],status:'scheduled',hostId:'peer-host'};
  h.meetings.onMessage('peer-guest',{type:'meeting',action:'chat',meeting,payload:{id:'x',meetingId:id,text:'ok'}});
  h.meetings.onMessage('peer-guest',{type:'meeting',action:'chat',meeting,payload:{id:'x',meetingId:id,text:'ok'}});
  assert.equal(h.meetings.seenMessages.has('x'),true);assert.equal(h.meetings.onMessage('peer-guest',{type:'meeting',action:'chat',meeting:{id:'bad',title:'x'},payload:{id:'bad'}}),false);h.restore();
});
