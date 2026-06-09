/**
 * ShellBridge — Handles postMessage communication between the WebOS shell
 * and the Jellyfin web UI loaded in an iframe.
 */

import { AppInfo, DeviceInfo, BridgeMessage, MediaSessionInfo } from '../types';

export type BridgeEventHandler = (data?: any) => void;

export class ShellBridge {
    private iframe: HTMLIFrameElement | null = null;
    private handlers = new Map<string, BridgeEventHandler>();
    private _ready = false;

    /** Whether the bridge has received the _bridgeReady signal from the iframe */
    get ready(): boolean {
        return this._ready;
    }

    /**
     * Bind the bridge to an iframe element.
     * Call this after the iframe is created and before loading a new URL.
     */
    bind(iframe: HTMLIFrameElement): void {
        this.iframe = iframe;
        this._ready = false;
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

        this.iframe.contentWindow.postMessage(
            { type: 'init', data: { appInfo, deviceInfo } },
            '*' // We can't restrict origin since Jellyfin URL is dynamic
        );
        console.log('[ShellBridge] Init message sent');
    }

    /**
     * Handle an incoming message from the iframe.
     * Call this from your window.addEventListener('message', ...) handler.
     */
    handleMessage(event: MessageEvent): void {
        const msg = event.data as BridgeMessage;
        if (!msg || !msg.type) return;

        // Track ready signals from the iframe bridge script
        if (msg.type === '_bridgeLoaded' || msg.type === '_bridgeReady') {
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
     * Clean up the bridge (remove iframe reference, clear handlers).
     */
    destroy(): void {
        this.iframe = null;
        this.handlers.clear();
        this._ready = false;
    }
}

/** Singleton instance for use throughout the app */
export const bridge = new ShellBridge();
