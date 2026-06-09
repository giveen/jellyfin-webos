/**
 * Jellyfin for webOS — App Entry Point
 *
 * Modernized Vite + TypeScript shell that wraps the Jellyfin web UI
 * in a WebOS app container. Handles server discovery, connection,
 * and communication between the shell and the Jellyfin iframe.
 */

import { ajax } from './services/ajax';
import { storage } from './services/storage';
import { discoverServers } from './services/discovery';
import { bridge } from './bridge/bridge';
import { initNavigation, createKeyHandler } from './ui/navigation';
import type { AppInfo, DeviceInfo, ServerInfo, ConnectedServers } from './types';

// ===== State =====
let currReq: XMLHttpRequest | null = null;
let appInfo: AppInfo = {
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

function normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'http://' + normalized;
    }
    const parts = normalized.split('://');
    for (let i = 1; i < parts.length; i++) {
        parts[i] = parts[i].replace(/\/\//g, '/');
    }
    return parts.join('://');
}

function validURL(str: string): boolean {
    return /^https?:\/\/\S+$/i.test(str);
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

// ===== Connection Logic =====

function handleServerSelect(): void {
    const baseurlEl = document.querySelector<HTMLInputElement>('#baseurl');
    if (!baseurlEl) return;

    const autoConnectEl = document.querySelector<HTMLInputElement>('#auto_connect');
    const baseurl = normalizeUrl(baseurlEl.value);
    const autoConnect = autoConnectEl?.checked ?? false;

    if (!validURL(baseurl)) {
        displayError('Please enter a valid URL, it needs a scheme (http:// or https://), a hostname or IP and a port (ex. :8096 or :8920).');
        return;
    }

    displayConnecting();
    if (currReq) currReq.abort();
    hideError();
    getServerInfo(baseurl, autoConnect);
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
    const currentServers = storage.get<ConnectedServers>('connected_servers') || {};
    for (const id in currentServers) {
        if (currentServers[id].baseurl === baseurl && currentServers[id].id !== data.Id) {
            hideConnecting();
            displayError('The server ID has changed, please check if you are reaching your own server. To connect anyway, click connect again.');
            delete currentServers[id];
            storage.set('connected_servers', currentServers);
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
    for (const id of Object.keys(currentServers)) {
        if (count >= 4) break;
        if (id !== newEntry.id) {
            updated[id] = currentServers[id];
            count++;
        }
    }
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
    const servers = storage.get<ConnectedServers>('connected_servers') || {};
    for (const id in servers) {
        if (servers[id].baseurl === baseurl) {
            servers[id].hosturl = hosturl;
            storage.set('connected_servers', servers);
            break;
        }
    }

    handoff(hosturl);
}

// ===== Iframe Handoff =====

async function handoff(url: string): Promise<void> {
    const container = document.querySelector('.container') as HTMLElement;
    const frame = document.querySelector('#contentFrame') as HTMLIFrameElement;
    if (!frame) return;

    container?.classList.add('hidden');
    frame.style.display = 'block';
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
        displayError('The Jellyfin web client failed to load. Check that the server is running and reachable.');
        return;
    }

    // Bind bridge to the iframe
    bridge.bind(frame);

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

// ===== UI Helpers =====

function abortAction(): void {
    if (currReq) {
        console.log('[App] User aborted connection');
        currReq.abort();
    }
    handleAbort();
}

function displayError(message: string): void {
    const el = document.querySelector('#error');
    if (el) {
        (el as HTMLElement).style.display = 'block';
        el.textContent = message;
    }
}

function hideError(): void {
    const el = document.querySelector('#error');
    if (el) {
        (el as HTMLElement).style.display = 'none';
        el.textContent = '';
    }
}

function displayConnecting(): void {
    document.querySelector('#serverInfoForm')?.classList.add('hidden');
    document.querySelector('#busy')?.classList.remove('hidden');
}

function hideConnecting(): void {
    document.querySelector('#serverInfoForm')?.classList.remove('hidden');
    document.querySelector('#busy')?.classList.add('hidden');
}

function handleFailure(err: any): void {
    console.error('Connection failure:', err);
    hideConnecting();
    if (err.error === 'timeout') {
        displayError('The request timed out. Make sure the server is reachable.');
    } else if (err.error === 'abort') {
        displayError('The request was aborted.');
    } else {
        displayError(`Connection error: ${err.error}`);
    }
    currReq = null;
}

function handleAbort(): void {
    hideConnecting();
    currReq = null;
}

function backPressed(): void {
    if (typeof webOS !== 'undefined') {
        webOS.platformBack();
    } else {
        console.warn('[App] webOS not available, cannot call platformBack');
    }
}

function restoreToShell(): void {
    const frame = document.querySelector('#contentFrame') as HTMLIFrameElement;
    if (frame) {
        frame.style.display = 'none';
        frame.src = '';
    }
    document.querySelector('.container')?.classList.remove('hidden');
    bridge.destroy();
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
    bridge.on('selectServer', () => {
        console.log('[Bridge] selectServer');
        restoreToShell();
    });

    bridge.on('AppHost.exit', () => {
        console.log('[Bridge] AppHost.exit');
        backPressed();
    });

    bridge.on('_bridgeLoaded', () => {
        console.log('[Bridge] iframe bridge script loaded');
    });

    bridge.on('_bridgeReady', () => {
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

    // Wire up connect button
    document.querySelector('#connect')?.addEventListener('click', handleServerSelect);

    // Wire up abort button
    document.querySelector('#abort')?.addEventListener('click', abortAction);

    // Auto-discover servers on the local network
    discoverServers().then((servers) => {
        if (servers.length > 0) {
            console.log('[App] Discovered servers:', servers);
            const urlField = document.querySelector<HTMLInputElement>('#baseurl');
            if (urlField && !urlField.value) {
                // Fill in the first discovered server
                urlField.value = servers[0].baseurl;
            }
        }
    });

    // Restore saved servers
    // Handle backward compatibility: old installs used 'connected_server' (singular)
    let savedServers = storage.get<ConnectedServers>('connected_servers');
    if (!savedServers) {
        const oldServers = storage.get<ConnectedServers>('connected_server');
        if (oldServers) {
            savedServers = oldServers;
            storage.set('connected_servers', oldServers);
            storage.remove('connected_server');
        }
    }
    if (savedServers) {
        const keys = Object.keys(savedServers);
        if (keys.length > 0) {
            const first = savedServers[keys[0]];
            const urlField = document.querySelector<HTMLInputElement>('#baseurl');
            if (urlField) urlField.value = first.baseurl;

            const autoField = document.querySelector<HTMLInputElement>('#auto_connect');
            if (autoField) autoField.checked = first.auto_connect;

            if (first.auto_connect) {
                handleServerSelect();
            }
        }
    }

    // Initialize navigation
    initNavigation();
}

// Start the app
window.addEventListener('load', Init);
