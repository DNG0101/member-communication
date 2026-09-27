import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {webcrypto} from 'node:crypto';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function createMemberTransport(deps){'),html.indexOf('/* One module-facing adapter'));
const factory=new Function(source+';return createMemberTransport;')();
const flush=async()=>{for(let i=0;i<150;i++)await Promise.resolve();};
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
function setup(){
 let time=1_800_000_000_000,serial=0;const tasks=new Map(),peers=new Map(),messages=[];
 const later=(fn,ms=0)=>{const id=++serial;tasks.set(id,{fn,at:time+ms});return id;};
 class E{constructor(){this.events={};}on(k,f){(this.events[k]??=[]).push(f);return this;}emit(k,...args){for(const f of this.events[k]||[])f(...args);}}
 class C extends E{
  constructor(peer,metadata){super();this.peer=peer;this.metadata=metadata;this.open=false;}
  send(m){if(!this.open)throw Error('closed');messages.push({from:this.other.peer,to:this.peer,m:structuredClone(m)});queueMicrotask(()=>{if(this.other.open)this.other.emit('data',structuredClone(m));});}
  close(){if(this.closed)return;this.closed=true;this.open=false;this.emit('close');this.other?.close();}
 }
 class Peer extends E{
  constructor(id){super();this.id=id||'runtime-'+(++serial);this.links=[];if(peers.has(this.id)){queueMicrotask(()=>this.emit('error',{type:'unavailable-id',message:'in use'}));return;}peers.set(this.id,this);queueMicrotask(()=>{if(!this.destroyed)this.emit('open',this.id);});}
  connect(id,{metadata}){const c=new C(id,metadata),remote=peers.get(id);if(!remote){queueMicrotask(()=>c.emit('error',Error('not online')));return c;}const d=new C(this.id,metadata);c.other=d;d.other=c;this.links.push(c);remote.links.push(d);queueMicrotask(()=>{remote.emit('connection',d);if(c.closed||d.closed)return;c.open=d.open=true;d.emit('open');c.emit('open');});return c;}
  call(){throw Error('Not used');}
  reconnect(){this.disconnected=false;queueMicrotask(()=>this.emit('open',this.id));}
  destroy(){if(this.destroyed)return;this.destroyed=true;if(peers.get(this.id)===this)peers.delete(this.id);for(const c of this.links)c.close();this.emit('close');}
 }
 const lib=factory({Peer,crypto:webcrypto,now:()=>time,setTimeout:later,clearTimeout:id=>tasks.delete(id),random:()=>0});
 let identity=0;
 const member=(extra={})=>new lib.Transport({identity:{uuid:'11111111-1111-4111-8111-'+String(++identity).padStart(12,'0'),name:'Member '+identity},peerOptions:()=>({}),baseUrl:'https://example.com/member/',continuityStorage:storage(),onRequest:()=>true,...extra});
 const advance=async ms=>{const end=time+ms;let count=0;await flush();for(;;){const next=[...tasks].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>5000)throw Error('Timer loop');time=next[1].at;tasks.delete(next[0]);await next[1].fn();await flush();}time=end;await flush();};
 const connect=async(a,b)=>{await Promise.all([a.start(),b.start()]);const p=a.connect(b.id);await flush();await p;assert.equal(a.connections.size,1);assert.equal(b.connections.size,1);};
 return {lib,member,advance,connect,messages,peers,tasks,now:()=>time};
}

test('refresh retains stable address and resumes only the previously approved session',async()=>{
 const h=setup();let approvals=0;const a=h.member(),b=h.member({onRequest:()=>{approvals++;return true;}});await h.connect(a,b);const old=a.id,saved=a.options.continuityStorage;a.destroy();
 const reloaded=h.member({identity:a.identity,continuityStorage:saved});await reloaded.start();await h.advance(3000);
 assert.equal(reloaded.id,old);assert.equal(reloaded.connections.size,1);assert.equal(b.connections.size,1);assert.equal(approvals,1);assert.equal(reloaded.discovery,undefined);
 reloaded.destroy();b.destroy();
});

test('wrong resume token fails without approval or application data delivery',async()=>{
 const h=setup();let approvals=0,received=0;const a=h.member(),b=h.member({onRequest:()=>{approvals++;return true;},onData:()=>received++});await h.connect(a,b);a.connections.get(b.id).close();a.continuity.get(b.id).token='f'.repeat(64);
 await assert.rejects(a.connect(b.id,true));await flush();assert.equal(b.connections.size,0);assert.equal(approvals,1);assert.equal(received,0);a.destroy();b.destroy();
});

test('Disconnect All removes credentials on both sides and prevents auto-resume',async()=>{
 const h=setup(),a=h.member(),b=h.member();await h.connect(a,b);a.disconnectAll(true);await h.advance(15000);assert.equal(a.continuity.size,0);assert.equal(b.continuity.size,0);assert.equal(a.connections.size+b.connections.size,0);a.destroy();b.destroy();
});

test('blocked and expired sessions cannot resume',async()=>{
 const h=setup();let blocked=false;const a=h.member(),b=h.member({blocked:()=>blocked});await h.connect(a,b);blocked=true;a.connections.get(b.id).close();await assert.rejects(a.connect(b.id,true));assert.equal(b.connections.size,0);assert.equal(b.resumeLink(a.id),null);
 await h.advance(12*60*60*1000+1);assert.equal(a.resumeLink(b.id),null);a.destroy();b.destroy();
});

test('temporary data-channel loss reconnects without another approval',async()=>{
 const h=setup();let approvals=0;const a=h.member(),b=h.member({onRequest:()=>{approvals++;return true;}});await h.connect(a,b);a.connections.get(b.id).close();await h.advance(3000);assert.equal(a.connections.size,1);assert.equal(b.connections.size,1);assert.equal(approvals,1);a.destroy();b.destroy();
});

test('stable address is reclaimed after a transient signaling ownership collision',async()=>{
 const h=setup(),a=h.member();await a.start();const next=h.member({identity:a.identity});const opening=next.start();await flush();a.destroy();await h.advance(200);await opening;assert.equal(next.id,a.id);assert.equal(next.ready,true);next.destroy();
});

test('three discovery peers exchange bounded records without application traffic',async()=>{
 const h=setup(),a=h.member(),b=h.member(),c=h.member();await Promise.all([a.start(),b.start(),c.start()]);a.setDiscovery(true);await flush();b.setDiscovery(true);await flush();c.setDiscovery(true);await flush();
 for(const m of [a,b,c])assert.equal(m.discovery.users().length,2);
 assert.equal([a,b,c].filter(m=>m.discovery.host).length,1);assert.equal(a.connections.size+b.connections.size+c.connections.size,0);
 assert.ok(h.messages.every(({m})=>['SYNC_SUMMARY','SYNC_REQUEST','SYNC_RECORDS'].includes(m.type)));
 assert.ok(h.messages.every(({m})=>!JSON.stringify(m).includes('token')));
 const count=h.messages.length;await h.advance(60000);assert.equal(h.messages.length,count,'No idle presence polling');
 for(const m of [a,b,c])m.destroy();
});

test('discovery takeover preserves approved Main Peer communication',async()=>{
 const h=setup(),a=h.member(),b=h.member(),c=h.member();await h.connect(b,c);await a.start();a.setDiscovery(true);await flush();b.setDiscovery(true);await flush();c.setDiscovery(true);await flush();assert.equal(a.discovery.host,true);a.destroy();await h.advance(6000);
 assert.equal([b,c].filter(m=>m.discovery.host).length,1);assert.equal(b.connections.get(c.id)?.open,true);assert.equal(c.connections.get(b.id)?.open,true);assert.ok(b.discovery.users().some(r=>r.uuid===c.identity.uuid));b.destroy();c.destroy();
});

test('offline tombstones prevent an older online row from reappearing',async()=>{
 const h=setup(),a=h.member(),b=h.member();await h.connect(a,b);a.setDiscovery(true);await flush();b.setDiscovery(true);await flush();const old=structuredClone(a.discovery.rows.get(b.identity.uuid));b.setDiscovery(false);await flush();assert.equal(a.discovery.users().length,0);a.discovery.merge([old]);assert.equal(a.discovery.users().length,0);assert.equal(a.connections.get(b.id)?.open,true);await h.advance(150);assert.equal(b.discovery.peer,null);a.destroy();b.destroy();
});

test('presence records expire and malicious batches cannot grow the directory',async()=>{
 const h=setup(),a=h.member();await a.start();a.setDiscovery(true);await flush();const rows=[];for(let i=2;i<400;i++){const uuid='22222222-2222-4222-8222-'+String(i).padStart(12,'0');rows.push({...a.discovery.self(),uuid,peerId:'dh-main-'+uuid,peer2Id:'remote-'+i,token:'secret'});}a.discovery.merge(rows);assert.ok(a.discovery.rows.size<=256);assert.ok([...a.discovery.rows.values()].every(r=>!('token'in r)));await h.advance(h.lib.TTL+1);assert.equal(a.discovery.users().length,0);a.destroy();
});

test('hiding and immediately re-enabling discovery keeps it operational',async()=>{
 const h=setup(),a=h.member(),b=h.member();await h.connect(a,b);a.setDiscovery(true);await flush();b.setDiscovery(true);await flush();b.setDiscovery(false);b.setDiscovery(true);await h.advance(200);assert.ok(b.discovery.peer);assert.equal(a.discovery.users().length,1);a.destroy();b.destroy();
});

test('signaling reconnect keeps approved sessions and restarts discovery',async()=>{
 const h=setup(),a=h.member(),b=h.member();await h.connect(a,b);a.setDiscovery(true);await flush();b.setDiscovery(true);await flush();a.peer.disconnected=true;a.peer.emit('disconnected');assert.equal(a.connections.get(b.id)?.open,true);await h.advance(8000);assert.equal(a.ready,true);assert.equal(a.connections.size,1);assert.equal(a.discovery.users().length,1);a.destroy();b.destroy();
});
