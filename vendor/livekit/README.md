# Vendored LiveKit browser SDK

This directory contains the license notice for the upstream LiveKit JavaScript client.

- Package: `livekit-client`
- Pinned version: `2.23.0`
- Upstream source: https://github.com/livekit/client-sdk-js/tree/v2.23.0
- Package registry: https://www.npmjs.com/package/livekit-client/v/2.23.0
- License: Apache-2.0 (see [LICENSE](./LICENSE))
- Expected browser artifact: `livekit-client-2.23.0.umd.js`
- Expected loader path: `vendor/livekit/livekit-client-2.23.0.umd.js`

## Artifact inspection record

On 2026-10-30, the package tarball was obtained from the versioned npm registry URL:

`https://registry.npmjs.org/livekit-client/-/livekit-client-2.23.0.tgz`

Inspection confirmed:
- Package metadata name/version: `livekit-client@2.23.0`
- Package metadata license: `Apache-2.0`
- Exact artifact path in tarball: `package/dist/livekit-client.umd.js`
- Extracted artifact size: `610302` bytes
- Extracted artifact SHA-256: `fb646f2260d84f91238d0a2dc10726c456631d6a26c7cafc43cfee5959b4d31d`
- Tarball size: `2992351` bytes
- Locally computed tarball SRI: `sha512-j9Kg86nJjBjNFUD+ukp2jwMCGa0k+YD5gU//RzAM+ZY3pbG631QCte7fQjwqWMmtBzhDJL9nKYuOLMv/9IbAxg==`
- Extracted artifact is byte-for-byte identical to the supplied tarball member.
- `node --check` passes for the extracted UMD artifact.

**Registry integrity comparison is still pending.** The locally computed SRI above has not yet been independently compared with npm's published `dist.integrity` metadata. The executable bundle is therefore intentionally **not committed** yet. Do not create a placeholder or copy a runtime CDN response into this repository.

Before adding the bundle:
1. Compare the tarball SRI above with the registry's published integrity metadata for exactly version `2.23.0`.
2. Commit only the exact UMD artifact from the verified tarball; preserve the Apache-2.0 license.
3. Record the confirmed registry integrity, bundle SHA-256, exact byte size, source URL, and retrieval date.
4. Run the loader tests and a browser smoke test on iOS Safari and desktop browsers.
5. Confirm the service worker caches this optional asset without putting it on the critical app-startup path.

No CDN fallback is permitted. The feature remains disabled until the verified local artifact is committed.
