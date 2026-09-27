# Member Communication — 61.2.1

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
| Group chat | Host invites connected members to join a common room. Only joined members receive room messages. The host forwards member messages to the other participants. Host departure closes the room. |
| Conference | Create/join acquires media, host-authorized rosters establish media channels between approved participants, and mute/remove/leave clean up streams. Additional member connections may require approval. |
| Presentation | PDF/image canvas or screen streams travel over dedicated, separately accepted media calls. Page-number notifications alone are no longer treated as document delivery. |
| Whiteboard / code / tasks / notes / clipboard | Share through accepted connections. Payload checks reject malformed input. Per-member controls restrict incoming collaboration. |
| Code runner | JavaScript runs in a sandboxed frame instead of the application's own scope. |
| Vault / history / notifications / settings | Existing modules and storage remain. Module aliases, settings controls and installation guidance are wired into the consolidated runtime. |

The app has 17 tabs. The earlier overlapping boot/Supabase scripts were consolidated into one runtime. Unused legacy dashboard buttons were removed. A single HTML deployment does not provide an offline service-worker cache.

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

All 17 tabs initialize, the final inline JavaScript parses, and HTML IDs are unique.

### Coverage limits

These checks ran in an isolated JavaScript environment using the real application code and a simulated browser document. They do **not** establish exhaustive coverage of every combination or verify real-device WebRTC, file storage under real load, CDN availability, camera hardware, autoplay rules, vault cryptography or NAT/TURN behavior. The separate Chromium suite exercises real DOM/CSS, startup storage, navigation and onboarding; its network library is stubbed or deliberately blocked.

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
