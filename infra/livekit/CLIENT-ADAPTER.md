# Isolated LiveKit client adapter

File: `js/livekit-calls.js`

## Purpose

This adapter is intentionally separate from `js/calls.js`. It does not change or replace the current private WebRTC call flow and is not loaded by the app startup sequence yet.

It expects:
- the existing authenticated Supabase client;
- the existing `livekit-token` Edge Function;
- the pinned LiveKit JavaScript client SDK version 2.23.0, served from a same-origin local asset;
- a user-initiated action to call `connect()`, so iOS Safari can show microphone/camera permission prompts.

The adapter does not download third-party scripts automatically. This avoids adding a new CDN dependency to every Farnaz startup and avoids silently depending on CDN reachability in restrictive networks. The lazy loader is implemented in `js/livekit-sdk-loader.js` and only requests `./vendor/livekit/livekit-client-2.23.0.umd.js` after an explicit call to `FarnazLiveKitSdk.load()`. It is not included in the startup sequence. The Apache-2.0 license notice is committed under `vendor/livekit/LICENSE`. The executable vendor bundle is deliberately not committed yet: its exact package bytes, registry integrity, SHA-256, and deployed size must be verified first. Do not enable the feature until that asset is present and tested.

## Example integration contract

```js
const session = window.FarnazLiveKitCalls.create({
  supabase: getClient(),
  spaceId: selectedGroupId,
  callType: "audio", // or "video"
  onEvent(event) {
    // Connect these events to a dedicated call UI only after UI review.
    console.log("call event", event.type);
  }
});

await session.connect(); // call from a user tap/click handler
// Optional controls:
await session.setMicrophoneEnabled(false);
await session.setCameraEnabled(false); // video sessions only
await session.startAudioPlayback(); // if Safari requires a user gesture
await session.disconnect();
```

Do not call this from the existing call buttons yet. The adapter is not active in `index.html` and does not render a UI.

## Current capabilities

- Authenticates through the current Supabase session and calls `livekit-token`.
- Never stores participant tokens in local storage or IndexedDB.
- Joins only the server-authorized room returned by the token endpoint.
- Enables adaptive stream and dynacast.
- Exposes track, participant, reconnect, audio-playback and device-error events.
- Explicitly disconnects and releases room media on teardown.

## Remaining work before activation

1. Add the verified `livekit-client@2.23.0` UMD bundle at the loader's exact same-origin path; preserve the Apache-2.0 license notice and record SHA-256 plus byte size.
2. Run the adapter and lazy-loader unit tests with mocked SDK and token function.
3. Add a separate experimental group-call UI behind a feature flag.
4. Deploy the Edge Function to a non-production configuration and configure server-only LiveKit secrets.
5. Run tests on iOS Safari/PWA, desktop, two devices, weak bandwidth and real target networks.
6. Only then consider enabling the group-call controls. The existing one-to-one path stays intact until separately tested.


## SDK pin and loader status

- Upstream package: [`livekit-client`](https://www.npmjs.com/package/livekit-client), exact version `2.23.0` (Apache-2.0).
- Browser bundle format: UMD; upstream documentation states it exposes `LivekitClient` globally.
- Loader: `js/livekit-sdk-loader.js`; explicit lazy load only, same-origin relative path, no CDN fallback, request de-duplication, bounded timeout, API-shape validation.
- Required asset path: `vendor/livekit/livekit-client-2.23.0.umd.js`.
- Asset status: **not yet vendored**. No external SDK is loaded and no call UI uses the loader.
- Before committing the bundle, verify its SHA-256 against the official package artifact, retain the Apache-2.0 license text, measure compressed/uncompressed size, and test service-worker offline caching.
