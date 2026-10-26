(function(){
"use strict";
let signedInUserId=null,inboxChannel=null,activeCall=null,userSwitchSequence=0;
const processedSignals=new Set(),pendingIncomingSessions=new Set();
const byId=id=>document.getElementById(id);
const tr=(fa,en)=>typeof english!=="undefined"&&english?en:fa;

function ensureDialog(){
  let dialog=byId("farnazCallDialog");
  if(dialog)return dialog;
  dialog=document.createElement("section");
  dialog.id="farnazCallDialog";dialog.className="farnaz-call-dialog";dialog.hidden=true;
  dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
  dialog.setAttribute("aria-labelledby","farnazCallTitle");
  dialog.innerHTML='<div class="farnaz-call-card"><div class="farnaz-call-top"><strong id="farnazCallTitle">تماس فرناز</strong><button type="button" id="farnazCallClose" aria-label="بستن پنجره تماس">×</button></div><p id="farnazCallStatus" role="status" aria-live="polite"></p><div class="farnaz-call-media"><video id="farnazLocalVideo" autoplay muted playsinline hidden></video><video id="farnazRemoteVideo" autoplay playsinline hidden></video><audio id="farnazRemoteAudio" autoplay playsinline></audio></div><div class="farnaz-call-actions"><button type="button" id="farnazCallAccept" class="farnaz-call-accept" hidden>پاسخ</button><button type="button" id="farnazCallReject" class="farnaz-call-reject" hidden>رد تماس</button><button type="button" id="farnazCallHangup" class="farnaz-call-reject" hidden>پایان تماس</button></div></div>';
  document.body.appendChild(dialog);
  byId("farnazCallClose").onclick=()=>{if(activeCall)endCall(true);else dialog.hidden=true;};
  byId("farnazCallAccept").onclick=acceptIncoming;
  byId("farnazCallReject").onclick=rejectIncoming;
  byId("farnazCallHangup").onclick=()=>endCall(true);
  return dialog;
}
function setCallStatus(text){const p=byId("farnazCallStatus");if(p)p.textContent=text;}
function showDialog(title,status){
  const d=ensureDialog();byId("farnazCallTitle").textContent=title;setCallStatus(status);d.hidden=false;
  byId("farnazCallAccept").hidden=true;byId("farnazCallReject").hidden=true;byId("farnazCallHangup").hidden=true;
  byId("farnazLocalVideo").hidden=true;byId("farnazRemoteVideo").hidden=true;
}
async function notifyBackground(title,body,tag){
  if(!("Notification" in window)||Notification.permission!=="granted")return;
  try{
    const reg=await navigator.serviceWorker?.ready;
    if(reg)await reg.showNotification(title,{body,tag,icon:"./farnaz-icon.svg",badge:"./farnaz-icon.svg",data:{url:"./"}});
    else new Notification(title,{body,tag});
  }catch(e){console.warn("Notification unavailable:",e);}
}
function otherId(session){return String(session.caller_id)===String(signedInUserId)?session.receiver_id:session.caller_id;}
async function subscribeSignalChannel(session){
  const client=getClient();
  const ch=client.channel("farnaz-call-signals-"+session.id);
  activeCall.signalChannel=ch;
  ch.on("postgres_changes",{event:"INSERT",schema:"public",table:"call_signals",filter:"call_id=eq."+session.id},payload=>{
    const signal=payload.new;
    if(signal&&String(signal.target_id)===String(signedInUserId))handleSignal(signal).catch(e=>{console.error(e);setCallStatus(tr("خطا در برقراری تماس: ","Call signaling failed: ")+e.message);});
  });
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Call signaling connection timed out.")),12000);
    ch.subscribe(status=>{
      if(status==="SUBSCRIBED"){clearTimeout(timer);resolve();}
      else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){clearTimeout(timer);reject(new Error("Call signaling channel could not connect."));}
    });
  });
}
async function sendSignal(type,payload=null){
  if(!activeCall||!signedInUserId)throw new Error("No active call.");
  const {error}=await getClient().from("call_signals").insert({
    call_id:activeCall.session.id,sender_id:signedInUserId,target_id:activeCall.otherId,signal_type:type,payload
  });
  if(error)throw error;
}
async function preparePeer(session,role){
  const call=activeCall;
  if(!call||String(call.session?.id)!==String(session.id))throw new Error("Call is no longer active.");
  const type=session.call_type==="video"?"video":"audio";
  const media=await navigator.mediaDevices.getUserMedia({audio:true,video:type==="video"});
  // The permission prompt can remain open after the caller cancels or signs out.
  // Never attach a late media stream to a different call, and always release it.
  if(activeCall!==call){media.getTracks().forEach(track=>track.stop());throw new Error("Call was cancelled before media became ready.");}
  call.localStream=media;
  call.pendingCandidates=call.pendingCandidates||[];
  const local=byId("farnazLocalVideo");local.srcObject=media;local.hidden=type!=="video";
  const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]});
  call.pc=pc;
  media.getTracks().forEach(track=>pc.addTrack(track,media));
  pc.ontrack=event=>{
    if(activeCall!==call)return;
    const stream=event.streams?.[0];if(!stream)return;
    if(type==="video"){const v=byId("farnazRemoteVideo");v.srcObject=stream;v.muted=true;v.hidden=false;v.play().catch(()=>{});}
    const audio=byId("farnazRemoteAudio");audio.srcObject=stream;audio.play().catch(()=>{});
  };
  pc.onicecandidate=event=>{
    if(event.candidate&&activeCall===call)sendSignal("ice-candidate",event.candidate.toJSON()).catch(e=>console.warn("ICE signal:",e));
  };
  pc.onconnectionstatechange=()=>{
    if(activeCall!==call)return;
    if(pc.connectionState==="connected")setCallStatus(tr("تماس برقرار است","Call connected"));
    else if(pc.connectionState==="connecting")setCallStatus(tr("در حال برقراری ارتباط…","Connecting…"));
    else if(pc.connectionState==="failed")setCallStatus(tr("اتصال مستقیم برقرار نشد؛ احتمالاً شبکه به TURN نیاز دارد.","Direct connection failed; this network may require a TURN server."));
    else if(pc.connectionState==="disconnected")setCallStatus(tr("ارتباط ناپایدار است…","Connection is unstable…"));
  };
  await subscribeSignalChannel(session);
  if(activeCall!==call)throw new Error("Call was cancelled while connecting.");
  if(role==="caller"){
    const offer=await pc.createOffer();
    if(activeCall!==call)throw new Error("Call was cancelled while preparing the offer.");
    await pc.setLocalDescription(offer);
    if(activeCall!==call)throw new Error("Call was cancelled before sending the offer.");
    await sendSignal("offer",{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
    if(activeCall!==call)return;
    setCallStatus(tr("در انتظار پاسخ…","Waiting for answer…"));
  }else{
    const {data,error}=await getClient().from("call_signals").select("id,signal_type,payload,sender_id,target_id").eq("call_id",session.id).eq("target_id",String(signedInUserId)).order("created_at",{ascending:true});
    if(activeCall!==call)return;
    if(error)throw error;
    for(const signal of data||[]){if(activeCall!==call)return;await handleSignal(signal);}
  }
}
async function flushPendingCandidates(call=activeCall){
  const pc=call?.pc;
  if(!pc?.remoteDescription||!call.pendingCandidates?.length)return;
  const queued=call.pendingCandidates.splice(0);
  for(const candidate of queued){
    if(activeCall!==call)return;
    try{await pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(e){console.warn("Queued ICE candidate:",e);}
  }
}
async function handleSignal(signal){
  const call=activeCall;
  if(!call||String(signal.call_id)!==String(call.session.id)||processedSignals.has(signal.id))return;
  processedSignals.add(signal.id);
  if(String(signal.sender_id)===String(signedInUserId))return;
  const pc=call.pc;
  if(signal.signal_type==="offer"&&call.role==="receiver"){
    if(!pc)return;
    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
    if(activeCall!==call)return;
    await flushPendingCandidates(call);
    if(activeCall!==call)return;
    const answer=await pc.createAnswer();
    if(activeCall!==call)return;
    await pc.setLocalDescription(answer);
    if(activeCall!==call)return;
    await sendSignal("answer",{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
    if(activeCall!==call)return;
    const {error}=await getClient().from("call_sessions").update({status:"active"}).eq("id",call.session.id);
    if(activeCall!==call)return;
    if(error)throw error;
    setCallStatus(tr("پاسخ ارسال شد؛ در حال اتصال…","Answer sent; connecting…"));
  }else if(signal.signal_type==="answer"&&call.role==="caller"){
    call.answered=true;
    if(call.timeout){clearTimeout(call.timeout);call.timeout=null;}
    if(pc&&!pc.currentRemoteDescription){
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
      if(activeCall!==call)return;
      await flushPendingCandidates(call);
    }
  }else if(signal.signal_type==="ice-candidate"){
    if(pc&&signal.payload){
      if(pc.remoteDescription){
        if(activeCall!==call)return;
        try{await pc.addIceCandidate(new RTCIceCandidate(signal.payload));}catch(e){console.warn("ICE candidate:",e);}
      }else{call.pendingCandidates=call.pendingCandidates||[];call.pendingCandidates.push(signal.payload);}
    }
  }else if(signal.signal_type==="reject"||signal.signal_type==="hangup"){
    await cleanupCall(false);
    if(activeCall)return;
    setCallStatus(signal.signal_type==="reject"?tr("تماس رد شد","Call declined"):tr("تماس پایان یافت","Call ended"));
    setTimeout(()=>{const d=byId("farnazCallDialog");if(d&&!activeCall)d.hidden=true;},1400);
  }
}
async function acceptIncoming(){
  if(!activeCall||activeCall.role!=="receiver")return;
  byId("farnazCallAccept").disabled=true;
  try{
    byId("farnazCallAccept").hidden=true;byId("farnazCallReject").hidden=true;byId("farnazCallHangup").hidden=false;
    setCallStatus(tr("در حال دسترسی به میکروفن و دوربین…","Requesting microphone and camera…"));
    await preparePeer(activeCall.session,"receiver");
    const {error}=await getClient().from("call_sessions").update({status:"active"}).eq("id",activeCall.session.id);
    if(error)throw error;
  }catch(e){console.error("Accept call:",e);setCallStatus(tr("شروع تماس ناموفق بود: ","Could not start call: ")+e.message);}
  finally{byId("farnazCallAccept").disabled=false;}
}
async function rejectIncoming(){
  if(!activeCall)return;
  try{await sendSignal("reject");await getClient().from("call_sessions").update({status:"rejected"}).eq("id",activeCall.session.id);}catch(e){console.warn(e);}
  await cleanupCall(false);const d=byId("farnazCallDialog");if(d)d.hidden=true;
}
async function cleanupCall(updateStatus){
  const call=activeCall;activeCall=null;
  if(call){if(call.timeout)clearTimeout(call.timeout);
    if(call.signalChannel)try{await getClient().removeChannel(call.signalChannel);}catch(_){}
    if(call.pc){call.pc.ontrack=null;call.pc.onicecandidate=null;call.pc.close();}
    if(call.localStream)call.localStream.getTracks().forEach(t=>t.stop());
    if(updateStatus)try{await getClient().from("call_sessions").update({status:"ended"}).eq("id",call.session.id);}catch(e){console.warn("Call status update:",e);}
  }
  ["farnazLocalVideo","farnazRemoteVideo","farnazRemoteAudio"].forEach(id=>{const el=byId(id);if(el){el.pause?.();el.srcObject=null;el.hidden=true;}});
}
async function endCall(notifyPeer){
  if(!activeCall)return;
  try{if(notifyPeer)await sendSignal("hangup");}catch(e){console.warn(e);}
  await cleanupCall(true);
  const d=byId("farnazCallDialog");if(d)d.hidden=true;
}
async function startCall(type){
  if(!signedInUserId||!currentUser){alert(tr("برای تماس ابتدا وارد حساب شو.","Sign in before starting a call."));return;}
  if(!currentChatUser?.user_id){alert(tr("تماس گروهی هنوز فعال نشده؛ فعلاً از گفت‌وگوی خصوصی تماس بگیر.","Group calls are not enabled yet. Start a call from a private chat."));return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){alert(tr("این مرورگر امکان تماس WebRTC را ندارد.","This browser does not support WebRTC calls."));return;}
  if(activeCall){alert(tr("یک تماس در حال اجراست.","A call is already in progress."));return;}
  const receiverId=String(currentChatUser.user_id);
  if(receiverId===String(signedInUserId))return;
  try{
    const {data:blocked,error}=await getClient().from("blocked_contacts").select("blocked_user_id").eq("blocker_id",signedInUserId).eq("blocked_user_id",receiverId).maybeSingle();
    if(error)throw error;
    if(blocked){alert(tr("این مخاطب را مسدود کرده‌ای؛ برای تماس ابتدا مسدودسازی را بردار.","This contact is blocked. Unblock them before calling."));return;}
  }catch(error){alert(tr("وضعیت مسدودسازی بررسی نشد: ","Could not verify block status: ")+error.message);return;}
  showDialog(type==="video"?tr("تماس تصویری","Video call"):tr("تماس صوتی","Audio call"),tr("در حال شروع تماس…","Starting call…"));
  try{
    const {data,error}=await getClient().from("call_sessions").insert({caller_id:signedInUserId,receiver_id:receiverId,call_type:type,status:"ringing"}).select("*").single();
    if(error)throw error;
    activeCall={session:data,role:"caller",otherId:receiverId,signalChannel:null,pc:null,localStream:null,pendingCandidates:[],timeout:null};
    byId("farnazCallHangup").hidden=false;
    await preparePeer(data,"caller");
    activeCall.timeout=setTimeout(async()=>{
      if(!activeCall||activeCall.session.id!==data.id||activeCall.answered||activeCall.pc?.connectionState==="connected")return;
      try{await sendSignal("hangup");await getClient().from("call_sessions").update({status:"missed"}).eq("id",data.id);}catch(e){console.warn("Missed call status:",e);}
      await cleanupCall(false);showDialog(tr("تماس بی‌پاسخ","Missed call"),tr("پاسخی دریافت نشد.","No answer received."));
      setTimeout(()=>{const d=byId("farnazCallDialog");if(d)d.hidden=true;},1800);
    },45000);
  }catch(e){
    console.error("Start call:",e);try{if(activeCall?.session?.id)await getClient().from("call_sessions").update({status:"ended"}).eq("id",activeCall.session.id);}catch(_){}await cleanupCall(false);
    setCallStatus(tr("تماس شروع نشد: ","Call could not start: ")+e.message);
    byId("farnazCallHangup").hidden=false;
  }
}
async function setUser(userId){
  const request=++userSwitchSequence,next=userId?String(userId):null;
  if(next===signedInUserId&&inboxChannel)return;
  if(activeCall)await endCall(false);
  if(request!==userSwitchSequence)return;
  const previousChannel=inboxChannel;inboxChannel=null;
  if(previousChannel){try{await getClient().removeChannel(previousChannel);}catch(_){}}
  if(request!==userSwitchSequence)return;
  signedInUserId=next;
  if(!signedInUserId)return;
  const myId=signedInUserId,client=getClient();
  const channel=client.channel("farnaz-incoming-calls-"+myId);
  inboxChannel=channel;
  channel
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"call_sessions",filter:"receiver_id=eq."+myId},payload=>{if(signedInUserId===myId)handleIncomingSession(payload.new,client);})
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"call_sessions",filter:"receiver_id=eq."+myId},payload=>{if(signedInUserId===myId)handleCallStatusUpdate(payload.new);})
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"call_sessions",filter:"caller_id=eq."+myId},payload=>{if(signedInUserId===myId)handleCallStatusUpdate(payload.new);})
    .subscribe(status=>{if(signedInUserId===myId&&(status==="CHANNEL_ERROR"||status==="TIMED_OUT"))console.warn("Incoming call listener:",status);});
  // Recover a ringing invitation if the app reconnects after the INSERT event.
  client.from("call_sessions").select("*").eq("receiver_id",myId).eq("status","ringing")
    .gte("created_at",new Date(Date.now()-120000).toISOString()).order("created_at",{ascending:false}).limit(1)
    .then(({data,error})=>{if(signedInUserId!==myId)return;if(error)console.warn("Pending call lookup:",error);else if(data?.[0])handleIncomingSession(data[0],client);});
}
async function handleCallStatusUpdate(session){
  if(!activeCall||String(activeCall.session.id)!==String(session?.id))return;
  if(["ended","missed","rejected"].includes(session.status)){
    const wasReceiver=activeCall.role==="receiver";
    await cleanupCall(false);
    if(wasReceiver||session.status==="rejected"){
      showDialog(session.status==="missed"?tr("تماس بی‌پاسخ","Missed call"):tr("تماس پایان یافت","Call ended"),
        session.status==="missed"?tr("تماس‌گیرنده ارتباط را قطع کرد.","The caller ended the call."):tr("تماس پایان یافت.","The call has ended."));
      setTimeout(()=>{const d=byId("farnazCallDialog");if(d)d.hidden=true;},1600);
    }else{const d=byId("farnazCallDialog");if(d)d.hidden=true;}
  }
}
async function handleIncomingSession(session,client){
  if(!session||session.status!=="ringing"||String(session.caller_id)===String(signedInUserId))return;
  const sessionId=String(session.id);
  if((activeCall&&String(activeCall.session.id)===sessionId)||pendingIncomingSessions.has(sessionId))return;
  if(activeCall){try{await client.from("call_sessions").update({status:"missed"}).eq("id",session.id);}catch(_){}return;}
  pendingIncomingSessions.add(sessionId);
  try{
    let profile=null;
    try{const {data}=await client.rpc("get_farnaz_user_profile",{search_user_id:session.caller_id});profile=Array.isArray(data)?data[0]:data;}catch(e){console.warn("Caller profile lookup:",e);}
    if(String(signedInUserId)!==String(session.receiver_id))return;
    if(activeCall){
      if(String(activeCall.session.id)===sessionId)return;
      try{await client.from("call_sessions").update({status:"missed"}).eq("id",session.id);}catch(_){}
      return;
    }
    const name=profile?.display_name||tr("مخاطب فرناز","Farnaz contact");
    activeCall={session,role:"receiver",otherId:String(session.caller_id),signalChannel:null,pc:null,localStream:null,pendingCandidates:[],timeout:null};
    showDialog(session.call_type==="video"?tr("تماس تصویری ورودی","Incoming video call"):tr("تماس صوتی ورودی","Incoming audio call"),tr("تماس از طرف ","Incoming call from ")+name);
    byId("farnazCallAccept").hidden=false;byId("farnazCallReject").hidden=false;
    await notifyBackground(tr("تماس ورودی در فرناز","Incoming Farnaz call"),name,"call-"+session.id);
  }finally{pendingIncomingSessions.delete(sessionId);}
}
window.startCall=startCall;
window.enableFarnazNotifications=async function(){
  const status=byId("notificationsStatus");
  if(!("Notification" in window)||!navigator.serviceWorker){if(status)status.textContent=tr("اعلان‌ها در این مرورگر پشتیبانی نمی‌شوند.","Notifications are not supported in this browser.");return;}
  try{
    const permission=await Notification.requestPermission();
    if(permission!=="granted"){if(status)status.textContent=tr("اجازه اعلان داده نشد. تنظیمات اعلان مرورگر را بررسی کن.","Permission was not granted. Check browser notification settings.");return;}
    await navigator.serviceWorker.register("./service-worker.js");
    if(status)status.textContent=tr("اجازه اعلان فعال شد. برای اعلان حتی پس از بسته‌شدن برنامه، سرویس Push سرور هم باید پیکربندی شود.","Notification permission is enabled. Server push must also be configured for notifications after the app is closed.");
  }catch(e){if(status)status.textContent=tr("فعال‌سازی اعلان ناموفق بود: ","Could not enable notifications: ")+e.message;}
};
window.FarnazCalls={setUser,notifyMessage:async function(){await notifyBackground(tr("پیام جدید در فرناز","New message in Farnaz"),tr("برای مشاهده پیام، فرناز را باز کن.","Open Farnaz to view the message."),"farnaz-message");}};
window.addEventListener("farnaz-auth-user",event=>{setUser(event.detail?.userId||null).catch(console.error);});
if(typeof currentUser!=="undefined"&&currentUser?.id)setUser(currentUser.id).catch(console.error);
})();