# Member Communication — 61.1

The deployed application remains entirely in **index.html**. No build step or application server is required. The Node package and tests are development tools only.

## Architecture and setup

This application adapts the architecture and verified block protocol from [wifi-file-transfer-web](https://github.com/DNG0101/wifi-file-transfer-web/tree/7989c113ef6e86514e0c280b5e71af2904a9845e).

- A stable installation UUID creates a Main Peer address, `dh-main-<uuid>`. A request/accept/confirm/ready handshake must finish before modules receive a connection.
- A separate, opt-in Presence Peer exchanges only discovery records. Its elected host is scoped to the app URL. Heartbeats run every 20 seconds, records expire after 65 seconds, and hiding presence leaves accepted sessions open.
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
| Files | Separate consent dialog, verified transfer, downloads, saved progress and sender-led resume. OPFS is preferred; browser-storage fallback batches are limited to 256 MiB. Reconnect and accept the original member before resuming. |
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

The 2026-09-14 verification passed **62 checks**:

- **47 integrated scenarios** across two or three app instances: startup, identity, approval, rejection, timeout, simultaneous requests, discovery, actual receiving DOM updates, voice/video consent and lifecycle, group membership, conference media/host controls, presentations, mobile chat, malformed payloads and permissions.
- **11 file-protocol scenarios:** checkpoint hashing, large metadata, empty/binary files, corruption retry, interrupted resume, consent, pause, storage failure, changed source files and backpressure.
- **4 file-UI scenarios:** approval dialog, no storage before consent, completed binary transfer/download/saved record, and decline cleanup.

All 17 tabs initialize, the final inline JavaScript parses, and HTML IDs are unique.

### Coverage limits

These checks ran in an isolated JavaScript environment using the real application code and a simulated browser document. The local process/browser tools were unavailable. They do **not** establish exhaustive coverage of every combination, nor verify real-device WebRTC, actual IndexedDB/OPFS, CDN loading, browser layout, native dialogs, sandboxed code execution, camera hardware, autoplay rules, vault cryptography or NAT/TURN behavior.

Before relying on the deployment, test on two real devices and across two networks: chat, voice/video consent, group membership, conference join/remove, screen/document viewing, file transfer, interrupted resume and page reload. Test your actual TURN credentials where direct connectivity fails. Browser suspension and storage quotas can still interrupt operation.
