import { describe, it, expect } from 'vitest';
import { normalizeUrl, validURL, originOf } from './url';

describe('normalizeUrl', () => {
    it('adds http:// when scheme is missing', () => {
        expect(normalizeUrl('jellyfin.local:8096')).toBe('http://jellyfin.local:8096');
    });

    it('keeps existing schemes', () => {
        expect(normalizeUrl('https://jellyfin.local')).toBe('https://jellyfin.local');
        expect(normalizeUrl('http://jellyfin.local')).toBe('http://jellyfin.local');
    });

    it('collapses duplicate slashes in the path', () => {
        expect(normalizeUrl('http://host//a///b')).toBe('http://host/a/b');
    });

    it('trims whitespace', () => {
        expect(normalizeUrl('  http://host  ')).toBe('http://host');
    });
});

describe('validURL', () => {
    it('accepts http(s) URLs', () => {
        expect(validURL('http://host:8096')).toBe(true);
        expect(validURL('https://jellyfin.example.com/web')).toBe(true);
    });

    it('rejects strings without a scheme or with spaces', () => {
        expect(validURL('jellyfin.local:8096')).toBe(false);
        expect(validURL('ftp://host')).toBe(false);
        expect(validURL('http://ho st')).toBe(false);
        expect(validURL('')).toBe(false);
    });
});

describe('originOf', () => {
    it('returns scheme + host + port', () => {
        expect(originOf('http://192.168.1.10:8096/web/index.html')).toBe('http://192.168.1.10:8096');
    });

    it('returns empty string for invalid input', () => {
        expect(originOf('not a url')).toBe('');
    });
});
