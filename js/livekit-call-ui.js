(function (root) {
  "use strict";

  let controller = null;
  let signedInUserId = null;
  let activeSession = null;
  let activeRole = null;
  let callType = "audio";
  let startedAt = 0;
  let timerId = null;
  let microphoneEnabled = true;
  let cameraEnabled = true;
  let remoteVideoTrack = null;
  let remoteAudioTracks = new Set();
  const byId = id => root.document.getElementById(id);
  const tr = (fa, en) => typeof english !== "undefined" && english ? en : fa;

  function ensureDialog() {
    let dialog = byId("farnazLiveKitDialog");
    if (dialog) return dialog;
    dialog = root.document.createElement("section");
    dialog.id = "farnazLiveKitDialog";
    dialog.className = "farnaz-livekit-dialog";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "farnazLiveKitTitle");
    dialog.innerHTML =
      '<div class="farnaz-livekit-card">' +
        '<div class="farnaz-livekit-topbar">' +
          '<span class="farnaz-livekit-brand">FARNAZ</span>' +
          '<button type="button" class="farnaz-livekit-close" id="farnazLiveKitClose" aria-label="بستن تماس">×</button>' +
        '</div>' +
        '<div class="farnaz-livekit-identity">' +
          '<div class="farnaz-livekit-avatar" id="farnazLiveKitAvatar" aria-hidden="true">' +
            '<span class="farnaz-livekit-avatar-fallback">F</span>' +
            '<img id="farnazLiveKitAvatarImage" alt="" hidden>' +
          '</div>' +
          '<h2 id="farnazLiveKitTitle">تماس فرناز</h2>' +
          '<p id="farnazLiveKitStatus" role="status" aria-live="polite">در حال آماده‌سازی…</p>' +
          '<time id="farnazLiveKitTimer" hidden>00:00</time>' +
        '</div>' +
        '<div class="farnaz-livekit-media" id="farnazLiveKitMedia">' +
          '<video id="farnazLiveKitRemoteVideo" autoplay playsinline hidden></video>' +
          '<div id="farnazLiveKitRemoteAudio"></div>' +
        '</div>' +
        '<div class="farnaz-livekit-actions">' +
          '<button type="button" id="farnazLiveKitMute" class="farnaz-livekit-control" aria-label="بی‌صدا" hidden><span class="farnaz-livekit-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"></path></svg></span><span class="farnaz-livekit-control-label">بی‌صدا</span></button>' +
          '<button type="button" id="farnazLiveKitSpeaker" class="farnaz-livekit-control" aria-label="فعال‌سازی صدا" hidden><span class="farnaz-livekit-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"></path><path d="M17 9a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12"></path></svg></span><span class="farnaz-livekit-control-label">صدا</span></button>' +
          '<button type="button" id="farnazLiveKitAudioRoute" class="farnaz-livekit-control" aria-label="بلندگو" hidden><span class="farnaz-livekit-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l8 5V5l-8 5H4Z"></path><path d="M19 9a5 5 0 0 1 0 6"></path></svg></span><span class="farnaz-livekit-control-label">بلندگو</span></button>' +
          '<button type="button" id="farnazLiveKitCamera" class="farnaz-livekit-control" aria-label="دوربین خاموش" hidden><span class="farnaz-livekit-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"></rect><path d="m16 10 5-3v10l-5-3"></path></svg></span><span class="farnaz-livekit-control-label">دوربین</span></button>' +
          '<button type="button" id="farnazLiveKitReject" class="farnaz-livekit-control is-danger" aria-label="رد تماس" hidden><span class="farnaz-livekit-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"></path></svg></span><span class="farnaz-livekit-control-label">رد تماس</span></button>' +
          '<button type="button" id="farnazLiveKitAccept" class="farnaz-livekit-control is-accept" aria-label="پاسخ به تماس" hidden><span class="farnaz-livekit-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.7a14 14 0 0 0 4.8 4.8L15 13l5 2v4c0 1.1-.9 2-2 2C9.2 21 3 14.8 3 6c0-1.1.9-2 2-2Z"></path></svg></span><span class="farnaz-livekit-control-label">پاسخ</span></button>' +
          '<button type="button" id="farnazLiveKitEnd" class="farnaz-livekit-control is-danger" aria-label="پایان تماس" hidden><span class="farnaz-livekit-control-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.7a14 14 0 0 0 4.8 4.8L15 13l5 2v4c0 1.1-.9 2-2 2C9.2 21 3 14.8 3 6c0-1.1.9-2 2-2Z"></path></svg></span><span class="farnaz-livekit-control-label">پایان</span></button>' +
        '</div>' +
      '</div>';
    root.document.body.appendChild(dialog);
    byId("farnazLiveKitClose").addEventListener("click", end);
    byId("farnazLiveKitAccept").addEventListener("click", answer);
    byId("farnazLiveKitReject").addEventListener("click", reject);
    byId("farnazLiveKitEnd").addEventListener("click", end);
    byId("farnazLiveKitMute").addEventListener("click", toggleMicrophone);
    byId("farnazLiveKitSpeaker").addEventListener("click", unlockAudio);
    byId("farnazLiveKitAudioRoute").addEventListener("click", toggleAudioRoute);
    byId("farnazLiveKitCamera").addEventListener("click", toggleCamera);
    return dialog;
  }

  function setStatus(message) {
    const node = byId("farnazLiveKitStatus");
    if (node) node.textContent = message;
  }

  function setAvatar(url, name) {
    const avatar = byId("farnazLiveKitAvatar");
    if (!avatar) return;
    const image = byId("farnazLiveKitAvatarImage");
    const fallback = avatar.querySelector(".farnaz-livekit-avatar-fallback");
    const label = String(name || "F").trim();
    if (fallback) fallback.textContent = label.charAt(0).toLocaleUpperCase() || "F";
    if (!image) return;
    image.hidden = true;
    image.removeAttribute("src");
    image.alt = label;
    if (!url || typeof url !== "string") {
      if (fallback) fallback.hidden = false;
      return;
    }
    image.onload = function () {
      image.hidden = false;
      if (fallback) fallback.hidden = true;
    };
    image.onerror = function () {
      image.hidden = true;
      image.removeAttribute("src");
      if (fallback) fallback.hidden = false;
    };
    image.src = url;
  }

  function setControlLabel(id, label) {
    const button = byId(id);
    if (!button) return;
    const text = button.querySelector(".farnaz-livekit-control-label");
    if (text) text.textContent = label;
    button.setAttribute("aria-label", label);
  }

  function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function stopTimer() {
    if (timerId) root.clearInterval(timerId);
    timerId = null;
    startedAt = 0;
    const node = byId("farnazLiveKitTimer");
    if (node) { node.hidden = true; node.textContent = "00:00"; }
  }

  function startTimer() {
    stopTimer();
    startedAt = Date.now();
    const node = byId("farnazLiveKitTimer");
    if (node) node.hidden = false;
    timerId = root.setInterval(function () {
      if (node) node.textContent = formatDuration(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
  }

  function resetMedia() {
    if (remoteVideoTrack) {
      try { remoteVideoTrack.detach(); } catch (_) {}
      remoteVideoTrack = null;
    }
    remoteAudioTracks.forEach(track => { try { track.detach(); } catch (_) {} });
    remoteAudioTracks.clear();
    const video = byId("farnazLiveKitRemoteVideo");
    if (video) { video.pause(); video.srcObject = null; video.hidden = true; }
    const dialog = byId("farnazLiveKitDialog");
    if (dialog) dialog.classList.remove("has-remote-video");
    const audio = byId("farnazLiveKitRemoteAudio");
    if (audio) audio.replaceChildren();
  }

  function show(title, status, incoming, avatarUrl) {
    ensureDialog();
    byId("farnazLiveKitTitle").textContent = title;
    const contactAvatar = avatarUrl || (activeRole === "caller" && typeof currentChatUser !== "undefined" && currentChatUser ? currentChatUser.avatar_url : "");
    setAvatar(contactAvatar, title);
    byId("farnazLiveKitDialog").dataset.callType = callType;
    byId("farnazLiveKitDialog").classList.toggle("is-incoming", Boolean(incoming));
    byId("farnazLiveKitDialog").classList.toggle("is-video-call", callType === "video");
    byId("farnazLiveKitDialog").classList.remove("has-remote-video");
    setStatus(status);
    microphoneEnabled = true;
    cameraEnabled = true;
    setControlLabel("farnazLiveKitMute", tr("بی‌صدا", "Mute"));
    setControlLabel("farnazLiveKitCamera", tr("دوربین خاموش", "Turn camera off"));
    byId("farnazLiveKitDialog").hidden = false;
    byId("farnazLiveKitAccept").hidden = !incoming;
    byId("farnazLiveKitReject").hidden = !incoming;
    byId("farnazLiveKitMute").hidden = true;
    byId("farnazLiveKitSpeaker").hidden = true;
    byId("farnazLiveKitAudioRoute").hidden = true;
    byId("farnazLiveKitCamera").hidden = true;
    byId("farnazLiveKitEnd").hidden = incoming;
    stopTimer();
    resetMedia();
  }

  function titleFor(session) {
    if (activeRole === "caller") {
      return typeof currentChatUser !== "undefined" && currentChatUser
        ? (currentChatUser.display_name || currentChatUser.name || tr("مخاطب فرناز", "Farnaz contact"))
        : tr("تماس فرناز", "Farnaz call");
    }
    return tr("تماس ورودی", "Incoming call");
  }

  async function showIncoming(event) {
    const session = event && event.session;
    if (!session) return;
    activeSession = session;
    activeRole = "receiver";
    callType = session.call_type === "video" ? "video" : "audio";
    const title = callType === "video" ? tr("تماس تصویری ورودی", "Incoming video call") : tr("تماس صوتی ورودی", "Incoming audio call");
    show(title, tr("تماس ورودی…", "Incoming call…"), true);
    try {
      const result = await getClient().rpc("get_farnaz_user_profile", { search_user_id: session.caller_id });
      const profile = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!activeSession || String(activeSession.id) !== String(session.id)) return;
      if (profile) {
        const callerName = profile.display_name || title;
        byId("farnazLiveKitTitle").textContent = callerName;
        setAvatar(profile.avatar_url || "", callerName);
        setStatus(tr("تماس ورودی از طرف ", "Incoming call from ") + callerName);
      }
    } catch (error) {
      console.warn("[Farnaz LiveKit UI] Caller profile lookup failed:", error);
    }
  }

  function onControllerEvent(event) {
    if (!event) return;
    const detail = event.detail || {};
    if (event.type === "session-incoming") {
      showIncoming(detail).catch(error => setStatus(error.message));
    } else if (event.type === "session-outgoing") {
      activeSession = detail.session || null;
      activeRole = "caller";
      callType = activeSession && activeSession.call_type === "video" ? "video" : "audio";
      show(titleFor(activeSession), tr("در انتظار پاسخ…", "Waiting for answer…"), false);
    } else if (event.type === "session-accepted") {
      activeSession = detail.session || activeSession;
      activeRole = detail.role || activeRole;
      setStatus(tr("تماس برقرار است", "Call connected"));
      byId("farnazLiveKitMute").hidden = false;
      byId("farnazLiveKitSpeaker").hidden = false;
      byId("farnazLiveKitAudioRoute").hidden = false;
      byId("farnazLiveKitCamera").hidden = callType !== "video";
      byId("farnazLiveKitEnd").hidden = false;
      setControlLabel("farnazLiveKitMute", tr("بی‌صدا", "Mute"));
      setControlLabel("farnazLiveKitCamera", tr("دوربین خاموش", "Turn camera off"));
      startTimer();
    } else if (event.type === "session-finished") {
      activeSession = null;
      activeRole = null;
      stopTimer();
      resetMedia();
      setStatus(tr("تماس پایان یافت", "Call ended"));
      const dialog = byId("farnazLiveKitDialog");
      if (dialog) root.setTimeout(() => { if (!activeSession) dialog.hidden = true; }, 900);
    } else if (event.type === "media-track-subscribed") {
      const track = detail.track;
      if (!track || typeof track.attach !== "function") return;
      if (track.kind === "video") {
        const video = byId("farnazLiveKitRemoteVideo");
        if (remoteVideoTrack && remoteVideoTrack !== track) {
          try { remoteVideoTrack.detach(); } catch (_) {}
        }
        remoteVideoTrack = track;
        track.attach(video);
        video.hidden = false;
        byId("farnazLiveKitDialog").classList.add("has-remote-video");
        video.play().catch(() => {});
      } else if (track.kind === "audio") {
        const audio = root.document.createElement("audio");
        audio.autoplay = true;
        audio.playsInline = true;
        byId("farnazLiveKitRemoteAudio").appendChild(audio);
        track.attach(audio);
        remoteAudioTracks.add(track);
        audio.play().catch(() => setStatus(tr("برای شنیدن صدا، «فعال‌سازی صدا» را بزن.", "Tap Enable audio to hear the call.")));
      }
    } else if (event.type === "media-track-unsubscribed") {
      const track = detail.track;
      if (track && typeof track.detach === "function") {
        try { track.detach(); } catch (_) {}
        remoteAudioTracks.delete(track);
        if (remoteVideoTrack === track) {
          remoteVideoTrack = null;
          const dialog = byId("farnazLiveKitDialog");
          if (dialog) dialog.classList.remove("has-remote-video");
        }
      }
    } else if (event.type === "error" || event.type === "media-error") {
      const error = detail.error || detail;
      setStatus(tr("خطا: ", "Call error: ") + String(error && error.message || error));
    } else if (event.type === "media-reconnecting") {
      setStatus(tr("ارتباط ناپایدار است؛ در حال اتصال مجدد…", "Connection interrupted; reconnecting…"));
    } else if (event.type === "media-reconnected") {
      setStatus(tr("ارتباط دوباره برقرار شد", "Connection restored"));
    }
  }

  async function setUser(userId) {
    const next = userId ? String(userId) : null;
    if (next === signedInUserId && controller) return;
    const previous = controller;
    controller = null;
    signedInUserId = next;
    activeSession = null;
    activeRole = null;
    stopTimer();
    resetMedia();
    if (previous) await previous.close();
    const dialog = byId("farnazLiveKitDialog");
    if (!next && dialog) dialog.hidden = true;
    if (!next) return;
    controller = root.FarnazCallController.create({
      supabase: getClient(),
      userId: next,
      onEvent: onControllerEvent
    });
    await controller.watchIncoming();
  }

  async function start(type) {
    if (!signedInUserId || !currentUser) throw new Error(tr("ابتدا وارد حساب شو.", "Sign in before calling."));
    if (typeof currentChatUser === "undefined" || !currentChatUser || !currentChatUser.user_id) {
      throw new Error(tr("تماس فقط از گفت‌وگوی خصوصی پشتیبانی می‌شود.", "Calls can only be started from a private chat."));
    }
    if (!controller) await setUser(signedInUserId);
    if (activeSession) throw new Error(tr("یک تماس در حال اجراست.", "A call is already active."));
    const peerId = String(currentChatUser.user_id);
    if (peerId === signedInUserId) throw new Error(tr("امکان تماس با خودت وجود ندارد.", "You cannot call yourself."));
    const blocked = await getClient().from("blocked_contacts")
      .select("blocked_user_id").eq("blocker_id", signedInUserId).eq("blocked_user_id", peerId).maybeSingle();
    if (blocked.error) throw blocked.error;
    if (blocked.data) throw new Error(tr("این مخاطب را مسدود کرده‌ای.", "This contact is blocked."));
    callType = type === "video" ? "video" : "audio";
    show(callType === "video" ? tr("تماس تصویری", "Video call") : tr("تماس صوتی", "Audio call"),
      tr("در حال شروع تماس…", "Starting call…"), false);
    try {
      await controller.start({ peerId: peerId, callType: callType });
    } catch (error) {
      activeSession = null;
      setStatus(tr("تماس شروع نشد: ", "Call could not start: ") + error.message);
      throw error;
    }
  }

  async function answer() {
    if (!controller || !activeSession) return;
    byId("farnazLiveKitAccept").disabled = true;
    try {
      byId("farnazLiveKitAccept").hidden = true;
      byId("farnazLiveKitReject").hidden = true;
      byId("farnazLiveKitMute").hidden = false;
      byId("farnazLiveKitSpeaker").hidden = false;
      byId("farnazLiveKitCamera").hidden = callType !== "video";
      byId("farnazLiveKitEnd").hidden = false;
      microphoneEnabled = true;
      cameraEnabled = true;
      setControlLabel("farnazLiveKitMute", tr("بی‌صدا", "Mute"));
      setControlLabel("farnazLiveKitCamera", tr("دوربین خاموش", "Turn camera off"));
      setStatus(tr("در حال اتصال…", "Connecting…"));
      await controller.answer();
    } catch (error) {
      setStatus(tr("پاسخ به تماس ناموفق بود: ", "Could not answer: ") + error.message);
    } finally {
      byId("farnazLiveKitAccept").disabled = false;
    }
  }

  async function reject() {
    if (!controller) return;
    try { await controller.reject(); }
    catch (error) { setStatus(tr("رد تماس ناموفق بود: ", "Could not decline: ") + error.message); }
  }

  async function end() {
    if (!controller || !activeSession) {
      const dialog = byId("farnazLiveKitDialog");
      if (dialog) dialog.hidden = true;
      return;
    }
    setStatus(tr("در حال پایان تماس…", "Ending call…"));
    try { await controller.end(); }
    catch (error) { setStatus(tr("پایان تماس ناموفق بود: ", "Could not end call: ") + error.message); }
  }

  async function toggleMicrophone() {
    if (!controller) return;
    try {
      microphoneEnabled = !microphoneEnabled;
      await controller.setMicrophoneEnabled(microphoneEnabled);
      setControlLabel("farnazLiveKitMute", microphoneEnabled ? tr("بی‌صدا", "Mute") : tr("فعال‌کردن میکروفن", "Unmute"));
    } catch (error) {
      microphoneEnabled = !microphoneEnabled;
      setStatus(error.message);
    }
  }

  async function toggleCamera() {
    if (!controller || callType !== "video") return;
    try {
      cameraEnabled = !cameraEnabled;
      await controller.setCameraEnabled(cameraEnabled);
      setControlLabel("farnazLiveKitCamera", cameraEnabled ? tr("دوربین خاموش", "Turn camera off") : tr("روشن‌کردن دوربین", "Turn camera on"));
    } catch (error) {
      cameraEnabled = !cameraEnabled;
      setStatus(error.message);
    }
  }

  async function unlockAudio() {
    if (!controller) return;
    try {
      const ready = await controller.startAudioPlayback();
      setStatus(ready ? tr("صدای تماس فعال است", "Call audio is enabled") : tr("مرورگر هنوز پخش صدا را مسدود کرده است.", "The browser is still blocking audio playback."));
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleAudioRoute() {
    const container = byId("farnazLiveKitRemoteAudio");
    const audioElements = container ? Array.from(container.querySelectorAll("audio")) : [];
    if (!audioElements.length) {
      setStatus(tr("هنوز صدای طرف مقابل دریافت نشده است.", "Remote audio is not available yet."));
      return;
    }
    if (typeof audioElements[0].setSinkId !== "function") {
      setStatus(tr("در آیفون، انتخاب بلندگو و هدفون از کنترل صدای خود گوشی انجام می‌شود.", "On iPhone, choose speaker or headphones from the system audio controls."));
      return;
    }
    try {
      const mediaDevices = root.navigator && root.navigator.mediaDevices;
      if (!mediaDevices || typeof mediaDevices.enumerateDevices !== "function") {
        throw new Error(tr("انتخاب خروجی صدا در این مرورگر پشتیبانی نمی‌شود.", "Audio output selection is not supported by this browser."));
      }
      const outputs = (await mediaDevices.enumerateDevices()).filter(device => device.kind === "audiooutput");
      if (!outputs.length) throw new Error(tr("خروجی صدایی پیدا نشد.", "No audio output devices were found."));
      const currentId = audioElements[0].sinkId || "default";
      const currentIndex = outputs.findIndex(device => device.deviceId === currentId);
      const next = outputs[(currentIndex + 1 + outputs.length) % outputs.length];
      await Promise.all(audioElements.map(audio => audio.setSinkId(next.deviceId)));
      const label = next.label || tr("خروجی صدا تغییر کرد", "Audio output changed");
      setControlLabel("farnazLiveKitAudioRoute", label.length > 22 ? label.slice(0, 22) + "…" : label);
      setStatus(tr("خروجی صدا: ", "Audio output: ") + label);
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error));
    }
  }

  root.FarnazLiveKitCallUI = Object.freeze({ setUser: setUser, start: start, toggleAudioRoute: toggleAudioRoute });
})(typeof window !== "undefined" ? window : globalThis);
