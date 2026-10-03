# Member Communication — 61.4.0

The deployed application remains entirely in **index.html**. No build step or application server is required. The Node package and tests are development tools only.

## Architecture and setup

The connection layer adapts the Main Peer and Presence Peer architecture at [wifi-file-transfer-web v4.13](https://github.com/DNG0101/wifi-file-transfer-web/tree/1c5ec6410f437bdd283e9492b179cb3142d3a501). The existing verified block protocol remains based on [wifi-file-transfer-web](https://github.com/DNG0101/wifi-file-transfer-web/tree/7989c113ef6e86514e0c280b5e71af2904a9845e).

- A stable installation UUID creates a Main Peer address, `dh-main-<uuid>`. A request/accept/confirm/ready handshake must finish before modules receive a connection.
- A separate, opt-in Presence Peer exchanges only discovery records. Its elected rendezvous is scoped to the app URL. Discovery peers also connect to known discovery peers and exchange versioned `SYNC_SUMMARY`, `SYNC_REQUEST` and `SYNC_RECORDS` messages. Updates run on connection, identity changes and Refresh, with no idle network polling. Records expire after five minutes; hiding presence publishes an offline record and leaves accepted sessions open.
- Approved sessions use pair-specific 256-bit tokens in sessionStorage, valid for 12 hours since the last successful handshake. Refresh retains the stable address and attempts bounded reconnection without prompting again; invalid/expired credentials require a new approval. Disconnect All and blocking revoke the saved session. Calls and files still require their existing consent.
- Chat and collaboration use the accepted Main Peer connection map. Dedicated media and file channels must belong to an accepted member.
- Files require additional receiver consent and use binary frames, 8 MiB verified blocks, backpressure, durable acknowledgments, corruption retry, checkpoints and final SHA-256 verification.
- Main and presence peers use the same signaling/STUN/TURN settings. No Supabase project or demo TURN credentials are required.

Serve the HTML over **HTTPS**, for example GitHub Pages. Open the same address on two devices or separate browser profiles. Wait for the connection to become ready, then share a full device code/invitation link or enable **Appear online** on both devices. Accept the connection on the receiver.

Internet is needed for CDN libraries and signaling, even when payloads travel directly over Wi-Fi. Restrictive networks may need your own TURN URL, username and credential in Settings on both clients. If using a custom PeerJS server, configure the same TLS host, port, path and key on every device, then reload.

One tab owns an installation identity when Web Locks is available. Old six-character invitations must be replaced. Discovery names are self-declared, not account authentication; compare fingerprints through the existing verification UI when needed.

## Module integration

| Module | Configuration and behavior |
| --- | --- |
| Chat / mobile peers | Uses accepted sessions; mobile chat buttons have bound listeners; blocking revokes existing sessions immediately. |
| Files | Separate consent dialog, verified transfer, downloads, saved progress and sender-led resume. OPFS is preferred; browser-storage fallback batches are limited to 256 MiB. Reconnect to the original member before resuming; expired sessions need approval again. |
| Voice / video calls | Incoming media consent, audio-only calls keep cameras off, one acquisition at a time, timeout/cancel/decline cleanup and permission checks. |
| Group voice / video | Join voice or start the camera before receiving a group stream. Calls route to their own module; leaving stops streams. |
| Group chat | Host invites connected members to join one or more rooms. A member can belong to multiple rooms simultaneously; only joined members receive each room's messages. The host forwards member messages to the other participants. Host departure closes that room. |
| Conference | Create/join acquires media, host-authorized rosters establish media channels between approved participants, and mute/remove/leave clean up streams. Additional member connections may require approval. |
| Presentation | PDF/image canvas or screen streams travel over dedicated, separately accepted media calls. Page-number notifications alone are no longer treated as document delivery. If live canvas capture is unavailable, the selected document is sent through the existing chat file-transfer path instead. |
| Whiteboard / code / tasks / notes / clipboard | Share through accepted connections. Payload checks reject malformed input. Per-member controls restrict incoming collaboration. |
| Code runner | JavaScript runs in a terminable worker inside a sandboxed frame. Infinite loops time out without blocking the app. |
| Vault / history / notifications / settings | Existing modules and storage remain. Module aliases, settings controls and installation guidance are wired into the consolidated runtime. |

The app has 18 tabs. The earlier overlapping boot/Supabase scripts were consolidated into one runtime. Unused legacy dashboard buttons were removed. A single HTML deployment does not provide an offline service-worker cache.

### Meetings module

Meetings is a stateful scheduling and coordination layer over the existing approved-member transport and media modules. It supports UTC-backed scheduling with an explicit display timezone, edit/cancel/reschedule, daily/weekly/monthly recurrence metadata, meeting codes, named local guests, invite/accept/decline/tentative responses, host/co-host/participant roles, lobby/admit, lock/remove, join/leave/rejoin, pre-join network/signaling/device checks, reminders, attendance history, meeting chat, hand raise, reactions, and consent tracking for recording. Mute, camera and screen-share controls delegate to the existing media modules; no second WebRTC or fake recording implementation is introduced.

Meetings intentionally do **not** claim unauthenticated guest browser access, server-side calendar sync, server-side reminders, or media recording. Named guests are roster metadata only, and recording consent is state tracking until a supported recorder is explicitly connected. Meeting state is exchanged only with already approved Member Communication peers.

## Reproducible regression checks

Requires Node.js 20 or newer:

```sh
npm install
npm test
```

The test runner extracts the implementation from **index.html**. It uses LinkeDOM and simulated PeerJS connections, browser media APIs, workers and storage; there is no second application implementation.

The 2026-09-27 verification passed **82 Node checks**, plus **5 Chromium browser scenarios**:

- **8 onboarding tests:** visible step navigation, duplicate startup callbacks, identity updates, Back/Skip/Close/Escape, returning visits, unavailable storage and keyboard focus.
- **12 connection architecture tests:** stable-ID reclaim, refresh and channel-loss resume, invalid tokens, expiry/blocking/revocation, three-peer discovery, rendezvous takeover, stale-record suppression, bounded metadata, toggle races and signaling recovery.

- **47 integrated scenarios** across two or three app instances: startup, identity, approval, rejection, timeout, simultaneous requests, discovery, actual receiving DOM updates, voice/video consent and lifecycle, group membership, conference media/host controls, presentations, mobile chat, malformed payloads and permissions.
- **11 file-protocol scenarios:** checkpoint hashing, large metadata, empty/binary files, corruption retry, interrupted resume, consent, pause, storage failure, changed source files and backpressure.
- **4 file-UI scenarios:** approval dialog, no storage before consent, completed binary transfer/download/saved record, and decline cleanup.
- **Control matrix:** Chromium activates every visible button in each of the 17 tabs, including pickers, dialogs, fullscreen, file-selection and call-related controls, while failing on page errors.

All 17 tabs initialize, the final inline JavaScript parses, and HTML IDs are unique.

### Coverage limits

These checks ran in an isolated JavaScript environment using the real application code and a simulated browser document. The control matrix adds real Chromium activation coverage for every visible button, but it does **not** establish exhaustive state combinations or verify real-device WebRTC, file storage under real load, CDN availability, camera hardware, autoplay rules, vault cryptography or NAT/TURN behavior. The separate Chromium suite exercises real DOM/CSS, startup storage, navigation and onboarding; its network library is stubbed or deliberately blocked.

Before relying on the deployment, test on two real devices and across two networks: chat, voice/video consent, group membership, conference join/remove, screen/document viewing, file transfer, interrupted resume and page reload. Test your actual TURN credentials where direct connectivity fails. Browser suspension and storage quotas can still interrupt operation.

## Connection migration notes

Reload all participating Member Communication clients after this update. The discovery wire protocol is now `member-presence-v2`. Main addresses and invitation links remain Member Communication-specific (`dh-main-…`); this is an architecture adaptation, not cross-app interoperability. Existing chat, media, collaboration and file payload protocols are unchanged.

Discovery is public, self-declared metadata, not proof of identity. Its in-memory directory is capped at 256 rows and each discovery peer at 24 links. The app caps pending plus accepted Main connections at 32. These are bounds, not measured concurrent-user capacity. Unlike the source application's IndexedDB presence cache, Member Communication keeps discovery rows in memory; session approval credentials alone survive reload in sessionStorage.

A refresh can recover the approved connection, but it cannot keep a WebRTC socket, camera stream or active operation alive while a page is closed. Modules receive disconnection and reconnection events; file recovery keeps its existing checkpoint workflow. Networks that require a relay still need working TURN credentials.

## Startup freeze fix (61.2.1)

The blank welcome dialog was reproduced in Chromium: after Continue, no onboarding page was visible because pages 2 and 3 retained `hidden` while CSS forced `[hidden]` to stay invisible. Navigation now updates both `hidden` and display state. Initialization runs once despite the two boot-completion timers. Back, Skip, Close and Escape provide working exits; focus and the dialog title follow the visible page. Saving a display name also updates the running peer identity.

Two related startup faults are fixed: a direct developer-mode localStorage read no longer aborts boot when storage is blocked, and the PeerJS failure banner can be dismissed to regain navigation. The guide has bounded mobile scrolling and accurate device-code/consent guidance.

Run the browser regression suite with:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Five browser scenarios cover desktop traversal of all 17 tabs and reload, mobile Back/Skip, keyboard navigation/Escape, denied storage, and blocked PeerJS with local notes still usable after the connection timeout. The regression suite previously missed the blank dialog because its DOM simulation did not render the `[hidden]` CSS rule.


## 61.3.0 audit fixes (2026-10-03)

All application HTML, styles, JavaScript, media routing and transfer logic remain in `index.html`. CDN libraries and the PDF worker still require network access; test files are development-only.

- Whiteboard: fixed coordinate space across desktop/mobile, pointer capture, single-tap dots, bounded long strokes, duplicate suppression, and peer-synchronized undo/redo. Remote clear resets pending drawing and redo history.
- Calls: camera acquisition is serialized, unused microphone tracks are stopped, failed acquisitions release tracks, and stream replacement preserves tracks shared with the replacement stream.
- Meetings: camera toggles video rather than muting audio; microphone controls also support conference and group streams.
- Presentations: configured the PDF worker, bound zoom, cancelled obsolete rendering, reset old PDF state when switching documents, and cleared playback on stop.
- Code editor: restores saved snippets and runs JavaScript in an isolated worker with a three-second execution limit, syntax-error reporting and bounded log collection.
- Lazy modules: concurrent initializations share one promise and complete only after initialization succeeds.

Verification: `npm test` passed 31 checks (including the Chromium control matrix) plus 62 integration/file scenarios; `npm run test:browser` passed 12 browser scenarios. These cover application startup, all 18 tabs, simulated multi-member transport/media/file flows, and real Chromium collaboration controls. Hardware cameras, public signaling/CDN availability and real-device NAT/TURN behavior require device testing and are not proven by this suite.

## 61.4.0 browser and workflow repairs (2026-10-03)

All runtime markup, styles and scripts remain in `index.html`. This update repairs per-member chat histories and replies, background group routing, notification persistence, encrypted vault backup restoration, narrow-screen scrolling and keyboard layouts, optional browser API fallbacks, document drawing and file-picker handling. Recording now mixes both sides’ audio and selects one video track with a supported recording format. Meetings have an explicit video-session action, authenticated management messages, working reactions and recording-consent events.

The browser suite includes Chromium and Firefox, desktop and 360-pixel touch viewports, across all 18 tabs. These tests use simulated signaling and local workflows. Safari, physical Android/iOS devices, real camera hardware, external library availability and public NAT/TURN connections still require device testing. Document tint and soft-edge effects do not claim person segmentation. Recording captures the remote video (or local video when no remote track exists), with both audio sources where Web Audio is available.

Audio recording is additionally exercised with real Chromium Web Audio and MediaRecorder tracks. The headless Firefox environment cannot resume an audio output context, so Firefox recording and physical microphone output are not verified.
