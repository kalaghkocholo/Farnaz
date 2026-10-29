# Isolated LiveKit client adapter

File: `js/livekit-calls.js`

## Purpose

This adapter is intentionally separate from `js/calls.js`. It does not change or replace the current private WebRTC call flow and is not loaded by the app startup sequence yet.

It expects:
- the existing authenticated Supabase client;
- the existing `livekit-token` Edge Function;
- the pinned LiveKit JavaScript client SDK (documented upstream as version 2.21.0);
- a user-initiated action to call `connect()`, so iOS Safari can show microphone/camera permission prompts.

The adapter does not download third-party scripts automatically. This avoids adding a new CDN dependency to every Farnaz startup and avoids silently depending on CDN reachability in restrictive networks. Before enabling the feature, vendor the pinned SDK bundle as a same-origin asset and verify its license, integrity hash, file size, and offline/PWA caching behavior.

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

1. Vendor and pin the browser SDK locally; record its upstream release and license.
2. Run adapter unit tests with a mocked SDK and token function.
3. Add a separate experimental group-call UI behind a feature flag.
4. Deploy the Edge Function to a non-production configuration and configure server-only LiveKit secrets.
5. Run tests on iOS Safari/PWA, desktop, two devices, weak bandwidth and real target networks.
6. Only then consider enabling the group-call controls. The existing one-to-one path stays intact until separately tested.
