/** URL normalization and validation used by the connection flow. */

export function normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'http://' + normalized;
    }
    const parts = normalized.split('://');
    for (let i = 1; i < parts.length; i++) {
        // Collapse any run of slashes in the path (single-pass replace
        // leaves doubles inside odd-length runs like '///')
        parts[i] = parts[i].replace(/\/{2,}/g, '/');
    }
    return parts.join('://');
}

export function validURL(str: string): boolean {
    return /^https?:\/\/\S+$/i.test(str);
}

/** Extract the origin (scheme + host + port) from a full URL. */
export function originOf(url: string): string {
    try {
        return new URL(url).origin;
    } catch {
        return '';
    }
}
