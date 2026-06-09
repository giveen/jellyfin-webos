# Jellyfin WebOS — Modernization Plan

## 1. Architecture Overview

```
┌─────────────────┐     postMessage      ┌──────────────────────┐
│  WebOS Shell     │ ◄──────────────────► │  Jellyfin Web UI     │
│  (Vite + TS)     │                      │  (loaded in iframe)  │
│                  │                      │                      │
│  main.ts         │    shell.js          │  NativeShell API     │
│  bridge.ts       │    (injected)        │  (window.NativeShell)│
│  services/*.ts   │                      │                      │
├─────────────────┤                      ├──────────────────────┤
│ webOS.service    │                      │  Unmodified Jellyfin  │
│ (UDP discovery)  │                      │  web client code     │
└─────────────────┘                      └──────────────────────┘
```

The shell is a Vite + TypeScript web app that:
- Displays a connection UI (server URL input, server list, status)
- Uses `webOS.service.request()` to call the discovery service
- Creates an iframe containing the Jellyfin web UI
- Injects a small bridge script (`shell.js`) into the iframe
- Communicates with the iframe via `window.postMessage`
- Handles WebOS remote control keys (up/down/enter/back)

The service layer (`services/`) is unchanged Node.js server-side code that runs on the TV. It handles UDP-based Jellyfin server discovery.

---

## 2. Message Protocol (postMessage)

### 2.1 Direction: Iframe → Shell (Jellyfin → WebOS Shell)

| Message Type       | Payload                          | Action in Shell                |
|--------------------|----------------------------------|--------------------------------|
| `AppHost.init`     | `{ deviceId, deviceName, ... }`  | Log init, mark iframe ready    |
| `AppHost.exit`     | —                                | Call `webOS.platformBack()`    |
| `AppHost.appName`  | `string`                         | (log only)                     |
| `selectServer`     | —                                | Show shell UI, hide iframe     |
| `downloadFile`     | `{ url: string }`                | Forward to WebOS download      |
| `openUrl`          | `{ url, target }`                | Open in WebOS browser          |
| `enableFullscreen` | —                                | Request fullscreen             |
| `disableFullscreen`| —                                | Exit fullscreen                |
| `updateMediaSession`| `{ mediaInfo }`                | Update media session metadata  |
| `hideMediaSession` | —                                | Hide media session UI          |
| `getPlugins`       | —                                | Return empty array             |

### 2.2 Direction: Shell → Iframe (WebOS Shell → Jellyfin)

| Message Type | Payload                                    | Timing                 |
|--------------|--------------------------------------------|------------------------|
| `init`       | `{ appInfo: AppInfo, deviceInfo: DeviceInfo }` | After iframe `load` event fires |

### 2.3 Handshake Sequence

1. Shell loads, gets AppInfo/DeviceInfo from webOS API
2. User connects to a Jellyfin server → shell fetches `/System/Info/Public` + `/web/manifest.json`
3. Shell creates iframe, sets `src` to Jellyfin URL
4. Iframe fires `load` event → shell sends `postMessage({ type: 'init', data: { appInfo, deviceInfo } })`
5. Injected `shell.js` receives `init` → sets `window.AppInfo`, `window.DeviceInfo` → calls `NativeShell.AppHost.init()`
6. Jellyfin web code reads `window.NativeShell` → communication established

---

## 3. File-by-File Specification

### 3.1 `src/bridge/bridge.ts` — Shell-side message handler
**Responsibility**: Receive and dispatch all postMessage events from the iframe.

**Interface**:
```typescript
interface BridgeMessage {
  type: string;
  data?: any;
}

class ShellBridge {
  private iframe: HTMLIFrameElement;
  constructor(iframe: HTMLIFrameElement);
  sendInit(appInfo: AppInfo, deviceInfo: DeviceInfo): void;
  handleMessage(event: MessageEvent): void;  // routes by type
}
```

**Handlers**:
- `selectServer` → show shell UI, hide iframe
- `AppHost.exit` → call `webOS.platformBack()`
- `downloadFile` → trigger WebOS download
- `openUrl` → open in external browser
- `enableFullscreen` / `disableFullscreen` → requestFullscreen / exitFullscreen
- `updateMediaSession` / `hideMediaSession` → media session metadata APIs
- others → console.log for debugging

### 3.2 `public/shell.js` — Iframe-injected bridge (replaces webOS.js)
**Responsibility**: Runs *inside* the Jellyfin iframe. Listens for the `init` message, then sets up `window.NativeShell` API.

**Key rules**:
- Must be loaded as a `<script>` tag injected into the iframe after `load`
- Does NOT use ES modules (must work in WebOS 2+ which has poor Promise support)
- Listens for `message` events from `window.parent`
- When `init` message arrives, sets `window.AppInfo` and `window.DeviceInfo`
- Exposes `window.NativeShell` exactly as Jellyfin expects it

**Interface (implements Jellyfin's NativeShell expectation)**:
```typescript
window.NativeShell = {
  AppHost: {
    init(): Promise<AppInfo>,
    appName(): string,
    appVersion(): string,
    deviceId(): string,
    deviceName(): string,
    exit(): void,
    getDefaultLayout(): 'tv',
    getDeviceProfile(profileBuilder): object,
    getSyncProfile(profileBuilder): object,
    supports(command): boolean,
    screen(): { width, height } | null,
  },
  selectServer(): void,
  downloadFile(url): void,
  enableFullscreen(): void,
  disableFullscreen(): void,
  getPlugins(): [],
  openUrl(url, target): void,
  updateMediaSession(mediaInfo): void,
  hideMediaSession(): void,
}
```

**Implementation notes**:
- Each method calls `window.parent.postMessage(...)` to relay to the shell
- `supportedFeatures` array matches the original list
- `getDeviceProfile` uses deviceInfo to set dolbyAtmos, dolbyVision, hdr10 capabilities

### 3.3 `src/main.ts` — App entry point (refactored)
**Current state**: Monolithic logic mixed with DOM manipulation.

**Refactored responsibilities**:
1. Bootstrap → call `webOS.deviceInfo()` + `webOS.fetchAppInfo()` on startup
2. Create `ShellBridge` instance after iframe exists in DOM
3. Delegate server discovery UI to `ui/app.ts`
4. Delegate focus management to `ui/navigation.ts`
5. Wire up event listeners (keyboard, message from bridge)

### 3.4 `src/ui/app.ts` — Server selection state machine
**Responsibility**: Manage the connection states and UI transitions.

**States**:
```
IDLE → CONNECTING → CONNECTED (show iframe)
  ↓        ↓
ERROR    ERROR (on failure)
```

**Exports**:
```typescript
function onConnect(url: string, autoConnect: boolean): void;
function onDisconnect(): void;
function onError(message: string): void;
```

### 3.5 `src/ui/navigation.ts` — Remote control focus manager
**Responsibility**: Handle WebOS remote key events for the shell UI only.

**Strategy**:
- Use `data-focusable` attribute instead of querying all `input, button, etc.`
- Support Up/Down/Left/Right/Enter/Back
- When iframe is visible, forward Back key to `webOS.platformBack()`
- When shell is visible, manage focus within shell elements

**Exports**:
```typescript
function navigate(direction: -1 | 1): void;
function initNavigation(): void;
```

### 3.6 `src/services/ajax.ts` — (exists, minor cleanup)
**Current state**: Good. Consider adding `fetch` as an alternative for environments that support it.

### 3.7 `src/services/storage.ts` — (exists, minor cleanup)
**Current state**: Good. Consider adding typed getters.

### 3.8 `src/services/discovery.ts` — NEW: WebOS service discovery bridge
**Responsibility**: Call the WebOS service (`luna://org.jellyfin.webos.service/discover`) to find servers on the local network.

**Exports**:
```typescript
function discoverServers(): Promise<ServerInfo[]>;
function startDiscovery(callback: (servers: ServerInfo[]) => void): void;
function stopDiscovery(): void;
```

### 3.9 `src/types.ts` — Types (exists, expand)
Add:
```typescript
interface MediaInfo {
  // from Jellyfin playback
}
interface ServerInfo {
  id: string;
  baseurl: string;
  auto_connect: boolean;
  Name?: string;
  Address?: string;
  hosturl?: string;
}
```

---

## 4. Injection Strategy (Critical Detail)

**The Problem**: We can't include `shell.js` in the Jellyfin server's code. We must inject it into the iframe.

**The Solution** (simplified from legacy):

1. `shell.js` is built as a standalone non-module script in `public/`
2. After iframe `load` event fires, the shell appends a `<script>` tag pointing to `shell.js`:
   ```javascript
   const script = iframe.contentDocument.createElement('script');
   script.src = './shell.js';  // relative to the shell's origin
   iframe.contentDocument.head.appendChild(script);
   ```
   Wait—this won't work because the iframe's origin is the Jellyfin server, not the shell.

   **Alternative**: We inject the *code* directly:
   ```javascript
   const script = iframe.contentDocument.createElement('script');
   script.textContent = SHELL_BRIDGE_CODE;  // bundled as a string
   iframe.contentDocument.head.appendChild(script);
   ```

   But this is what the legacy code does, and it's fragile.

   **Better Alternative**: Load `shell.js` via XHR/fetch from the shell's origin, then inject:
   ```javascript
   const response = await fetch('./shell.js');
   const code = await response.text();
   const script = iframe.contentDocument.createElement('script');
   script.textContent = code;
   iframe.contentDocument.head.appendChild(script);
   ```

   This is cleaner because:
   - `shell.js` lives in the shell's `public/` directory (served by Vite dev server or included in .ipk)
   - It's loaded synchronously via `script.textContent` (no CORS issues)
   - After injection, shell sends the `init` postMessage

**Sequence**:
1. `iframe.src = jellyfinUrl`
2. Wait for iframe `load` event
3. `fetch('./shell.js')` from shell origin
4. Inject as `<script>` into iframe
5. Send postMessage `{ type: 'init', data: { appInfo, deviceInfo } }`
6. `shell.js` receives `init` → sets up `NativeShell`
7. Jellyfin web code detects `NativeShell` → uses it

---

## 5. Implementation Order

### Phase 2A: Bridge & Communication (Foundation)
1. Create `src/bridge/bridge.ts` — shell-side message handler
2. Create `public/shell.js` — iframe-injected bridge script
3. Refactor `src/main.ts`:
   - Remove legacy DOM manipulation
   - Use ShellBridge for message routing
   - Clean handoff sequence (fetch → inject → postMessage)
4. Update `src/webos.d.ts` with full type definitions

### Phase 2B: UI & State Management
5. Create `src/ui/app.ts` — connection state machine
6. Create `src/ui/navigation.ts` — focus manager
7. Rebuild `public/assets/css/shell.css` — TV-optimized styles
8. Update `index.html` — clean semantic structure for new CSS

### Phase 2C: Discovery Service Integration
9. Create `src/services/discovery.ts` — WebOS local server discovery
10. Update shell UI to show discovered servers dynamically

### Phase 2D: Polish & Edge Cases
11. Error handling for all network states (timeout, abort, unreachable)
12. Screen saver detection and prevention
13. Memory management for iframe lifecycle
14. Handle WebOS app lifecycle (pause/resume)

---

## 6. Edge Cases & Error Handling

### 6.1 WebOS Version Compatibility
- **WebOS 2.x**: Limited Promise support, no `fetch`. Use XHR + callbacks.
- **WebOS 3.x**: Better ES6 support. Can use Promise/fetch.
- **WebOS 4.x+**: Modern browser engine. Full support.

**Strategy**: Keep `shell.js` in ES5 syntax (no arrow functions, no let/const) for broadest compatibility. The shell itself (Vite output) can use modern syntax since it runs in the app's browser context.

### 6.2 Iframe Loading Failures
- If iframe fails to load (network error, server down), the `load` event may never fire
- **Solution**: Add a timeout (e.g., 30s) on the iframe load. If timeout fires, show error in shell.

### 6.3 CORS Issues
- The shell fetches `shell.js` from its own origin (inside the .ipk), so no CORS concerns for injection.
- The shell communicates with the Jellyfin server via XHR (`/System/Info/Public`, `/web/manifest.json`). These must be same-origin or the server must have CORS headers.

### 6.4 Multiple Server Handoff
- The LRU cache stores up to 4 servers
- When switching servers, destroy and re-create the iframe
- When re-launching, the server list persists

### 6.5 Back Button Behavior
- Shell UI visible → Back key calls `webOS.platformBack()` (exits app)
- Iframe visible → Back key sends `selectServer` message to shell (shows shell UI, hides iframe)
- Exception: if Jellyfin handles back internally (nested navigation), let it consume the event first

---

## 7. Files Not Needing Changes

| File/Path              | Reason                                      |
|------------------------|---------------------------------------------|
| `services/service.js`  | Node.js service, runs on TV, Vite-irrelevant|
| `services/services.json`| Service registration metadata              |
| `services/package.json`| Service metadata                            |
| `appinfo.json`         | WebOS manifest, correct                     |
| `vite.config.ts`       | Already configured for `ares-package`       |
| `package.json` (root)  | Scripts updated for `frontend/dist`         |

---

## 8. Build & Packaging (no changes needed)

**Workflow**:
```bash
cd frontend
npm run build          # Vite → dist/
cd ..
npm run package        # Docker + ares-package → build/*.ipk
```

The `npm run package` command from root `package.json` runs:
```
ares-package --no-minify --outdir build/ frontend/dist services
```

This produces `org.jellyfin.webos_1.2.2_all.ipk` in `build/`.
