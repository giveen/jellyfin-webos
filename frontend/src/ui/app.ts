/**
 * App UI — connection state machine and shell screen management.
 *
 * States:
 *   idle       → server form visible
 *   connecting → busy indicator visible, form hidden
 *   connected  → Jellyfin iframe visible, shell hidden
 *   error      → form visible with error message
 */

import type { ServerInfo } from '../types';

export type AppState = 'idle' | 'connecting' | 'connected' | 'error';

type ConnectHandler = (url: string) => void;
type AbortHandler = () => void;

export interface AppUIHandlers {
    onConnect: ConnectHandler;
    onAbort: AbortHandler;
}

function el<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return document.querySelector<T>(selector);
}

class AppUI {
    private state: AppState = 'idle';
    private handlers: AppUIHandlers | null = null;

    get current(): AppState {
        return this.state;
    }

    /**
     * Wire up static UI event handlers.
     */
    init(handlers: AppUIHandlers): void {
        this.handlers = handlers;

        el('#connect')?.addEventListener('click', () => {
            const url = el<HTMLInputElement>('#baseurl')?.value ?? '';
            this.handlers?.onConnect(url);
        });

        el('#abort')?.addEventListener('click', () => {
            this.handlers?.onAbort();
        });
    }

    // ===== State transitions =====

    showIdle(): void {
        this.state = 'idle';
        this.showShell();
        this.toggle('#serverInfoForm', true);
        this.toggle('#busy', false);
        this.hideError();
    }

    showConnecting(): void {
        this.state = 'connecting';
        this.showShell();
        this.toggle('#serverInfoForm', false);
        this.toggle('#serverList', false);
        this.toggle('#busy', true);
        this.hideError();
        el<HTMLButtonElement>('#abort')?.focus();
    }

    showError(message: string): void {
        if (this.state === 'connected') return;
        this.state = 'error';
        this.showShell();
        this.toggle('#serverInfoForm', true);
        this.toggle('#serverList', true);
        this.toggle('#busy', false);
        const errorEl = el('#error');
        if (errorEl) {
            errorEl.textContent = message;
            this.toggle('#error', true);
        }
    }

    hideError(): void {
        const errorEl = el('#error');
        if (errorEl) {
            errorEl.textContent = '';
            this.toggle('#error', false);
        }
    }

    /** Hide the shell and show the Jellyfin iframe. */
    showConnected(): void {
        this.state = 'connected';
        el('.container')?.classList.add('hidden');
        const frame = el<HTMLIFrameElement>('#contentFrame');
        if (frame) frame.style.display = 'block';
    }

    /** Return from the iframe to the idle shell state. */
    restoreToShell(): void {
        const frame = el<HTMLIFrameElement>('#contentFrame');
        if (frame) {
            frame.style.display = 'none';
            // removeAttribute, not src='' — assigning '' navigates the
            // iframe to the shell's own URL
            frame.removeAttribute('src');
        }
        this.showIdle();
    }

    get isConnected(): boolean {
        return this.state === 'connected';
    }

    // ===== Server list =====

    /**
     * Render discovered/saved servers as focusable cards.
     * Deduplicate before calling — every entry is rendered as-is.
     * @param onPick Called with the server's base URL when selected
     */
    renderServers(servers: ServerInfo[], onPick: (url: string) => void): void {
        const list = el('#serverList');
        if (!list) return;
        list.innerHTML = '';

        const visible = servers.filter((s) => s.baseurl);
        if (visible.length === 0) {
            this.toggle('#serverList', false);
            return;
        }

        for (const server of visible) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'server-card';
            card.setAttribute('data-focusable', '');
            card.dataset.url = server.baseurl;

            const name = document.createElement('span');
            name.className = 'server-name';
            name.textContent = server.Name || server.Address || server.baseurl;
            card.appendChild(name);

            const addr = document.createElement('span');
            addr.className = 'server-address';
            addr.textContent = server.baseurl;
            card.appendChild(addr);

            card.addEventListener('click', () => onPick(server.baseurl));
            list.appendChild(card);
        }

        this.toggle('#serverList', true);
    }

    // ===== Internals =====

    private showShell(): void {
        el('.container')?.classList.remove('hidden');
        const frame = el<HTMLIFrameElement>('#contentFrame');
        if (frame) frame.style.display = 'none';
    }

    private toggle(selector: string, visible: boolean): void {
        el(selector)?.classList.toggle('hidden', !visible);
    }
}

export const appUI = new AppUI();
