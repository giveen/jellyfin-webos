import { describe, it, expect, beforeEach } from 'vitest';
import { ShellBridge } from './bridge';
import { BridgeInbound, BridgeOutbound } from './messages';

function fakeEvent(
    source: unknown,
    type: string,
    origin = 'http://server.example'
): MessageEvent {
    return { source, origin, data: { type } } as unknown as MessageEvent;
}

function fakeIframe() {
    return { contentWindow: { postMessage: () => {} } } as unknown as HTMLIFrameElement;
}

describe('ShellBridge', () => {
    let bridge: ShellBridge;
    const iframe = fakeIframe();

    beforeEach(() => {
        bridge = new ShellBridge();
        bridge.bind(iframe, 'http://server.example');
    });

    it('dispatches registered handlers', () => {
        const received: string[] = [];
        bridge.on(BridgeInbound.SelectServer, () => received.push('selectServer'));

        bridge.handleMessage(fakeEvent(iframe.contentWindow, BridgeInbound.SelectServer));
        expect(received).toEqual(['selectServer']);
    });

    it('drops messages from other windows', () => {
        const received: string[] = [];
        bridge.on(BridgeInbound.SelectServer, () => received.push('x'));

        bridge.handleMessage(fakeEvent({} /* not the iframe */, BridgeInbound.SelectServer));
        expect(received).toEqual([]);
    });

    it('drops messages with a mismatched origin once trusted origin is set', () => {
        const received: string[] = [];
        bridge.on(BridgeInbound.SelectServer, () => received.push('x'));

        bridge.handleMessage(
            fakeEvent(iframe.contentWindow, BridgeInbound.SelectServer, 'http://evil.example')
        );
        expect(received).toEqual([]);
    });

    it('accepts any origin before a trusted origin is known', () => {
        const loose = new ShellBridge();
        loose.bind(fakeIframe());
        const received: string[] = [];
        loose.on(BridgeInbound.SelectServer, () => received.push('x'));

        loose.handleMessage(
            fakeEvent(loose['iframe']?.contentWindow, BridgeInbound.SelectServer, 'http://anything')
        );
        expect(received).toEqual(['x']);
    });

    it('marks ready on bridge lifecycle signals', () => {
        expect(bridge.ready).toBe(false);
        bridge.handleMessage(fakeEvent(iframe.contentWindow, BridgeInbound.BridgeLoaded));
        expect(bridge.ready).toBe(true);
    });

    it('unbind keeps handlers for the next handoff', () => {
        const received: string[] = [];
        bridge.on(BridgeInbound.AppHostExit, () => received.push('exit'));

        bridge.unbind();
        expect(bridge.ready).toBe(false);

        const iframe2 = fakeIframe();
        bridge.bind(iframe2, 'http://server.example');
        bridge.handleMessage(fakeEvent(iframe2.contentWindow, BridgeInbound.AppHostExit));
        expect(received).toEqual(['exit']);
    });

    it('destroy clears handlers', () => {
        const received: string[] = [];
        bridge.on(BridgeInbound.AppHostExit, () => received.push('exit'));
        bridge.destroy();

        const iframe2 = fakeIframe();
        bridge.bind(iframe2);
        bridge.handleMessage(fakeEvent(iframe2.contentWindow, BridgeInbound.AppHostExit));
        expect(received).toEqual([]);
    });

    it('sendInit posts the init message to the iframe', () => {
        let sent: any = null;
        const spy = {
            contentWindow: { postMessage: (msg: any) => (sent = msg) }
        } as unknown as HTMLIFrameElement;
        bridge.bind(spy, 'http://server.example');

        bridge.sendInit(
            { deviceId: 'd1', deviceName: 'TV', appName: 'a', appVersion: '1' },
            {}
        );
        expect(sent?.type).toBe(BridgeOutbound.Init);
        expect(sent?.data.appInfo.deviceId).toBe('d1');
    });
});
