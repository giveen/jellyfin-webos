import { describe, it, expect, beforeEach } from 'vitest';
import { appUI } from './app';
import type { ServerInfo } from '../types';

const fixture = `
<div class="container">
  <div id="serverInfoForm"></div>
  <div id="serverList" class="hidden"></div>
  <div id="busy" class="hidden"><button id="abort" data-focusable>Abort</button></div>
  <p id="error" class="hidden"></p>
</div>
<iframe id="contentFrame"></iframe>
`;

function server(baseurl: string): ServerInfo {
    return { id: baseurl, baseurl, auto_connect: false, Name: baseurl };
}

describe('appUI state machine', () => {
    beforeEach(() => {
        document.body.innerHTML = fixture;
    });

    it('showConnecting hides the form and shows busy', () => {
        appUI.showConnecting();
        expect(document.querySelector('#serverInfoForm')!.classList.contains('hidden')).toBe(true);
        expect(document.querySelector('#busy')!.classList.contains('hidden')).toBe(false);
    });

    it('showError reveals the form with a message', () => {
        appUI.showError('boom');
        expect(document.querySelector('#serverInfoForm')!.classList.contains('hidden')).toBe(false);
        expect(document.querySelector('#error')!.textContent).toBe('boom');
        expect(document.querySelector('#busy')!.classList.contains('hidden')).toBe(true);
    });

    it('showConnected hides shell and shows iframe', () => {
        appUI.showConnected();
        const frame = document.querySelector<HTMLIFrameElement>('#contentFrame')!;
        expect(frame.style.display).toBe('block');
        expect(document.querySelector('.container')!.classList.contains('hidden')).toBe(true);
    });

    it('restoreToShell returns to idle and clears the iframe', () => {
        appUI.showConnected();
        const frame = document.querySelector<HTMLIFrameElement>('#contentFrame')!;
        frame.src = 'http://x';
        appUI.restoreToShell();

        expect(appUI.current).toBe('idle');
        expect(frame.style.display).toBe('none');
        expect(frame.src).toBe('');
    });

    it('renderServers creates focusable cards and dedupes nothing', () => {
        appUI.renderServers([server('http://a'), server('http://b')], () => {});
        const cards = document.querySelectorAll('.server-card');
        expect(cards.length).toBe(2);
        expect(cards[0].getAttribute('data-focusable')).not.toBeNull();
    });

    it('renderServers hides the list when empty', () => {
        appUI.renderServers([], () => {});
        expect(document.querySelector('#serverList')!.classList.contains('hidden')).toBe(true);
    });

    it('card click invokes onPick with the server URL', () => {
        let picked = '';
        appUI.renderServers([server('http://pick-me')], (url) => (picked = url));
        (document.querySelector('.server-card') as HTMLButtonElement).click();
        expect(picked).toBe('http://pick-me');
    });
});
