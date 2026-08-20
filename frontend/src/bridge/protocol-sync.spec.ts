/**
 * Protocol sync guard: public/shell.js is hand-maintained ES5 and cannot
 * import the constants module. This test parses every postMessage type it
 * emits and asserts both sides of the protocol stay in lockstep.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeInbound } from './messages';

const here = dirname(fileURLToPath(import.meta.url));
const shellJsPath = resolve(here, '../../public/shell.js');
const shellJs = readFileSync(shellJsPath, 'utf-8');

/** All first-argument string literals of postMessage('...') calls in shell.js */
function emittedTypes(): string[] {
    const re = /postMessage\(\s*'([^']+)'/g;
    const types: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(shellJs)) !== null) {
        types.push(m[1]);
    }
    return types;
}

describe('shell.js ↔ messages.ts protocol sync', () => {
    const declared = Object.values(BridgeInbound) as string[];
    const emitted = emittedTypes();

    it('found postMessage calls in shell.js', () => {
        expect(emitted.length).toBeGreaterThan(0);
    });

    it('every type emitted by shell.js is declared in BridgeInbound', () => {
        const unknown = emitted.filter((t) => !declared.includes(t));
        expect(unknown).toEqual([]);
    });

    it('every BridgeInbound type is emitted by shell.js', () => {
        const missing = declared.filter((t) => !emitted.includes(t));
        expect(missing).toEqual([]);
    });
});
