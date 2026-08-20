/**
 * ShellBridge — Handles postMessage communication between the WebOS shell
 * and the Jellyfin web UI loaded in an iframe.
 */

import { AppInfo, DeviceInfo, BridgeMessage } from '../types';
import { BridgeInbound, BridgeOutbound } from './messages';

export type BridgeEventHandler = (data?: any) => void;

export class ShellBridge {
    private iframe: HTMLIFrameElement | null = null;
    private handlers = new Map<string, BridgeEventHandler>();
    private _ready = false;
    /**
     * Origin of the Jellyfin server currently loaded in the iframe.
     * Once set, incoming messages must match it (defense against spoofed
     * postMessages from other windows). Null until the first handoff.
     */
    private trustedOrigin: string | null = null;

    /** Whether the bridge has received the _bridgeReady signal from the iframe */
    get ready(): boolean {
        return this._ready;
    }

    /**
     * Bind the bridge to an iframe element.
     * Call this after the iframe is created and before loading a new URL.
     * @param expectedOrigin Origin of the URL about to be loaded (e.g. 'https://jellyfin.example')
     */
    bind(iframe: HTMLIFrameElement, expectedOrigin?: string): void {
        this.iframe = iframe;
        this.trustedOrigin = expectedOrigin ?? null;
        this._ready = false;
    }

    /** Update the trusted origin after the iframe has navigated. */
    setTrustedOrigin(origin: string | null): void {
        this.trustedOrigin = origin;
    }

    /**
     * Send the init message to the iframe with app/device info.
     * The iframe must have loaded and the bridge script must be injected first.
     */
    sendInit(appInfo: AppInfo, deviceInfo: DeviceInfo): void {
        if (!this.iframe?.contentWindow) {
            console.error('[ShellBridge] Cannot send init: no iframe contentWindow');
            return;
        }

        // Target origin '*' is unavoidable for the handshake itself: the
        // bridge script inside the iframe can't be authenticated any other
        // way on a dynamic-origin server. Incoming traffic IS validated
        // against trustedOrigin in handleMessage().
        this.iframe.contentWindow.postMessage(
            { type: BridgeOutbound.Init, data: { appInfo, deviceInfo } },
            '*'
        );
        console.log('[ShellBridge] Init message sent');
    }

    /**
     * Handle an incoming message from the iframe.
     * Call this from your window.addEventListener('message', ...) handler.
     */
    handleMessage(event: MessageEvent): void {
        // Security: only accept messages originating from the bound iframe,
        // so other windows/pages can't spoof NativeShell commands.
        if (!this.iframe || event.source !== this.iframe.contentWindow) return;

        // Security: once we know the server origin, require a match.
        if (this.trustedOrigin && event.origin !== this.trustedOrigin) {
            console.warn(
                `[ShellBridge] Dropped message from unexpected origin: ${event.origin} (expected ${this.trustedOrigin})`
            );
            return;
        }

        const msg = event.data as BridgeMessage;
        if (!msg || !msg.type) return;

        // Track ready signals from the iframe bridge script
        if (msg.type === BridgeInbound.BridgeLoaded || msg.type === BridgeInbound.BridgeReady) {
            this._ready = true;
        }

        // Dispatch to registered handlers
        const handler = this.handlers.get(msg.type);
        if (handler) {
            handler(msg.data);
        } else {
            // Log unhandled messages for debugging
            console.log(`[ShellBridge] Unhandled message: ${msg.type}`, msg.data);
        }
    }

    /**
     * Register a handler for a specific message type.
     * @param type The message type string
     * @param handler Function to call when a message of this type is received
     */
    on(type: string, handler: BridgeEventHandler): void {
        this.handlers.set(type, handler);
    }

    /**
     * Remove a handler for a specific message type.
     */
    off(type: string): void {
        this.handlers.delete(type);
    }

    /**
     * Detach from the current iframe without discarding message handlers.
     * Use when returning to the shell — handlers registered via on() stay active
     * for the next handoff.
     */
    unbind(): void {
        this.iframe = null;
        this.trustedOrigin = null;
        this._ready = false;
    }

    /**
     * Fully tear down the bridge (detach AND clear all handlers).
     */
    destroy(): void {
        this.unbind();
        this.handlers.clear();
    }
}

/** Singleton instance for use throughout the app */
export const bridge = new ShellBridge();
