
export interface AppInfo {
    deviceId: string | null;
    deviceName: string;
    appName: string;
    appVersion: string;
}

export interface DeviceInfo {
    [key: string]: any;
    screenWidth?: number;
    screenHeight?: number;
    dolbyAtmos?: boolean;
    dolbyVision?: boolean;
    hdr10?: boolean;
}

export interface ServerInfo {
    id: string;
    baseurl: string;
    auto_connect: boolean;
    Name?: string;
    Address?: string;
    hosturl?: string;
}

export interface ConnectedServers {
    [key: string]: ServerInfo;
}

export interface BridgeMessage {
    type: string;
    data?: any;
}

export interface InitMessage {
    type: 'init';
    data: {
        appInfo: AppInfo;
        deviceInfo: DeviceInfo;
    };
}

export interface MediaSessionInfo {
    [key: string]: any;
}
