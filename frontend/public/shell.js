/**
 * Jellyfin for webOS — Bridge script
 * 
 * Injected into the Jellyfin iframe after it loads.
 * Listens for an 'init' message from the parent shell,
 * then sets up window.NativeShell for Jellyfin's web client to consume.
 * 
 * Compatible with webOS 3+ (Chromium 53+).
 */

(function () {
  'use strict';

  var appInfo = null;
  var deviceInfo = null;

  // Supported features list (matches Jellyfin's expectations)
  var SupportedFeatures = [
    'exit',
    'externallinkdisplay',
    'htmlaudioautoplay',
    'htmlvideoautoplay',
    'imageanalysis',
    'physicalvolumecontrol',
    'displaylanguage',
    'otherapppromotions',
    'targetblank',
    'screensaver',
    'subtitleappearancesettings',
    'subtitleburnsettings',
    'chromecast',
    'multiserver'
  ];

  function postMessage(type, data) {
    try {
      window.parent.postMessage({ type: type, data: data }, '*');
    } catch (e) {
      console.error('[WebOS Bridge] postMessage error:', e);
    }
  }

  function createNativeShell() {
    if (!appInfo) return;

    window.AppInfo = appInfo;
    window.DeviceInfo = deviceInfo;

    window.NativeShell = {
      AppHost: {
        init: function () {
          postMessage('AppHost.init', appInfo);
          return Promise.resolve(appInfo);
        },

        appName: function () {
          postMessage('AppHost.appName', appInfo.appName);
          return appInfo.appName;
        },

        appVersion: function () {
          postMessage('AppHost.appVersion', appInfo.appVersion);
          return appInfo.appVersion;
        },

        deviceId: function () {
          postMessage('AppHost.deviceId', appInfo.deviceId);
          return appInfo.deviceId;
        },

        deviceName: function () {
          postMessage('AppHost.deviceName', appInfo.deviceName);
          return appInfo.deviceName;
        },

        exit: function () {
          postMessage('AppHost.exit');
        },

        getDefaultLayout: function () {
          postMessage('AppHost.getDefaultLayout', 'tv');
          return 'tv';
        },

        getDeviceProfile: function (profileBuilder) {
          postMessage('AppHost.getDeviceProfile');
          return profileBuilder({
            enableMkvProgressive: false,
            enableSsaRender: true,
            supportsDolbyAtmos: deviceInfo ? deviceInfo.dolbyAtmos : null,
            supportsDolbyVision: deviceInfo ? deviceInfo.dolbyVision : null,
            supportsHdr10: deviceInfo ? deviceInfo.hdr10 : null
          });
        },

        getSyncProfile: function (profileBuilder) {
          postMessage('AppHost.getSyncProfile');
          return profileBuilder({ enableMkvProgressive: false });
        },

        supports: function (command) {
          var isSupported = command && SupportedFeatures.indexOf(command.toLowerCase()) !== -1;
          postMessage('AppHost.supports', {
            command: command,
            isSupported: isSupported
          });
          return isSupported;
        },

        screen: function () {
          return deviceInfo ? {
            width: deviceInfo.screenWidth,
            height: deviceInfo.screenHeight
          } : null;
        }
      },

      selectServer: function () {
        postMessage('selectServer');
      },

      downloadFile: function (url) {
        postMessage('downloadFile', { url: url });
      },

      enableFullscreen: function () {
        postMessage('enableFullscreen');
      },

      disableFullscreen: function () {
        postMessage('disableFullscreen');
      },

      getPlugins: function () {
        postMessage('getPlugins');
        return [];
      },

      openUrl: function (url, target) {
        postMessage('openUrl', {
          url: url,
          target: target
        });
      },

      updateMediaSession: function (mediaInfo) {
        postMessage('updateMediaSession', { mediaInfo: mediaInfo });
      },

      hideMediaSession: function () {
        postMessage('hideMediaSession');
      }
    };

    console.log('[WebOS Bridge] NativeShell ready');
    postMessage('_bridgeReady');
  }

  // Listen for the 'init' message from the parent shell
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'init') {
      appInfo = msg.data.appInfo;
      deviceInfo = msg.data.deviceInfo;
      createNativeShell();
    }
  });

  // Signal that the bridge script has loaded
  postMessage('_bridgeLoaded');
})();
