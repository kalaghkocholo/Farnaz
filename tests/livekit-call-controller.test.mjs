import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync("js/livekit-call-controller.js", "utf8");
const callSession = {
  id: "c12f3456-7890-4123-8123-123456789abc",
  caller_id: "a12f3456-7890-4123-8123-123456789abc",
  receiver_id: "b12f3456-7890-4123-8123-123456789abc",
  call_type: "audio",
  status: "ringing"
};

function setup({ role = "caller", acceptedDuringConnect = false } = {}) {
  const context = { console, Promise, setTimeout, clearTimeout };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "js/livekit-call-controller.js" });

  let sessionEvent = null;
  let managerState = {
    role,
    status: "ringing",
    session: { ...callSession }
  };
  const order = [];
  const mediaOptions = [];
  const mediaInstances = [];

  const sessionManager = {
    async start() {
      order.push("session-start");
      return { ...callSession };
    },
    async watchIncoming() { order.push("watch-incoming"); return true; },
    async answer() {
      order.push("session-answer");
      managerState = { ...managerState, status: "active", session: { ...managerState.session, status: "active" } };
      sessionEvent({ type: "accepted", role: "receiver", session: managerState.session });
      return managerState.session;
    },
    async reject() {
      order.push("session-reject");
      managerState = { status: "idle", role: null, session: null };
      sessionEvent({ type: "finished", status: "rejected", session: callSession, role: "receiver" });
    },
    async end() {
      order.push("session-end");
      const previous = managerState;
      managerState = { status: "idle", role: null, session: null };
      sessionEvent({ type: "finished", status: "ended", session: previous.session, role: previous.role });
    },
    async close() { order.push("session-close"); managerState = { status: "idle", role: null, session: null }; },
    getState() { return { ...managerState }; }
  };

  const controller = context.FarnazCallController.create({
    supabase: {},
    userId: callSession.caller_id,
    loadSdk: async () => ({ Room: function FakeRoom() {} }),
    sessionFactory: options => { sessionEvent = options.onEvent; return sessionManager; },
    mediaFactory: options => {
      mediaOptions.push(options);
      const state = { connected: false, microphoneEnabled: false, cameraEnabled: false, disposed: false };
      const instance = {
        async connect() {
          order.push("media-connect");
          if (acceptedDuringConnect) {
            sessionEvent({ type: "accepted", role: "caller", session: callSession });
          }
          state.connected = true;
          state.microphoneEnabled = Boolean(options.publishMicrophoneOnConnect);
          state.cameraEnabled = Boolean(options.publishCameraOnConnect);
        },
        async setMicrophoneEnabled(enabled) {
          order.push("microphone-" + enabled);
          state.microphoneEnabled = Boolean(enabled);
        },
        async setCameraEnabled(enabled) { state.cameraEnabled = Boolean(enabled); },
        async startAudioPlayback() { return true; },
        async disconnect() { order.push("media-disconnect"); state.connected = false; state.disposed = true; },
        getState() { return { ...state }; }
      };
      mediaInstances.push(instance);
      return instance;
    }
  });

  return { controller, sessionManager, mediaOptions, mediaInstances, order, fire: event => sessionEvent(event) };
}

test("outgoing caller joins silently and publishes microphone only after acceptance", async () => {
  const h = setup({ role: "caller", acceptedDuringConnect: true });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "audio" });

  assert.equal(h.mediaOptions[0].publishMicrophoneOnConnect, false);
  assert.equal(h.mediaInstances[0].getState().connected, true);
  assert.equal(h.mediaInstances[0].getState().microphoneEnabled, true);
  assert.ok(h.order.indexOf("media-connect") < h.order.indexOf("microphone-true"));
  assert.equal(h.controller.getState().status, "ringing");
  await h.controller.close();
});

test("receiver connects microphone from answer action before changing session to active", async () => {
  const h = setup({ role: "receiver" });
  await h.controller.answer();

  assert.equal(h.mediaOptions[0].publishMicrophoneOnConnect, true);
  assert.equal(h.mediaInstances[0].getState().microphoneEnabled, true);
  assert.ok(h.order.indexOf("media-connect") < h.order.indexOf("session-answer"));
  assert.equal(h.controller.getState().status, "active");
  await h.controller.close();
});

test("remote call completion releases the local media room", async () => {
  const h = setup({ role: "caller" });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "audio" });
  h.fire({ type: "finished", status: "ended", session: callSession, role: "caller" });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(h.mediaInstances[0].getState().connected, false);
  assert.equal(h.mediaInstances[0].getState().disposed, true);
  await h.controller.close();
});

test("explicit end closes media and session lifecycle", async () => {
  const h = setup({ role: "caller" });
  await h.controller.start({ peerId: callSession.receiver_id, callType: "audio" });
  await h.controller.end();

  assert.equal(h.mediaInstances[0].getState().connected, false);
  assert.ok(h.order.includes("session-end"));
  assert.ok(h.order.includes("media-disconnect"));
  await h.controller.close();
});
