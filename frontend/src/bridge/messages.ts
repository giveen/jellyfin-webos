/**
 * Canonical postMessage protocol between the shell and the injected
 * iframe bridge (public/shell.js).
 *
 * public/shell.js is hand-maintained ES5 and cannot import this module —
 * test/bridge-protocol-sync.spec.ts parses shell.js and asserts every
 * type used there exists here (and vice versa) so the two can't drift.
 */

/** Iframe → Shell */
export const BridgeInbound = {
    AppHostInit: 'AppHost.init',
    AppHostExit: 'AppHost.exit',
    AppHostAppName: 'AppHost.appName',
    AppHostAppVersion: 'AppHost.appVersion',
    AppHostDeviceId: 'AppHost.deviceId',
    AppHostDeviceName: 'AppHost.deviceName',
    AppHostGetDefaultLayout: 'AppHost.getDefaultLayout',
    AppHostGetDeviceProfile: 'AppHost.getDeviceProfile',
    AppHostGetSyncProfile: 'AppHost.getSyncProfile',
    AppHostSupports: 'AppHost.supports',
    SelectServer: 'selectServer',
    DownloadFile: 'downloadFile',
    EnableFullscreen: 'enableFullscreen',
    DisableFullscreen: 'disableFullscreen',
    GetPlugins: 'getPlugins',
    OpenUrl: 'openUrl',
    UpdateMediaSession: 'updateMediaSession',
    HideMediaSession: 'hideMediaSession',
    BridgeLoaded: '_bridgeLoaded',
    BridgeReady: '_bridgeReady'
} as const;

/** Shell → Iframe */
export const BridgeOutbound = {
    Init: 'init'
} as const;

export type BridgeInboundType = (typeof BridgeInbound)[keyof typeof BridgeInbound];
