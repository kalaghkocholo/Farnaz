# Vendored LiveKit browser SDK

This directory contains the license notice for the upstream LiveKit JavaScript client.

- Package: `livekit-client`
- Pinned version: `2.23.0`
- Upstream source: https://github.com/livekit/client-sdk-js/tree/v2.23.0
- Package registry: https://www.npmjs.com/package/livekit-client/v/2.23.0
- License: Apache-2.0 (see [LICENSE](./LICENSE))
- Expected browser artifact: `livekit-client-2.23.0.umd.js`
- Expected loader path: `vendor/livekit/livekit-client-2.23.0.umd.js`

## Artifact integrity gate

The executable bundle is intentionally **not present yet**. Do not create a placeholder or copy a runtime CDN response into this repository.

Before adding the bundle:
1. Obtain the exact `dist/livekit-client.umd.js` file from the official npm package tarball for version `2.23.0`.
2. Verify the tarball against the registry's published integrity metadata.
3. Extract only the UMD artifact; preserve the Apache-2.0 license.
4. Record the tarball integrity, bundle SHA-256, exact byte size, source URL, and retrieval date in this file.
5. Run the loader tests and a browser smoke test on iOS Safari and desktop browsers.
6. Confirm the service worker caches this optional asset without putting it on the critical app-startup path.

No CDN fallback is permitted. The feature remains disabled until the verified local artifact is committed.
