# Jellyfin for webOS

This is a small wrapper around the web interface provided by the server (<https://github.com/jellyfin/jellyfin-web>) so most of the development happens there.

The shell handles server discovery and connection, then hands off to your Jellyfin server's own web UI inside a native webOS app container. A small bridge script provides TV-specific features (device profile, remote back key, screensaver suppression during playback).

## Download

For all versions:

<p align="center">
<a href="https://us.lgappstv.com/main/tvapp/detail?appId=1030579"><img alt="Enjoy on LG Smart TV" src="https://repo.jellyfin.org/releases/other/lg-badge/LG_BADGE_greyborders_135x40.png"/></a>
<br/>
<em><strong>Note:</strong> If you previously installed the app via Homebrew or Developer mode, you must uninstall that before you can use the store version.</em>
</p>

### Version support

- **LG Content Store**: requires webOS 6 or newer (2021 TVs and later).
- **Older TVs (webOS 2–5)**: download a release IPK from [Releases](https://github.com/jellyfin/jellyfin-webos/releases/latest) and install it using [Developer Mode](#testing-on-a-tv), following LG's documented process.

## Architecture

```
frontend/   Vite + TypeScript shell
├── src/    Connection UI, server discovery, focus management,
│           postMessage bridge to the Jellyfin iframe
└── dist/   Production build (packaged into the .ipk)

services/   On-TV Node.js service (UDP autodiscovery of Jellyfin servers
            on port 7359, exposed over the Luna bus)
```

The build targets **ES2017** so the shell parses on the Chromium engines shipped with webOS 3.x–5.x TVs.

---

## Development

### Prerequisites

- Node.js 20+ and npm
- For packaging/installing: one of the build environments below

### Frontend workflow

```sh
cd frontend
npm install
npm run dev        # Vite dev server
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest unit tests
npm run build      # production bundle → dist/
```

> **Note:** In a desktop browser, bridge injection into the cross-origin iframe is blocked by the same-origin policy. This is expected — on webOS TV the WebView permits it.

### Building the package

From the repository root:

```sh
npm install        # installs @webosose/ares-cli locally
npm run package    # builds frontend/dist, then packages it with services/
```

This produces `build/org.jellyfin.webos_<version>_all.ipk`.

There are three ways to set up the required webOS build environment:

- **NPM ares-cli** (default): `npm install` at the repo root installs [`@webosose/ares-cli`](https://webostv.developer.lge.com/develop/tools/cli-introduction), per LG's CLI documentation
- **Docker**: a prebuilt image with build/deploy dependencies is available at [ghcr.io/oddstr13/docker-tizen-webos-sdk](https://ghcr.io/oddstr13/docker-tizen-webos-sdk); `dev.sh` wraps the Docker commands
- **Full WebOS SDK Installation**: <http://webostv.developer.lge.com/sdk/installation/>

With the SDK installed natively, you can also invoke `ares-package` directly:

```sh
ares-package --no-minify --outdir build/ frontend/dist services
```

---

## Testing on a TV

Testing on real hardware requires an LG Developer account and LG's **Developer Mode app**, per [LG's documentation](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app/):

1. Create an account at [webostv.developer.lge.com](https://webostv.developer.lge.com/)
2. On the TV: open the **LG Content Store**, search for **"Developer Mode"**, and install it
3. Launch the Developer Mode app, sign in, and click **Dev Mode Status** to enable it (the TV reboots)
4. Relaunch the app and turn on **Key Server**
5. **Make sure to take a note of the passphrase** shown on screen (6 characters, case sensitive)

Then connect your PC (same network as the TV):

```sh
# Add your TV as a target device. LG's Developer Mode uses port 9922
# and the user 'prisoner'. Naming it `tv` matches the examples below.
./dev.sh ares-setup-device --search

# Retrieve the SSH key from the TV (Key Server must be running;
# enter the passphrase when prompted)
./dev.sh ares-novacom --device tv --getkey

# Verify the connection
./dev.sh ares-device --system-info -d tv
```

Install and run the app:

```sh
# Install the built package
./dev.sh ares-install -d tv org.jellyfin.webos_*.ipk

# Launch the app with the web developer console attached
./dev.sh ares-inspect -d tv org.jellyfin.webos

# Or just launch the app
./dev.sh ares-launch -d tv org.jellyfin.webos
```

If you installed the SDK natively instead of using `dev.sh`/Docker, omit the `./dev.sh` prefix and run the `ares-*` commands directly.

### Developer Mode notes (from LG's documentation)

- Developer Mode sessions are time-limited. Extend the session with the **EXTEND** button in the Developer Mode app while the TV is online; if it expires, sideloaded apps are removed.
- Developer Mode is disabled after 10 reboots without a network connection, or when the session runs out.
- **Key Server** only needs to be enabled when adding the device or retrieving the SSH key.

---

## Usage

Fill in your hostname, port, and schema and click connect. The app will check for a server by grabbing the manifest and the public serverinfo. Afterwards, the app hands off control to the hosted webUI.

Discovered servers on your local network appear automatically as selectable cards.

## License

All Jellyfin webOS code is licensed under the MPL 2.0 license, some parts incorporate content licensed under the Apache 2.0 license. All images are taken from and licensed under the same license as <https://github.com/jellyfin/jellyfin-ux>.
