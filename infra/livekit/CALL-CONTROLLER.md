# Audio-first call controller

Status: experimental and not loaded by the PWA.

`js/livekit-call-controller.js` is the orchestration layer between the call-session lifecycle and the LiveKit media adapter. It does not render UI and it does not replace the existing `js/calls.js` flow.

## Responsibilities

- Lazily loads the pinned same-origin LiveKit SDK through `FarnazLiveKitSdk.load()`.
- Starts or accepts a direct call through `FarnazCallSessions`.
- Creates the LiveKit media adapter with the server-authorized `callSessionId`.
- Keeps the outgoing caller's microphone disabled while the invitation is ringing.
- When the receiver answers, the caller enables the microphone; if acceptance arrives before the caller's room connection finishes, the controller remembers that state and enables the microphone immediately after connection.
- On the receiver, connects the room and requests microphone access from the answer action before changing the session to `active`. This keeps the permission request tied to a user gesture on iOS.
- Disconnects media when a session finishes, is rejected, is missed, or is explicitly ended.
- Keeps all media and session work outside the message/chat navigation code.

## Public API

```js
const call = window.FarnazCallController.create({
  supabase,
  userId: currentUser.id,
  onEvent(event) {
    // event.type examples:
    // session-incoming, session-outgoing, session-accepted,
    // session-finished, media-connected, media-reconnecting,
    // media-error, media-ready, error
  }
});

await call.watchIncoming();
await call.start({ peerId: contactUserId, callType: "audio" });

// Incoming call actions:
await call.answer();
await call.reject();

// Either participant:
await call.end();

// UI controls:
await call.setMicrophoneEnabled(false);
await call.startAudioPlayback();

// Dispose on sign-out after call cleanup:
await call.close();
```

## Audio-first call sequence

Outgoing caller:
1. Create a `ringing` session.
2. Load the local SDK only after the user starts the call.
3. Join the server-derived room with microphone and camera publication disabled.
4. Wait for the receiver to accept.
5. Enable the microphone only after the session changes to `active`.

Receiver:
1. Receive/recover the ringing invitation.
2. On the explicit answer action, load the local SDK and connect with microphone publication enabled.
3. Change the session to `active`.
4. The caller receives the status update and enables their microphone.

If the receiver accepts while the caller is still connecting, the controller preserves the acceptance state and enables the microphone as soon as the caller's room is ready. If media setup fails, the controller attempts to end the invitation and releases the local media room.

## Current boundary

The controller, session manager, and media adapter are all separate source modules with isolated automated tests. None is loaded by `index.html`; the existing call UI and `window.startCall` path are unchanged. The local SDK executable bundle is still pending independent npm registry integrity verification, so the controller cannot yet be exercised against a real LiveKit server.

Do not merge or enable this controller until the local SDK artifact, deployed token function, LiveKit host, TURN fallback, iOS Safari behavior, and two-device audio tests are verified.
