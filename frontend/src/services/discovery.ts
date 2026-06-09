/**
 * Discovery — WebOS Luna service wrapper for Jellyfin server discovery.
 *
 * Uses the LS2 service (org.jellyfin.webos.service) registered in the app's
 * services/ directory to discover Jellyfin servers on the local network via UDP broadcast.
 *
 * On WebOS, the service runs as a separate process; we communicate with it
 * via webOS.service.request() which sends a luna:// bus call.
 */

import type { ServerInfo } from '../types';

/** A raw server entry from the discovery service response */
interface DiscoveredServer {
    Id: string;
    Name: string;
    Address: string;
    /** Port the server is running on */
    Port?: string;
    /** Optional base URL constructed from Address + Port */
    baseurl?: string;
}

/** Response shape from the 'discover' service method */
interface DiscoveryResponse {
    results: Record<string, DiscoveredServer>;
    returnValue?: boolean;
    errorCode?: number;
    errorText?: string;
}

/** Normalize a host:port or IP:port into a base URL */
function buildBaseurl(server: DiscoveredServer): string {
    const host = server.Address;
    const port = server.Port || '8096';
    // Avoid double-port if Address already contains it
    if (host.includes(':')) return `http://${host}`;
    return `http://${host}:${port}`;
}

/**
 * Call the WebOS Luna discovery service to find Jellyfin servers.
 *
 * @param timeout Max milliseconds to wait for a response (default 8000)
 * @returns Array of discovered servers with resolved base URLs
 */
export function discoverServers(timeout = 8000): Promise<ServerInfo[]> {
    return new Promise((resolve, reject) => {
        if (typeof webOS === 'undefined') {
            console.warn('[Discovery] webOS not available, skipping discovery');
            resolve([]);
            return;
        }

        const timer = setTimeout(() => {
            console.warn('[Discovery] Timed out after', timeout, 'ms');
            resolve([]);
        }, timeout);

        try {
            webOS.service.request('luna://org.jellyfin.webos.service', {
                method: 'discover'
            }, {
                onSuccess: (response: DiscoveryResponse) => {
                    clearTimeout(timer);
                    if (response.results) {
                        const servers: ServerInfo[] = Object.entries(response.results).map(
                            ([id, s]) => ({
                                id: id,
                                Name: s.Name,
                                Address: s.Address,
                                baseurl: buildBaseurl(s),
                                auto_connect: false
                            })
                        );
                        console.log('[Discovery] Found', servers.length, 'server(s)');
                        resolve(servers);
                    } else {
                        resolve([]);
                    }
                },
                onFailure: (err: any) => {
                    clearTimeout(timer);
                    console.warn('[Discovery] Service call failed:', err);
                    resolve([]); // Don't reject — discovery failure shouldn't block the app
                }
            });
        } catch (err) {
            clearTimeout(timer);
            console.warn('[Discovery] Service call threw:', err);
            resolve([]);
        }
    });
}
