/**
 * User-facing shell strings, centralized so a translation layer can be
 * added without touching logic. Static markup text lives in index.html.
 */
export const strings = {
    errInvalidUrl:
        'Please enter a valid URL, it needs a scheme (http:// or https://), a hostname or IP and a port (ex. :8096 or :8920).',
    errServerIdChanged:
        'The server ID has changed, please check if you are reaching your own server. To connect anyway, click connect again.',
    errTimeout: 'The request timed out. Make sure the server is reachable.',
    errConnection: (code: string): string => `Connection error: ${code}`,
    errIframeLoad:
        'The Jellyfin web client failed to load. Check that the server is running and reachable.'
};
