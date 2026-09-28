import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('direct video calls advertise video and request it on the receiving peer', () => {
  assert.match(html, /peer\?\.\s*peer\?\.\s*call\(pid,this\._localStream,\{metadata:\{type:'direct',video:video===true\}\}\)/);
  assert.match(html, /const wantsVideo=call\.metadata\?\.video===true/);
  assert.match(html, /video:wantsVideo\?\{facingMode:\{ideal:'user'\}/);
  assert.match(html, /App\.directCall\.ring\(pid,stream\.getVideoTracks\(\)\.length>0\)/);
  assert.match(html, /call\.metadata\?\.video===true\|\|App\.directCall\.wantsVideo\(call\.peer\)/);
});

test('camera toggle can add a track to an audio-only call', () => {
  assert.match(html, /else if\(pc\?\.addTrack\)pc\.addTrack\(video,stream\)/);
  assert.match(html, /const combined=new MediaStream\(\[\.\.\.audio,video\]\)/);
  assert.match(html, /async toggleVideo\(\)/);
});

test('media recovery uses the PeerJS connection and handles missing senders', () => {
  assert.match(html, /const pc=this\._call\?\.peerConnection/);
  assert.match(html, /else if\(pc\.addTrack\)pc\.addTrack\(track,newStream\)/);
});

test('remote audio and video tracks share a visible responsive call layout', () => {
  assert.match(html, /vwrap\.classList\.add\('v29-call-layout','v32-call'\)/);
  assert.match(html, /if\(!this\._remoteStream\.getTrackById\?\.\(e\.track\.id\)\)/);
  assert.match(html, /rvid\.srcObject=this\._remoteStream;rvid\.dispatchEvent\(new Event\('loadedmetadata'\)\)/);
});
