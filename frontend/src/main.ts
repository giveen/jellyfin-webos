/**
 * Jellyfin for webOS — App Entry Point
 *
 * Modernized Vite + TypeScript shell that wraps the Jellyfin web UI
 * in a WebOS app container. Handles server discovery, connection,
 * and communication between the shell and the Jellyfin iframe.
 */

// webOSTV.js platform library (attaches window.webOS) — from npm, not vendored
import 'webostvjs';

import { ajax } from './services/ajax';
import { storage } from './services/storage';
import { discoverServers, startDiscovery, stopDiscovery } from './services/discovery';
import { suppressScreensaver, allowScreensaver } from './services/screensaver';
import { bridge } from './bridge/bridge';
import { BridgeInbound } from './bridge/messages';
import { appUI } from './ui/app';
import { initNavigation, createKeyHandler } from './ui/navigation';
import { normalizeUrl, validURL, originOf } from './utils/url';
import { strings } from './ui/strings';
import type { AppInfo, DeviceInfo, ServerInfo, ConnectedServers } from './types';

// ===== State =====
let currReq: XMLHttpRequest | null = null;
let discovered: ServerInfo[] = [];
let savedServers: ConnectedServers = {};
const appInfo: AppInfo = {
    deviceId: null,
    deviceName: 'LG Smart TV',
    appName: 'Jellyfin for WebOS',
    appVersion: '0.0.0'
};
let deviceInfo: DeviceInfo | null = null;
let deviceInfoCallback: ((info: DeviceInfo) => void) | null = null;

// ===== Utilities =====

function waitForDeviceInfo(callback: (info: DeviceInfo) => void): void {
    if (deviceInfo) {
        callback(deviceInfo);
    } else {
        deviceInfoCallback = callback;
    }
}

function generateDeviceId(): string {
    return btoa([navigator.userAgent, new Date().getTime()].join('|')).replace(/=/g, '1');
}

function getDeviceId(): string {
    let deviceId = storage.get<string>('_deviceId2');
    if (!deviceId) {
        deviceId = generateDeviceId();
        storage.set('_deviceId2', deviceId);
    }
    return deviceId!;
}

// ===== Server List =====

/** Combine discovered and saved servers into a deduplicated list for display */
function refreshServerList(): void {
    const seen = new Set<string>();
    const combined: ServerInfo[] = [];

    for (const server of discovered) {
        if (!seen.has(server.baseurl)) {
            seen.add(server.baseurl);
            combined.push(server);
        }
    }
    for (const id of Object.keys(savedServers)) {
        const server = savedServers[id];
        if (server.baseurl && !seen.has(server.baseurl)) {
            seen.add(server.baseurl);
            combined.push(server);
        }
    }

    appUI.renderServers(combined, (url) => connectToUrl(url));
}

// ===== Connection Logic =====

/** Entry point for all connection requests (form submit, server card pick) */
function connectToUrl(rawUrl: string): void {
    const baseurl = normalizeUrl(rawUrl);

    if (!validURL(baseurl)) {
        appUI.showError(strings.errInvalidUrl);
        return;
    }

    // Persist the chosen URL/auto-connect flag in the form
    const urlField = document.querySelector<HTMLInputElement>('#baseurl');
    if (urlField) urlField.value = baseurl;
    const autoConnectEl = document.querySelector<HTMLInputElement>('#auto_connect');

    appUI.showConnecting();
    if (currReq) currReq.abort();
    getServerInfo(baseurl, autoConnectEl?.checked ?? false);
}

function getServerInfo(baseurl: string, autoConnect: boolean): void {
    currReq = ajax.request(normalizeUrl(baseurl + '/System/Info/Public'), {
        method: 'GET',
        success: (data) => handleServerInfo(data, baseurl, autoConnect),
        error: (err) => handleFailure(err),
        abort: () => handleAbort(),
        timeout: 5000
    });
}

function handleServerInfo(data: any, baseurl: string, autoConnect: boolean): void {
    currReq = null;

    // Check for server ID change
    for (const id in savedServers) {
        if (savedServers[id].baseurl === baseurl && savedServers[id].id !== data.Id) {
            appUI.showError(strings.errServerIdChanged);
            delete savedServers[id];
            storage.set('connected_servers', savedServers);
            refreshServerList();
            return;
        }
    }

    // Store server in LRU-style cache (max 4)
    const newEntry: ServerInfo = {
        id: data.Id || 'server_' + Date.now(),
        baseurl: baseurl,
        auto_connect: autoConnect,
        Name: data.ServerName || 'Jellyfin Server',
        Address: baseurl
    };

    const updated: ConnectedServers = { [newEntry.id]: newEntry };
    let count = 1;
    for (const id of Object.keys(savedServers)) {
        if (count >= 4) break;
        if (id !== newEntry.id) {
            updated[id] = savedServers[id];
            count++;
        }
    }
    savedServers = updated;
    storage.set('connected_servers', updated);

    // Fetch the web manifest to find the actual entry point
    getManifest(baseurl);
}

function getManifest(baseurl: string): void {
    currReq = ajax.request(normalizeUrl(baseurl + '/web/manifest.json'), {
        method: 'GET',
        success: (data) => handleManifest(data, baseurl),
        error: (err) => handleFailure(err),
        abort: () => handleAbort(),
        timeout: 5000
    });
}

function handleManifest(data: any, baseurl: string): void {
    currReq = null;

    // Determine the actual entry URL for the Jellyfin web client
    const startUrl = data.start_url || '';
    const hosturl = startUrl.includes('/web')
        ? normalizeUrl(baseurl + '/' + startUrl)
        : normalizeUrl(baseurl + '/web/' + startUrl);

    // Save hosturl to storage
    for (const id in savedServers) {
        if (savedServers[id].baseurl === baseurl) {
            savedServers[id].hosturl = hosturl;
            storage.set('connected_servers', savedServers);
            break;
        }
    }

    handoff(hosturl);
}

// ===== Iframe Handoff =====

async function handoff(url: string): Promise<void> {
    const frame = document.querySelector('#contentFrame') as HTMLIFrameElement;
    if (!frame) return;

    // Free the discovery subscription while the Jellyfin UI is active
    stopDiscovery();

    appUI.showConnected();
    frame.src = url;
    frame.focus();

    // Wait for the iframe to load, with a timeout
    const LOAD_TIMEOUT = 30000; // 30 seconds
    try {
        await Promise.race([
            new Promise<void>((resolve) => {
                frame.addEventListener('load', () => resolve(), { once: true });
            }),
            new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error('iframe load timed out')), LOAD_TIMEOUT);
            })
        ]);
    } catch (err) {
        console.error('[Handoff] Iframe failed to load:', err);
        restoreToShell();
        appUI.showError(strings.errIframeLoad);
        return;
    }

    // Bind bridge to the iframe, pinning the expected server origin
    bridge.bind(frame, originOf(url));

    // Load and inject the bridge script into the iframe
    // On actual WebOS this works because the WebView allows the
    // app to access contentDocument of iframes it creates.
    // In a browser dev environment, cross-origin policy blocks it.
    try {
        const response = await fetch('./shell.js');
        const code = await response.text();

        const iframeDoc = frame.contentDocument || frame.contentWindow?.document;
        if (!iframeDoc) throw new Error('Cannot access iframe document (cross-origin — expected in dev mode)');

        const script = iframeDoc.createElement('script');
        script.textContent = code;
        iframeDoc.head?.appendChild(script);

        // Wait for the bridge to signal it's ready (with timeout)
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                console.warn('[Handoff] Bridge ready signal timed out, proceeding anyway');
                resolve();
            }, 5000);

            const check = () => {
                if (bridge.ready) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    requestAnimationFrame(check);
                }
            };
            setTimeout(check, 50);
        });

        // Wait for device info to be available (avoids race condition)
        const info = await new Promise<DeviceInfo>((resolve) => {
            waitForDeviceInfo(resolve);
        });

        // Send init message
        bridge.sendInit(appInfo, info);
        console.log('[Handoff] Complete:', url);
    } catch (err) {
        console.warn('[Handoff] Bridge injection skipped:', err);
        console.warn('[Handoff] This is expected in browser dev mode. On WebOS TV the bridge will inject normally.');
        // The Jellyfin web UI works without the bridge — it just won't have
        // WebOS-specific features (back button, device info, etc.)
    }
}

// ===== Shell State Helpers =====

function abortAction(): void {
    if (currReq) {
        console.log('[App] User aborted connection');
        currReq.abort();
    }
    handleAbort();
}

function handleFailure(err: any): void {
    console.error('Connection failure:', err);
    currReq = null;
    if (err.error === 'timeout') {
        appUI.showError(strings.errTimeout);
    } else if (err.error === 'abort') {
        appUI.showIdle();
    } else {
        appUI.showError(strings.errConnection(err.error));
    }
}

function handleAbort(): void {
    currReq = null;
    appUI.showIdle();
}

function backPressed(): void {
    if (typeof webOS !== 'undefined') {
        webOS.platformBack();
    } else {
        console.warn('[App] webOS not available, cannot call platformBack');
    }
}

/**
 * Free the current iframe's browsing context by replacing the node with a
 * fresh clone. Setting src='' alone keeps the cross-origin document alive
 * in some webOS WebView versions; node replacement guarantees release.
 */
function resetIframe(): void {
    const old = document.querySelector('#contentFrame');
    if (!old || !old.parentNode) return;
    const fresh = old.cloneNode(false) as HTMLIFrameElement;
    old.parentNode.replaceChild(fresh, old);
}

function restoreToShell(): void {
    bridge.unbind();
    allowScreensaver();
    resetIframe();
    appUI.restoreToShell();
    refreshServerList();
    startDiscovery((servers) => {
        discovered = servers;
        refreshServerList();
    });
    initNavigation();
}

// ===== Initialization =====

function Init(): void {
    // Get device ID
    appInfo.deviceId = getDeviceId();

    // Fetch app version from WebOS
    if (typeof webOS !== 'undefined') {
        webOS.fetchAppInfo((info) => {
            if (info) {
                appInfo.appVersion = info.version;
            }
        });

        // Fetch device capabilities (async — may not be ready before handoff)
        webOS.deviceInfo((info) => {
            deviceInfo = info;
            if (deviceInfoCallback) {
                deviceInfoCallback(info);
                deviceInfoCallback = null;
            }
        });
    }

    // Register bridge message handlers
    bridge.on(BridgeInbound.AppHostInit, (data) => {
        console.log('[Bridge] AppHost.init', data);
    });

    bridge.on(BridgeInbound.SelectServer, () => {
        console.log('[Bridge] selectServer');
        restoreToShell();
    });

    bridge.on(BridgeInbound.AppHostExit, () => {
        console.log('[Bridge] AppHost.exit');
        backPressed();
    });

    bridge.on(BridgeInbound.EnableFullscreen, () => {
        const root = document.documentElement;
        if (root.requestFullscreen) {
            root.requestFullscreen().catch((err) => console.warn('[Bridge] Fullscreen failed:', err));
        }
    });

    bridge.on(BridgeInbound.DisableFullscreen, () => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch((err) => console.warn('[Bridge] Exit fullscreen failed:', err));
        }
    });

    bridge.on(BridgeInbound.OpenUrl, (data: { url?: string; target?: string }) => {
        if (data?.url) {
            window.open(data.url, data.target || '_blank');
        }
    });

    bridge.on(BridgeInbound.DownloadFile, (data: { url?: string }) => {
        // webOS TV WebView has no download manager; opening the URL lets the
        // browser app handle it. Media playback stays inside the iframe.
        console.warn('[Bridge] downloadFile requested, delegating to browser:', data?.url);
        if (data?.url) window.open(data.url, '_blank');
    });

    bridge.on(BridgeInbound.UpdateMediaSession, () => {
        suppressScreensaver();
    });

    bridge.on(BridgeInbound.HideMediaSession, () => {
        allowScreensaver();
    });

    bridge.on(BridgeInbound.BridgeLoaded, () => {
        console.log('[Bridge] iframe bridge script loaded');
    });

    bridge.on(BridgeInbound.BridgeReady, () => {
        console.log('[Bridge] iframe bridge script ready');
    });

    // Wire up global message listener for the bridge
    window.addEventListener('message', (event) => {
        bridge.handleMessage(event);
    });

    // Wire up keyboard navigation (shell UI only)
    document.addEventListener('keydown', createKeyHandler());

    // Wire up back key globally
    document.addEventListener('keydown', (evt) => {
        if (evt.keyCode === 461) {
            backPressed();
        }
    });

    // Wire up UI state machine (connect/abort buttons)
    appUI.init({
        onConnect: (url) => connectToUrl(url),
        onAbort: () => abortAction()
    });

    // Restore saved servers
    // Handle backward compatibility: old installs used 'connected_server' (singular)
    savedServers = storage.get<ConnectedServers>('connected_servers') || {};
    if (Object.keys(savedServers).length === 0) {
        const oldServers = storage.get<ConnectedServers>('connected_server');
        if (oldServers && Object.keys(oldServers).length > 0) {
            savedServers = oldServers;
            storage.set('connected_servers', oldServers);
            storage.remove('connected_server');
        }
    }

    if (Object.keys(savedServers).length > 0) {
        const first = savedServers[Object.keys(savedServers)[0]];
        const urlField = document.querySelector<HTMLInputElement>('#baseurl');
        if (urlField) urlField.value = first.baseurl;

        const autoField = document.querySelector<HTMLInputElement>('#auto_connect');
        if (autoField) autoField.checked = first.auto_connect;
    }

    // Show saved servers right away
    refreshServerList();

    // Auto-connect without waiting for discovery
    const first = savedServers[Object.keys(savedServers)[0]];
    if (first?.auto_connect) {
        connectToUrl(first.baseurl);
    }

    // One-shot discovery for the initial list, then live updates
    discoverServers().then((servers) => {
        discovered = servers;
        if (servers.length > 0) {
            console.log('[App] Discovered servers:', servers.length);
            refreshServerList();
        }
    });
    startDiscovery((servers) => {
        discovered = servers;
        refreshServerList();
    });

    // App lifecycle: release screensaver suppression when app is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('[App] App hidden, allowing screensaver');
            allowScreensaver();
        }
    });

    // Initialize navigation
    initNavigation();
}

// Start the app
window.addEventListener('load', Init);
