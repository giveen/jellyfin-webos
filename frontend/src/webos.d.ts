/* eslint-disable @typescript-eslint/no-explicit-any */

interface WebOSDeviceInfo {
    /** TV model name */
    modelName?: string;
    /** Firmware version */
    firmwareVersion?: string;
    /** SDK version */
    sdkVersion?: string;
    /** Screen width in pixels */
    screenWidth?: number;
    /** Screen height in pixels */
    screenHeight?: number;
    /** Whether Dolby Atmos is supported */
    dolbyAtmos?: boolean;
    /** Whether Dolby Vision is supported */
    dolbyVision?: boolean;
    /** Whether HDR10 is supported */
    hdr10?: boolean;
    [key: string]: any;
}

interface WebOSAppInfo {
    /** App ID from appinfo.json */
    id: string;
    /** App version string */
    version: string;
    [key: string]: any;
}

interface WebOSServiceRequestOptions {
    /** Service method name (e.g. 'discover') */
    method: string;
    /** Method parameters */
    parameters?: any;
    /** Keep the subscription open for multiple responses */
    subscribe?: boolean;
    /** Re-subscribe automatically after a service restart */
    resubscribe?: boolean;
    onSuccess?: (msg: any) => void;
    onFailure?: (err: any) => void;
    onComplete?: () => void;
}

interface WebOSServiceRequestHandle {
    /** Cancels a subscribed request */
    cancel(): void;
}

interface WebOSKeyboard {
    /** Checks whether the virtual keyboard is visible */
    isShowing: boolean;
}

declare namespace webOS {
    /** Holds properties representing the build version of the webOSTV.js library */
    var libVersion: string;
    
    /** Holds properties representing the platform identification of webOS variants */
    var platform: {
        /** true if running on webOS TV */
        tv?: boolean;
    };

    /** Cached app info (set by fetchAppInfo) */
    var appInfo: WebOSAppInfo | undefined;

    /**
     * Returns the device-specific information regarding the TV model, OS version,
     * SDK version, screen size, and resolution.
     * @param callback Function to call once the information is collected
     */
    function deviceInfo(callback: (info: WebOSDeviceInfo) => void): void;

    /**
     * Returns the appinfo.json data of the caller app.
     * @param callback Function to call with the app info data
     */
    function fetchAppInfo(callback: (info: WebOSAppInfo | null) => void): void;

    /**
     * Returns the app ID of the caller app.
     */
    function fetchAppId(): string;

    /**
     * Returns the full URI path of the caller app.
     */
    function fetchAppRootPath(): string;

    /**
     * Emulates the back key of the remote controller to move backward 1 level.
     */
    function platformBack(): void;

    /**
     * Returns the system-specific information.
     * @param callback Function to call with the system info
     */
    function systemInfo(callback: (info: any) => void): void;

    /** Virtual keyboard controls */
    const keyboard: WebOSKeyboard;

    /** Service request API */
    const service: {
        request(uri: string, options: WebOSServiceRequestOptions): WebOSServiceRequestHandle;
    };
}

declare var webOS: typeof webOS;
