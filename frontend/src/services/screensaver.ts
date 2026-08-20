/**
 * Screensaver suppression for video playback.
 *
 * Per LG's screensaver policy (webostv.developer.lge.com/develop/guides/screensaver),
 * the screensaver is suppressed automatically only when video plays in full screen.
 * Since Jellyfin renders inside an iframe with OSD overlays, we subscribe to the
 * tvpower screensaver request and reject activation while media is playing.
 *
 * Additionally, appinfo.json sets "screenSaverProperties": {"preferredType": 2}
 * (video streaming app with OSD) which extends the OLED timeout to 30 minutes.
 */

const CLIENT_NAME = 'org.jellyfin.webos';
const TVPOWER_URI = 'luna://com.webos.service.tvpower';

interface ScreenSaverMessage {
    state?: string;
    timestamp?: string;
    returnValue?: boolean;
}

let subscribed = false;
let playbackActive = false;

function respondToScreenSaver(timestamp?: string, ack: boolean = false): void {
    if (typeof webOS === 'undefined') return;
    try {
        webOS.service.request(TVPOWER_URI, {
            method: 'power/responseScreenSaverRequest',
            parameters: {
                clientName: CLIENT_NAME,
                ack: ack,
                timestamp: timestamp
            },
            onSuccess: () => { /* silent */ },
            onFailure: (err: any) => console.warn('[Screensaver] response failed:', err)
        });
    } catch (err) {
        console.warn('[Screensaver] response threw:', err);
    }
}

/**
 * Subscribe to screensaver requests. Idempotent — safe to call on every
 * playback start. While subscribed, screensaver activation is rejected
 * during playback and allowed otherwise.
 */
export function suppressScreensaver(): void {
    playbackActive = true;

    if (typeof webOS === 'undefined' || subscribed) return;
    subscribed = true;

    try {
        webOS.service.request(TVPOWER_URI, {
            method: 'power/registerScreenSaverRequest',
            parameters: {
                subscribe: true,
                clientName: CLIENT_NAME
            },
            subscribe: true,
            resubscribe: true,
            onSuccess: (msg: ScreenSaverMessage) => {
                if (msg.state === 'Active') {
                    // Reject while playing; allow when idle so the TV still sleeps eventually
                    console.log('[Screensaver] Activation requested, playbackActive =', playbackActive);
                    respondToScreenSaver(msg.timestamp, !playbackActive);
                }
            },
            onFailure: (err: any) => {
                console.warn('[Screensaver] registration failed:', err);
            }
        });
    } catch (err) {
        console.warn('[Screensaver] registration threw:', err);
    }
}

/**
 * Mark playback as stopped — future screensaver requests are allowed through.
 */
export function allowScreensaver(): void {
    playbackActive = false;
}
