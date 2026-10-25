"use strict";

window.FARNAZ_CONFIG = {
  supabaseUrl: "https://iemykhluluoymsbqpjsn.supabase.co",
  supabasePublishableKey: "sb_publishable_LhUmVjXJlazgYRtEvXna6g_GGKxi_kC"
};

let english=false,authMode="signup",farnazClient=null,currentUser=null;
let currentProfileName="",currentAvatarUrl="",currentPhone="",currentChatPresenceLabel="گفتگوی خصوصی";
let currentChatUser=null,messageSubscription=null,reconnectTimer=null,reconnectAttempts=0;
let profileRequestNumber=0,chatRequestNumber=0,previousPage="chatsPage";
let conversationView="active",conversationPrefs=new Map(),messageLoadedCount=50,messageHasMore=false;
let selectedMessageIds=new Set(),replyTarget=null,editingMessageId=null,messageSelectionMode=false,preEditDraft="";
let recordedVoiceFile=null,recordedVoiceUrl=null,mediaRecorder=null,recordedAudioChunks=[],recordingStream=null;

const $=id=>document.getElementById(id);

const APPEARANCE_DEFAULTS={theme:"dark",accent:"#7896c5",fontSize:"medium",fontFamily:"system",fontColor:"auto",outgoingBubble:"#c6d2e8",incomingBubble:"#bde7fa"};
const APPEARANCE_KEY="farnaz-appearance-v2";
function readAppearanceSettings(){
  try{
    const saved=localStorage.getItem(APPEARANCE_KEY);
    if(saved){const parsed=JSON.parse(saved);if(parsed.accent==="#50e3c2")parsed.accent=APPEARANCE_DEFAULTS.accent;return {...APPEARANCE_DEFAULTS,...parsed};}
    const legacy=JSON.parse(localStorage.getItem("farnaz-appearance-v1")||"{}");
    if(!legacy.outgoingBubble||legacy.outgoingBubble==="auto")legacy.outgoingBubble=APPEARANCE_DEFAULTS.outgoingBubble;
    if(!legacy.incomingBubble||legacy.incomingBubble==="auto")legacy.incomingBubble=APPEARANCE_DEFAULTS.incomingBubble;
    const migrated={...APPEARANCE_DEFAULTS,...legacy};
    localStorage.setItem(APPEARANCE_KEY,JSON.stringify(migrated));
    return migrated;
  }catch(_){return {...APPEARANCE_DEFAULTS};}
}
let appearanceSettings=readAppearanceSettings();
let privacySettings={presence_visibility:"contacts",last_seen_visibility:"contacts",show_typing:true,show_read_receipts:true,show_space_online_count:true};
let farnazPresenceChannel=null,farnazPresenceTimer=null,farnazPresenceMap=new Map(),farnazPresenceContactCache=new Map(),farnazPresenceChannels=new Map(),farnazTypingChannel=null,farnazVisibilityHandler=null,farnazPresenceSessionId=null;
let privateTypingTimer=null,remoteTypingTimer=null;
function applyAppearanceSettings(){
  const root=document.documentElement;
  let theme=appearanceSettings.theme||"dark";
  if(theme==="system")theme=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";
  document.body.dataset.theme=theme;
  const palette=theme==="light"
    ?{bg:"#f4f6fa",panel:"#ffffff",panel2:"#edf1f7",border:"#dce3ed",muted:"#68778d",white:"#172237",danger:"#b42318",mint:"#7896c5"}
    :{bg:"#101722",panel:"#182231",panel2:"#222e3e",border:"#303d4f",muted:"#a4b1c3",white:"#f4f7fb",danger:"#ffaaa9",mint:"#91acd8"};
  Object.entries(palette).forEach(([key,value])=>root.style.setProperty("--"+key,value));
  root.style.setProperty("--bg",palette.bg);root.style.setProperty("--panel",palette.panel);
  root.style.setProperty("--panel2",palette.panel2);root.style.setProperty("--border",palette.border);
  root.style.setProperty("--muted",palette.muted);root.style.setProperty("--danger",palette.danger);
  const fontColor=appearanceSettings.fontColor||"auto";
  document.body.dataset.fontColor=fontColor;
  root.style.setProperty("--white",fontColor==="white"?"#ffffff":fontColor==="black"?"#111111":theme==="light"?"#172237":"#f7f9fc");
  const accent=appearanceSettings.accent||APPEARANCE_DEFAULTS.accent;
  root.style.setProperty("--accent",accent);
  root.style.setProperty("--mint",accent);
  const hex=accent.replace("#","");
  const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  const luminance=(0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])/255;
  const accentInk=luminance>0.62?"#111111":"#ffffff";
  root.style.setProperty("--accent-ink",accentInk);
  /* Each chat bubble has its own saved color; automatic follows the accent color. */
  const readableInk=color=>{
    const h=(color||"#50e3c2").replace("#","");
    const channels=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
    const linear=channels.map(v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2]>0.42?"#111111":"#ffffff";
  };
  const outgoing=appearanceSettings.outgoingBubble||"auto";
  const incoming=appearanceSettings.incomingBubble||"auto";
  const isDefaultOutgoing=outgoing==="#c6d2e8"||outgoing==="auto";
  const isDefaultIncoming=incoming==="#bde7fa"||incoming==="auto";
  const outgoingColor=isDefaultOutgoing?(theme==="light"?"#dce6f5":"#293d59") : outgoing;
  const incomingColor=isDefaultIncoming?(theme==="light"?"#ffffff":"#222d3b"):incoming;
  root.style.setProperty("--my-message-bg",outgoingColor);
  root.style.setProperty("--my-message-ink",readableInk(outgoingColor));
  root.style.setProperty("--their-message-bg",incomingColor);
  root.style.setProperty("--their-message-ink",readableInk(incomingColor));
  const sizes={small:"0.92",medium:"1",large:"1.12"};
  root.style.setProperty("--font-scale",sizes[appearanceSettings.fontSize]||"1");
  const fonts={system:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',serif:'Georgia,"Times New Roman",serif',rounded:'"Trebuchet MS",Arial,sans-serif'};
  document.body.style.fontFamily=fonts[appearanceSettings.fontFamily]||fonts.system;
  ["themeSetting","fontSizeSetting","fontFamilySetting","fontColorSetting"].forEach((id,index)=>{
    const el=$(id);if(el)el.value=[appearanceSettings.theme,appearanceSettings.fontSize,appearanceSettings.fontFamily,appearanceSettings.fontColor||"auto"][index];
  });
  document.querySelectorAll(".color-choice[data-color]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.color===appearanceSettings.accent)));
  document.querySelectorAll(".bubble-color-choice").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.bubbleColor===(appearanceSettings[button.dataset.bubbleTarget]||"auto"))));
}
function updateAppearanceSetting(key,value){
  if(key==="accent"&&!/^#[0-9a-f]{6}$/i.test(value))return;
  if(["outgoingBubble","incomingBubble"].includes(key)&&value!=="auto"&&!/^#[0-9a-f]{6}$/i.test(value))return;
  const allowed={theme:["dark","light","system"],fontSize:["small","medium","large"],fontFamily:["system","serif","rounded"]};
  if(allowed[key]&&!allowed[key].includes(value))return;
  appearanceSettings={...appearanceSettings,[key]:value};
  try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(appearanceSettings));}catch(_){}
  applyAppearanceSettings();
  if($("settingsStatus"))$("settingsStatus").textContent=english?"Settings saved on this device.":"تنظیمات روی این دستگاه ذخیره شد.";
}
function resetAppearanceSettings(){
  appearanceSettings={...APPEARANCE_DEFAULTS};
  try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(appearanceSettings));}catch(_){}
  applyAppearanceSettings();
  if($("settingsStatus"))$("settingsStatus").textContent=english?"Default settings restored.":"تنظیمات اولیه بازگردانده شد.";
}
function applySettingsLanguage(){
  const labels={
    navSettings:["تنظیمات","Settings"],settingsHeading:["تنظیمات","Settings"],
    settingsIntro:["ظاهر فرناز را مطابق سلیقه‌ات تنظیم کن؛ تغییرات روی همین دستگاه ذخیره می‌شوند.","Personalize Farnaz. Your choices are saved on this device."],
     notificationsHeading:["اعلان‌ها","Notifications"],
     notificationsLabel:["اعلان پیام‌ها","Message notifications"],
     notificationsHint:["اجازه نمایش اعلان روی این دستگاه؛ اعلان پس از بسته‌شدن برنامه به پیکربندی Push سرور هم نیاز دارد.","Allow notifications on this device. Push server setup is also required after the app is closed."],
     enableNotificationsButton:["فعال‌سازی اعلان","Enable notifications"],
    appearanceTitle:["ظاهر برنامه","Appearance"],themeLabel:["حالت نمایش","Theme"],
    themeHint:["روشن، تیره یا هماهنگ با دستگاه","Light, dark, or follow device"],
    fontSizeLabel:["اندازه نوشته","Text size"],fontSizeHint:["اندازه متن در سراسر برنامه","Text size across the app"],
    fontFamilyLabel:["فونت فارسی","Font style"],fontFamilyHint:["انتخاب فونت خوانا","Choose a readable font style"],
    fontColorLabel:["رنگ نوشته","Font color"],fontColorHint:["رنگ متن برنامه را انتخاب کن","Choose the app text color"],
    accentTitle:["رنگ اصلی","Accent color"],accentLabel:["رنگ تأکیدی فرناز","Farnaz accent color"],
    accentHint:["برای دکمه‌ها و جزئیات رابط کاربری","Used for buttons and interface details"],
    outgoingBubbleTitle:["رنگ حباب پیام‌های من","My message bubble color"],
    outgoingBubbleLabel:["پیام‌های ارسالی","Outgoing messages"],
    outgoingBubbleHint:["رنگ حباب پیام‌هایی که خودت می‌فرستی","Color of messages you send"],
    incomingBubbleLabel:["پیام‌های دریافتی","Incoming messages"],
    incomingBubbleHint:["رنگ حباب پیام‌هایی که مخاطب می‌فرستد","Color of messages you receive"],
    languageTitle:["زبان","Language"],languageLabel:["زبان برنامه","App language"],
    languageHint:["فارسی یا انگلیسی","Persian or English"],
    resetSettingsButton:["بازگردانی تنظیمات اولیه","Reset to defaults"]
  };
  Object.entries(labels).forEach(([id,pair])=>{if($(id))$(id).textContent=pair[english?1:0];});
  const optionSets={
    themeSetting:[["dark","تیره","Dark"],["light","روشن","Light"],["system","مطابق دستگاه","System"]],
    fontSizeSetting:[["small","کوچک","Small"],["medium","معمولی","Medium"],["large","بزرگ","Large"]],
    fontFamilySetting:[["system","پیش‌فرض دستگاه","Device default"],["serif","سریف","Serif"],["rounded","گرد و نرم","Rounded"]],
    fontColorSetting:[["auto","خودکار بر اساس تم","Automatic by theme"],["white","سفید","White"],["black","سیاه","Black"]]
  };
  Object.entries(optionSets).forEach(([id,items])=>{const el=$(id);if(el)Array.from(el.options).forEach((o,i)=>{o.textContent=items[i][english?2:1];});});
  if($("settingsLanguageButton"))$("settingsLanguageButton").textContent=english?"Switch to فارسی":"English / فارسی";
}
window.addEventListener("storage",event=>{if(event.key===APPEARANCE_KEY){appearanceSettings=readAppearanceSettings();applyAppearanceSettings();}});
if(window.matchMedia){window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change",()=>{if(appearanceSettings.theme==="system")applyAppearanceSettings();});}
applyAppearanceSettings();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initPhoneContactsImport);else initPhoneContactsImport();
// Register the offline cache only after the first page load, so cache installation
// does not compete with the initial CSS, JavaScript, and authentication requests.
function registerFarnazServiceWorker(){
  if(!("serviceWorker" in navigator) || location.protocol==="file:")return;
  navigator.serviceWorker.register("./service-worker.js")
    .then(reg=>{window.farnazServiceWorkerRegistration=reg;reg.update().catch(()=>{});})
    .catch(error=>console.warn("Farnaz service worker registration:",error));
}
if(document.readyState==="complete"){
  (window.requestIdleCallback||((fn)=>setTimeout(fn,900)))(registerFarnazServiceWorker,{timeout:2500});
}else{
  window.addEventListener("load",()=>{
    (window.requestIdleCallback||((fn)=>setTimeout(fn,900)))(registerFarnazServiceWorker,{timeout:2500});
  },{once:true});
}
window.notifyFarnazIncomingMessage=async function(){
  if(!("Notification" in window)||Notification.permission!=="granted"||!document.hidden)return;
  try{
    const reg=await navigator.serviceWorker?.ready;
    if(reg)await reg.showNotification(english?"New message in Farnaz":"پیام جدید در فرناز",{
      body:english?"Open Farnaz to view the message.":"برای مشاهده پیام، فرناز را باز کن.",
      tag:"farnaz-incoming-message",icon:"./farnaz-icon.svg",badge:"./farnaz-icon.svg",data:{url:"./"}
    });
  }catch(error){console.warn("Farnaz message notification:",error);}
}



async function farnazNetworkFetch(input,init){
  const nativeFetch=window.fetch.bind(window);
  const requestUrl=typeof input==="string"?input:(input?.url||"");
  const isStorageUpload=/\/storage\/v1\//i.test(requestUrl)&&/\/object(?:\/|$)/i.test(requestUrl);
  const isAuthRequest=/\/auth\/v1\/(?:token|signup)(?:\?|\/|$)/i.test(requestUrl);
  const isProfileRequest=/\/rest\/v1\/profiles(?:\?|$)/i.test(requestUrl)||/\/auth\/v1\/user(?:\?|$)/i.test(requestUrl);
  // Bound every Supabase REST request. An unanswered inbox/contact query must not
  // leave the app's recovery banner and all screens waiting forever.
  const isRestRequest=/\/rest\/v1\//i.test(requestUrl);
  const needsRequestTimeout=isStorageUpload||isProfileRequest||isAuthRequest||isRestRequest;
  const requestTimeoutMs=isAuthRequest?15000:(isRestRequest?15000:25000);
  const isPasswordLogin=/\/auth\/v1\/token\?grant_type=password(?:&|$)/i.test(requestUrl);
  const canRetry=isStorageUpload||(!(init?.body&&typeof init.body!=="string"&&!(init.body instanceof URLSearchParams)) &&
    !(typeof Request!=="undefined"&&input instanceof Request&&input.bodyUsed));
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    let timeoutId=null;
    let controller=null;
    try{
      const requestInput=(typeof Request!=="undefined"&&input instanceof Request)?input.clone():input;
      let requestInit=init;
      if(needsRequestTimeout&&typeof AbortController!=="undefined"){
        controller=new AbortController();
        const originalSignal=init?.signal||(typeof Request!=="undefined"&&input instanceof Request?input.signal:null);
        if(originalSignal){
          if(originalSignal.aborted)controller.abort(originalSignal.reason);
          else originalSignal.addEventListener("abort",()=>controller.abort(originalSignal.reason),{once:true});
        }
        timeoutId=setTimeout(()=>controller.abort(new DOMException("درخواست پس از مهلت انتظار پاسخ نگرفت.","TimeoutError")),requestTimeoutMs);
        requestInit={...(init||{}),signal:controller.signal};
      }
      const response=await nativeFetch(requestInput,requestInit);
      if(timeoutId)clearTimeout(timeoutId);
      return response;
    }catch(error){
      if(timeoutId)clearTimeout(timeoutId);
      lastError=error;
      if(error?.name==="AbortError"||error?.name==="TimeoutError"){
        // Safari can time out while Supabase is healthy or while the response is
        // delayed in transit. Password sign-in is safe to retry; sign-up is not.
        if((isStorageUpload||isPasswordLogin)&&attempt<2){
          await new Promise(resolve=>setTimeout(resolve,isPasswordLogin?(attempt===0?500:1200):500));
          continue;
        }
        if(isAuthRequest)throw new Error(english?"The server did not respond after retries. Check your connection and try again.":"سرور پس از چند تلاش پاسخ نداد. اتصال اینترنت را بررسی کن و دوباره تلاش کن.");
        if(isStorageUpload)throw new Error("بارگذاری عکس پس از دو تلاش ۲۵ ثانیه‌ای پاسخ نگرفت. اتصال شبکه را بررسی کن و دوباره ذخیره را بزن.");
        if(isProfileRequest)throw new Error("بارگذاری مشخصات پس از ۱۵ ثانیه پاسخ نگرفت. اتصال شبکه را بررسی کن و دوباره تلاش کن.");
        if(isRestRequest)throw new Error(english?"Supabase data request timed out after 15 seconds. Check the connection and retry.":"درخواست دریافت اطلاعات از سوپابیس پس از ۱۵ ثانیه پاسخ نگرفت؛ اتصال را بررسی کن و دوباره تلاش کن.");
        throw error;
      }
      const message=String(error?.message||error||"");
      const networkFailure=error instanceof TypeError||/network|fetch failed|load failed|connection|timeout/i.test(message);
      // A password sign-in is safe to retry after a transport-level failure:
      // Supabase may have completed the request while Safari lost the response.
      // Do not replay sign-up, which could turn a successful first attempt into
      // a misleading "user already exists" error.
      if(isPasswordLogin&&networkFailure&&attempt<2){
        await new Promise(resolve=>setTimeout(resolve,attempt===0?500:1200));
        continue;
      }
      if(isAuthRequest||!canRetry||!networkFailure||attempt===2)throw error;
      await new Promise(resolve=>setTimeout(resolve,attempt===0?450:1100));
    }
  }
  throw lastError;
}

function getClient(){
  if(farnazClient)return farnazClient;

  const c=window.FARNAZ_CONFIG;

  if(!c?.supabaseUrl||!c?.supabasePublishableKey){
    throw new Error("تنظیمات Supabase ناقص است.");
  }

  if(!window.supabase?.createClient){
    throw new Error("کتابخانه Supabase بارگذاری نشده؛ صفحه را تازه‌سازی کن.");
  }

  farnazClient=window.supabase.createClient(
    c.supabaseUrl,
    c.supabasePublishableKey,
    {
      global:{fetch:farnazNetworkFetch},
      auth:{
        // Keep one stable storage key across reloads and GitHub Pages launches.
        storageKey:"sb-iemykhluluoymsbqpjsn-auth-token",
        storage:window.localStorage,
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true,
        flowType:"pkce"
      }
    }
  );

  return farnazClient;
}

function setStatus(id,msg,isError=false){
  const e=$(id);if(!e)return;
  e.textContent=msg;e.classList.toggle("error-text",isError);
}
function setConnectionBanner(message,show=true){
  const banner=$("connectionBanner");if(!banner)return;
  banner.textContent=message||"";
  banner.hidden=!show||!message;
}
function isTransientError(error){
  const status=Number(error?.status||error?.statusCode||error?.cause?.status||0);
  const code=String(error?.code||"").toUpperCase();
  const message=String(error?.message||error||"").toLowerCase();
  if(status===401||status===403||code.startsWith("23")||code.startsWith("42"))return false;
  return status===408||status===425||status===429||status>=500||
    /network|fetch failed|failed to fetch|timeout|timed out|temporar|connection reset|connection closed|load failed|offline|gateway|too many requests|پاسخ نگرفت|مهلت انتظار|زمان.?تمام|طول کشید/.test(message);
}
const recoveryDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function withTimeout(operation,timeoutMs=9000,label="درخواست"){
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      const error=new Error(english
        ?(label+" did not respond within "+Math.round(timeoutMs/1000)+" seconds.")
        :(label+" پس از "+Math.round(timeoutMs/1000)+" ثانیه پاسخ نداد."));
      error.name="TimeoutError";
      reject(error);
    },timeoutMs);
  });
  return Promise.race([Promise.resolve(operation),timeout]).finally(()=>clearTimeout(timer));
}
async function retryRead(label,operation,maxAttempts=2){
  let lastError;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      if(typeof navigator!=="undefined"&&navigator.onLine===false){
        setConnectionBanner(english?"You are offline. Farnaz will reconnect automatically.":"اتصال اینترنت قطع است؛ فرناز پس از وصل‌شدن خودکار تلاش می‌کند.");
        throw new Error("NETWORK_OFFLINE");
      }
      const result=await withTimeout(operation(),9000,label);
      if(result?.error)throw result.error;
      if(Array.isArray(result)){
        const failed=result.find(item=>item?.error);
        if(failed)throw failed.error;
      }
      return result;
    }catch(error){
      lastError=error;
      if(!isTransientError(error)||attempt===maxAttempts)throw error;
      setConnectionBanner(english?"Connection interrupted. Retrying automatically…":"ارتباط موقتاً قطع شده؛ تلاش مجدد خودکار…");
      await recoveryDelay(300*Math.pow(2,attempt-1)+Math.floor(Math.random()*180));
    }
  }
  throw lastError;
}
let recoveryInProgress=false;
function scheduleReconnect(){
  if(reconnectTimer||!currentUser||typeof navigator!=="undefined"&&navigator.onLine===false)return;
  const delay=Math.min(30000,1000*Math.pow(2,Math.min(reconnectAttempts,5)));
  reconnectAttempts++;
  reconnectTimer=setTimeout(()=>{
    reconnectTimer=null;
    recoverConnection();
  },delay);
}
async function recoverConnection(){
  if(recoveryInProgress||!currentUser||typeof navigator!=="undefined"&&navigator.onLine===false)return;
  recoveryInProgress=true;
  try{
    await subscribeToMessages();
    // Reconcile the active private chat after downtime so messages missed while
    // Realtime was disconnected are restored without forcing the view to bottom.
    if(currentChatUser&&document.body.classList.contains("chat-mode")&&typeof loadPrivateMessages==="function"){
      await loadPrivateMessages(false,true);
    }
    await retryRead("conversation refresh",()=>refreshConversationList(),2);
    // Reconnecting the realtime channel must never rebuild the open chat history.
    // Existing messages stay in the DOM; incoming messages are appended by the realtime handler.
    setConnectionBanner("",false);
  }catch(error){
    console.warn("Automatic connection recovery:",error);
    setConnectionBanner(english?"Still reconnecting. You can keep using Farnaz; it will retry automatically.":"هنوز اتصال برقرار نشده؛ می‌توانی با فرناز کار کنی و برنامه دوباره تلاش می‌کند.");
    scheduleReconnect();
  }finally{recoveryInProgress=false;}
}
function normalizeDigits(v){
  return String(v||"")
    .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function normalizePhone(v,countryCode="98"){
  const raw=normalizeDigits(v).trim();
  if(!raw)return "";
  const hasPlus=raw.startsWith("+");
  let digits=raw.replace(/\D/g,"");
  if(!digits)return "";
  if(raw.startsWith("00"))digits=digits.slice(2);
  else if(!hasPlus&&digits.startsWith("0"))digits=String(countryCode)+digits.replace(/^0+/,"");
  else if(!hasPlus&&String(countryCode)==="98"&&digits.startsWith("9")&&digits.length===10)digits="98"+digits;
  else if(!hasPlus&&!digits.startsWith(String(countryCode)))digits=String(countryCode)+digits;
  return "+"+digits;
}
function formatContactPhone(phone){
  const raw=normalizeDigits(phone).trim();
  if(!raw)return "";
  let digits=raw.replace(/\D/g,"");
  if(digits.startsWith("00"))digits=digits.slice(2);
  const countries=[
    {code:"98",national:"0",length:10},
    {code:"49",national:"0"},
    {code:"44",national:"0"},
    {code:"90",national:"0"},
    {code:"1",national:""}
  ];
  const country=countries.sort((a,b)=>b.code.length-a.code.length).find(c=>digits.startsWith(c.code));
  if(country){
    let local=digits.slice(country.code.length);
    if(country.national==="0")local=local.replace(/^0+/,"");
    return country.national+local;
  }
  return "+"+digits;
}
function setPhoneDisplay(el,phone){
  if(!el)return;
  el.textContent=formatContactPhone(phone);
  el.setAttribute("dir","ltr");
  el.style.direction="ltr";
  el.style.unicodeBidi="isolate";
  el.style.textAlign="left";
}
function setPhoneCountry(selectId,phone){
  const digits=normalizeDigits(phone).replace(/\D/g,"");
  const select=$(selectId);if(!select)return;
  const match=["98","49","1","44","90"].find(code=>digits.startsWith(code));
  if(match)select.value=match;
}
function initials(name){return(name||"F").trim().charAt(0).toLocaleUpperCase()||"F";}
function renderAvatar(el,url,name){
  if(!el)return;
  el.replaceChildren();
  if(url){
    const img=document.createElement("img");
    img.src=url;img.alt=english?"Profile picture":"تصویر پروفایل";
    img.onerror=()=>{el.replaceChildren();el.textContent=initials(name);};
    el.appendChild(img);
  }else el.textContent=initials(name);
}
function startNewChat(){
  if(!currentUser){openAuth();return;}
  toggleContactSearch(false);
  /* The visible control is .chats-new-button; older code expected a missing #topNewChatButton. */
  toggleNewChatPopover();
}
function createGroupFromHome(){
  if(!currentUser){openAuth();return;}
  toggleNewChatPopover(false);
  navigate("spacesPage");
  window.setTimeout(()=>{const createButton=$("createSpaceBtn");if(createButton)createButton.click();},80);
}
function applyConversationSearch(){
  const query=($("conversationSearch")?.value||"").trim().toLocaleLowerCase();
  $("conversationList")?.querySelectorAll(".conversation-card").forEach(card=>{
    const text=(card.textContent||"").toLocaleLowerCase();
    card.hidden=!!query&&!text.includes(query);
  });
}
function toggleNewChatPopover(force){
  const panel=$("newChatPopover"),button=$("topNewChatButton")||document.querySelector(".chats-new-button");
  if(!panel||!button)return;
  const open=typeof force==="boolean"?force:panel.hidden;
  panel.hidden=!open;button.setAttribute("aria-expanded",String(open));
  if(open){
    $("savedContactFilter").value="";
    filterSavedContactsForNewChat();
    refreshSavedContacts();
    requestAnimationFrame(()=> $("savedContactFilter").focus({preventScroll:true}));
  }
}
function filterSavedContactsForNewChat(){
  const query=($("savedContactFilter")?.value||"").trim().toLocaleLowerCase();
  let visible=0;
  $("newChatContactsList")?.querySelectorAll(".list-item").forEach(item=>{
    const name=(item.dataset.contactName||"").toLocaleLowerCase();
    const show=!query||name.includes(query);item.hidden=!show;if(show)visible++;
  });
  const hasItems=$("newChatContactsList")?.children.length||0;
  $("newChatContactsStatus").textContent=hasItems?(visible?"":(english?"No matching saved contacts.":"مخاطب ذخیره‌شده‌ای با این نام پیدا نشد.")):(english?"No saved contacts yet.":"هنوز مخاطبی ذخیره نشده است.");
}
function toggleContactsImport(force){
  const panel=$("phoneContactsImport"),button=$("contactsImportToggle");
  if(!panel||!button)return;
  const open=typeof force==="boolean"?force:panel.hidden;
  panel.hidden=!open;
  button.setAttribute("aria-expanded",String(open));
  button.textContent=open?"×":"＋";
  button.setAttribute("aria-label",open?(english?"Close contact import":"بستن بخش افزودن مخاطب"):(english?"Add or sync contacts":"افزودن یا همگام‌سازی مخاطب"));
}
function toggleContactSearch(force){
  const panel=$("contactSearchPopover"),button=$("contactSearchButton");
  if(!panel||!button)return;
  const open=typeof force==="boolean"?force:panel.hidden;
  panel.hidden=!open;
  button.setAttribute("aria-expanded",String(open));
  if(open)requestAnimationFrame(()=> $("recipientValue").focus({preventScroll:true}));
}
function toggleAttachmentMenu(force){
  const menu=$("attachmentMenu"),button=$("attachmentMenuButton");
  if(!menu||!button)return;
  const shouldOpen=typeof force==="boolean"?force:menu.hidden;
  menu.hidden=!shouldOpen;
  button.setAttribute("aria-expanded",String(shouldOpen));
}
function chooseAttachment(kind){
  toggleAttachmentMenu(false);
  const target=kind==="photo"?"photoFile":kind==="camera"?"cameraFile":"attachmentFile";
  $(target)?.click();
}
document.addEventListener("click",event=>{
  const menu=$("attachmentMenu"),button=$("attachmentMenuButton");
  if(menu&&!menu.hidden&&!menu.contains(event.target)&&!button.contains(event.target))toggleAttachmentMenu(false);
});
function navigate(pageId){
  if(!currentUser){openAuth();return;}
  if(!$(pageId))return;
  if(pageId==="chatPage"&&!currentChatUser)return;
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===pageId));
  document.querySelector(".app").classList.toggle("chat-mode",pageId==="chatPage");
  document.body.classList.toggle("chat-mode",pageId==="chatPage");
  const brandHeader=document.querySelector(".app>header");
  if(brandHeader)brandHeader.hidden=pageId==="chatPage";
  const headerFButton=$("headerFButton");
  if(headerFButton)headerFButton.hidden=pageId==="homePage"||pageId==="chatPage";
  if(pageId!=="chatPage"){document.documentElement.style.removeProperty("--chat-viewport-offset");document.documentElement.style.removeProperty("--chat-viewport-height");}
  document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.page===pageId));
  $("bottomNav").classList.toggle("visible",pageId!=="homePage"&&pageId!=="chatPage");
  $("topNewChatButton").classList.toggle("visible",pageId==="chatsPage");
  if(pageId==="chatsPage")applyConversationSearch();
  if(pageId!=="chatsPage")toggleNewChatPopover(false);
  if(pageId!=="contactsPage")toggleContactSearch(false);
  if(pageId==="chatsPage")refreshConversationList();
  if(pageId==="contactsPage")refreshSavedContacts();
  window.scrollTo({top:0,behavior:"instant"});
}
function backFromChat(){dismissMessageMenus();exitMessageSelection();cancelReply();cancelMessageEdit();navigate(previousPage==="contactsPage"?"contactsPage":"chatsPage");}
function openAdjacentConversation(direction){
  const cards=[...$("conversationList").querySelectorAll(".conversation-card")];
  if(!cards.length)return;
  const ids=cards.map(card=>card.querySelector(".list-item")?.dataset.contactId||null);
  const index=ids.indexOf(String(currentChatUser?.user_id||""));
  const nextIndex=index+direction;
  if(nextIndex<0||nextIndex>=cards.length)return;
  cards[nextIndex].querySelector(".list-item")?.click();
}
/* Horizontal swipe navigation disabled: keep private chat stationary on mobile. */

function setConversationView(view){conversationView=view;refreshConversationList();}
$("conversationSearch")?.addEventListener("input",applyConversationSearch);
function prefFor(id){return conversationPrefs.get(id)||{pinned:false,archived:false,hidden_at:null};}
async function saveConversationPref(contactId,patch){
  const next={...prefFor(contactId),...patch,user_id:currentUser.id,contact_user_id:contactId,updated_at:new Date().toISOString()};
  const {error}=await getClient().from("conversation_preferences").upsert(next,{onConflict:"user_id,contact_user_id"});
  if(error)throw error;conversationPrefs.set(contactId,next);await refreshConversationList();
}
async function conversationAction(contactId,action){
  try{
    const old=prefFor(contactId);
    if(action==="delete"){
      if(!confirm(english?"Hide this conversation from your list? The other person keeps their messages.":"این گفتگو فقط از فهرست شما پنهان شود؟ پیام‌های طرف مقابل حذف نمی‌شود."))return;
      await saveConversationPref(contactId,{hidden_at:new Date().toISOString(),archived:false,pinned:false});
    }else if(action==="pin")await saveConversationPref(contactId,{pinned:!old.pinned,archived:false});
    else if(action==="archive")await saveConversationPref(contactId,{archived:!old.archived,pinned:false});
  }catch(e){alert((english?"Action failed: ":"عملیات ناموفق بود: ")+e.message);}
}
function showConversationActions(card,contactId){
  card.querySelector(".conversation-action-menu")?.remove();
  const p=prefFor(contactId),menu=document.createElement("div");menu.className="conversation-tools conversation-action-menu";
  const items=[[p.pinned?(english?"Unpin":"برداشتن پین"):(english?"Pin":"پین"),"pin"],[p.archived?(english?"Unarchive":"خروج از آرشیو"):(english?"Archive":"آرشیو"),"archive"],[english?"Delete chat":"حذف گفتگو","delete"]];
  for(const [label,action] of items){const b=document.createElement("button");b.type="button";b.className="mini-button"+(action==="delete"?" danger":"");b.textContent=label;b.onclick=()=>conversationAction(contactId,action);menu.appendChild(b);}
  card.appendChild(menu);
}
function openSignup(){authMode="signup";openAuth();}
function openLogin(){authMode="login";openAuth();}
function openAuth(){
  const signup=authMode==="signup";
  $("nameField").style.display=signup?"block":"none";
  $("authName").required=signup;
  $("authPassword").autocomplete=signup?"new-password":"current-password";
  document.querySelector(".app")?.classList.add("auth-open");
  if($("headerFButton"))$("headerFButton").hidden=true;
  $("authBox").style.display="flex";setStatus("authStatus","");
  $("authName").value="";$("authEmail").value="";$("authPassword").value="";
  updateAuthTexts();
}
function closeAuth(){$("authBox").style.display="none";document.querySelector(".app")?.classList.remove("auth-open");}
async function signInSocial(provider="google"){
  const button=$("googleAuth");
  const label=button?.querySelector("span:last-child");
  if(button)button.disabled=true;
  setStatus("authStatus",english?"Connecting to Google…":"در حال اتصال به گوگل…");
  try{
    const client=getClient();
    const {error}=await client.auth.signInWithOAuth({
      provider,
      options:{redirectTo:"https://kalaghkocholo.github.io/Farnaz/"}
    });
    if(error)throw error;
  }catch(e){
    console.error("Social sign-in:",e);
    const message=(e.message||"").toLowerCase();
    const setupMissing=/provider is not enabled|unsupported provider|client_id|provider not found|invalid request/.test(message);
    setStatus("authStatus",setupMissing
      ?(english?"This sign-in provider is not configured yet. Enable it in Supabase Auth and add its OAuth credentials first.":"此登入方式尚未設定。請先在 Supabase Auth 啟用服務並填入 OAuth 憑證。")
      :(english?"Sign-in could not start: ":"無法開始登入：")+e.message,true);
    if(button)button.disabled=false;
  }
}
function switchAuthMode(){
  authMode=authMode==="signup"?"login":"signup";
  const signup=authMode==="signup";
  $("nameField").style.display=signup?"block":"none";
  $("authName").required=signup;
  $("authPassword").autocomplete=signup?"new-password":"current-password";
  setStatus("authStatus","");updateAuthTexts();
}
function updateAuthTexts(){
  const v=english;
  $("authTitle").textContent=authMode==="signup"?(v?"Create your Farnaz account":"ثبت‌نام در فرناز"):(v?"Sign in to Farnaz":"ورود به فرناز");
  $("authMessage").textContent=authMode==="signup"?(v?"Create an account to stay connected.":"برای ارتباط نزدیک‌تر، حساب خودت را بساز."):(v?"Sign in with your email and password.":"با ایمیل و رمز عبورت وارد شو.");
  $("authSubmit").textContent=authMode==="signup"?(v?"Sign up":"ثبت‌نام"):(v?"Sign in":"ورود");
  $("authSwitch").textContent=authMode==="signup"?(v?"Already have an account? Sign in":"قبلاً حساب ساخته‌ام؛ ورود"):(v?"Need an account? Sign up":"حساب ندارم؛ ثبت‌نام");
  $("googleAuthLabel").textContent=v?"Continue with Google":"ادامه با Google";
  $("authOrLabel").textContent=v?"or continue with email":"یا با ایمیل";
}
/* Keep one welcome language toggle globally; preserve the separate Settings language control. */
function normalizeWelcomeLanguageButton(){
  const home=document.getElementById("homePage");
  if(!home)return;
  const buttons=Array.from(document.querySelectorAll(".welcome-language-switch, #welcomeLanguageButton"));
  let keep=home.querySelector(":scope > #welcomeLanguageButton")||home.querySelector(".welcome-language-switch");
  if(!keep)return;
  buttons.forEach(button=>{if(button!==keep)button.remove();});
  keep.id="welcomeLanguageButton";
  keep.classList.add("welcome-language-switch");
  if(keep.parentElement!==home)home.prepend(keep);
}
document.addEventListener("DOMContentLoaded",normalizeWelcomeLanguageButton);
window.addEventListener("pageshow",normalizeWelcomeLanguageButton);
setTimeout(normalizeWelcomeLanguageButton,0);

function toggleLanguage(){
  english=!english;
  document.documentElement.lang=english?"en":"fa";
  document.documentElement.dir=english?"ltr":"rtl";
  const labels={
    brand:["فرناز","Farnaz"],subtitle:["ارتباطی نزدیک‌تر، در هر کجا","Closer, wherever you are"],
    welcome:["خوش آمدی به فرناز","WELCOME TO FARNAZ"],
    headline:["آدم‌های مهم زندگی‌ات، همیشه نزدیک تو","The people who matter, closer to you"],
    description:["یک فضای ساده برای گفتگو و ارتباط با کسانی که برایت مهم‌اند.","A simple space to stay connected."],
    start:["شروع کنیم ←","Let's begin →"],f1:["گفتگوی خصوصی","Private chat"],
    f1d:["پیام‌هایت را مرتب دنبال کن.","Keep conversations organized."],
    f2:["عکس و فایل","Photos & files"],f2d:["لحظه‌ها و فایل‌ها را به اشتراک بگذار.","Share moments and files."],
    f3:["مخاطبان","Contacts"],f3d:["مخاطبان مهمت را ذخیره و سریع پیدا کن.","Save and find important contacts quickly."],
    f4:["گروه‌ها و کانال‌ها","Groups & channels"],f4d:["گفت‌وگوهای جمعی و اطلاع‌رسانی در یک جا.","Group conversations and updates in one place."],
    chatsHeading:["گفتگوها","Chats"],chatsIntro:["گفتگوهای اخیرت را اینجا می‌بینی.","Your recent conversations appear here."],
    contactsHeading:["مخاطبان","Contacts"],
    phoneContactsImportTitle:["همگام‌سازی مخاطبان گوشی","Sync phone contacts"],
    phoneContactsImportIntro:["مخاطبان را مستقیم از انتخاب‌گر امن Safari انتخاب کن؛ فایل لازم نیست. اطلاعات انتخاب‌شده فقط برای حساب خودت ذخیره می‌شود.","Choose contacts directly in Safari’s secure picker; no file is needed. Selected contact data is stored privately for your account."],
    pickPhoneContactsButton:["انتخاب مخاطبان از دفترچه تلفن","Choose contacts from address book"],
    phoneContactsVcfFallbackLabel:["روش جایگزین: واردکردن فایل VCF","Alternative: import a VCF file"],
    phoneContactsCountryLabel:["کد کشور برای شماره‌های محلی","Country code for local numbers"],
    importPhoneContactsButton:["واردکردن / به‌روزرسانی فایل VCF","Import / update VCF file"],
    phoneContactsPrivacyNote:["برای همگام‌سازی دوباره، فایل به‌روز مخاطبان را از آیفون انتخاب کن. حذف فایل یا مخاطب از گوشی، مخاطبان ذخیره‌شده فرناز را خودکار حذف نمی‌کند.","To sync again, select an updated VCF file from your iPhone. Removing a contact from your phone does not automatically delete saved Farnaz contacts."],
    savedFarnazContactsTitle:["مخاطبان فرناز","Farnaz contacts"],
    unmatchedPhoneContactsTitle:["مخاطبان گوشی که هنوز عضو فرناز نیستند","Phone contacts not on Farnaz yet"],
    contactsIntro:["مخاطبان ذخیره‌شده را انتخاب کن یا از جست‌وجوی پایین حساب جدیدی پیدا کن.","Choose a saved contact or find a new account using the search control below."],
    recipientLabel:["ایمیل یا شماره تلفن با کد کشور","Email or phone with country code"],
    recipientCountryLabel:["کد کشور شماره تلفن","Phone country code"],
    findRecipientBtn:["پیدا کردن مخاطب","Find contact"],foundHeading:["نتیجه جست‌وجو","Search result"],
    savedContactsStatus:["",""],
    profilePhoneCountryLabel:["کد کشور شماره تلفن","Phone country code"],
    showPhoneSettingLabel:["نمایش شماره موبایل به مخاطبان (پیش‌فرض روشن)","Show my phone number to contacts (on by default)"],
    showPhoneSettingHint:["اگر خاموشش کنی، شماره‌ات در اطلاعات مخاطب نمایش داده نمی‌شود.","Turn this off to hide your number from contact info."],
    contactNote:["جست‌وجو فقط برای حساب‌های ثبت‌شده در فرناز انجام می‌شود.","Search works for registered Farnaz accounts."],
    profileHeading:["پروفایل من","My profile"],profileIntro:["اطلاعات حساب خود را مدیریت کن.","Manage your account information."],
    profileNameLabel:["نام نمایشی","Display name"],profilePhoneLabel:["شماره موبایل با کد کشور","Phone number with country code"],
    avatarFileLabel:["تصویر پروفایل","Profile picture"],avatarNote:["فرمت JPG، PNG یا WebP؛ حداکثر ۳ مگابایت.","JPG, PNG or WebP; maximum 3 MB."],
    saveProfileButton:["ذخیره تغییرات","Save changes"],logoutButton:["خروج از حساب","Sign out"],
    navChats:["گفتگوها","Chats"],navContacts:["مخاطبان","Contacts"],navProfile:["پروفایل","Profile"],navSettings:["تنظیمات","Settings"],
    messagePrivacyNote:["",""],homeLogin:["ورود یا ثبت‌نام","Sign in or sign up"]
  };
  Object.entries(labels).forEach(([id,pair])=>{if($(id))$(id).textContent=pair[english?1:0];});
  if($("language"))$("language").textContent=english?"فا":"EN";
  if($("welcomeLanguageButton")){$("welcomeLanguageButton").textContent=english?"فا":"EN";$("welcomeLanguageButton").setAttribute("aria-label",english?"Switch to Persian":"Switch to English");}
  if($("contactsImportToggle"))$("contactsImportToggle").textContent=$("phoneContactsImport")&&!$("phoneContactsImport").hidden?"×":"＋";
  if($("start"))$("start").textContent=english?"Sign in to Farnaz →":"ورود به فرناز ←";
  ["recipientCountry","profilePhoneCountry"].forEach(id=>{
    const select=$(id);if(!select)return;
    const names=english?["Iran","Germany","United States / Canada","United Kingdom","Turkey"]:["ایران","آلمان","آمریکا / کانادا","بریتانیا","ترکیه"];
    Array.from(select.options).forEach((option,i)=>{option.textContent=names[i]+" (+"+option.value+")";});
  });
  $("footerText").textContent="Farnaz · Closer, wherever you are.";
  $("recipientValue").placeholder=english?"email@example.com or +98912...":"email@example.com یا +98912...";
  $("messageText").placeholder=english?"Write a message...":"پیامت را بنویس...";
  $("showActiveChats").textContent=english?"Chats":"گفتگوها";$("showArchivedChats").textContent=english?"Archive":"آرشیو";
  $("attachmentMenuButton").title=english?"Add attachment":"افزودن پیوست";
  $("attachmentPhotoOption").lastElementChild.textContent=english?"Choose photo":"انتخاب عکس";
  $("attachmentCameraOption").lastElementChild.textContent=english?"Take a photo":"گرفتن عکس با دوربین";
  $("attachmentFileOption").lastElementChild.textContent=english?"Choose file":"انتخاب فایل";
  const newChatButton=$("topNewChatButton")||document.querySelector(".chats-new-button");
  if(newChatButton){newChatButton.title=english?"New chat":"گفتگوی جدید";newChatButton.setAttribute("aria-label",english?"New chat":"گفتگوی جدید");}
  const importToggle=$("contactsImportToggle");
  if(importToggle){importToggle.setAttribute("aria-label",english?"Add or sync contacts":"افزودن یا همگام‌سازی مخاطب");importToggle.title=importToggle.getAttribute("aria-label");}
  $("newChatPopoverTitle").textContent=english?"Start a new chat":"گفتگوی جدید";
  $("savedContactFilter").placeholder=english?"Search saved contacts by name":"جستجو با نام مخاطب ذخیره‌شده";
  $("savedContactFilter").setAttribute("aria-label",english?"Search saved contacts by name":"جستجو با نام مخاطب ذخیره‌شده");
  $("contactSearchButtonLabel").textContent=english?"Find contact":"جستجوی مخاطب";
  $("contactSearchTitle").textContent=english?"Find a new contact":"پیدا کردن مخاطب جدید";
  $("contactSearchButton").setAttribute("aria-label",english?"Find a new contact":"جستجوی مخاطب جدید");
  $("recordAudioButton").title=english?"Record voice message":"ضبط پیام صوتی";$("attachmentHint").textContent=english?"Files up to 20 MB":"فایل تا ۲۰ مگابایت";
  $("loadOlderButton").textContent=english?"Load older messages":"پیام‌های قدیمی‌تر";$("cancelEditButton").textContent=english?"Cancel edit":"لغو ویرایش";
  const selectionButtons=$("selectionToolbar").querySelectorAll("button");
  if(selectionButtons.length===4){selectionButtons[0].textContent=english?"Reply":"پاسخ";selectionButtons[1].textContent=english?"Forward":"فوروارد";selectionButtons[2].textContent=english?"Delete":"حذف";selectionButtons[3].textContent=english?"Cancel":"لغو";}

  $("authNameLabel").textContent=english?"Display name":"نام نمایشی";
  $("authEmailLabel").textContent=english?"Email":"ایمیل";
  $("authPasswordLabel").textContent=english?"Password (at least 8 characters)":"رمز عبور (حداقل ۸ کاراکتر)";
  updateAuthTexts();
  applySettingsLanguage();
  if(currentUser){refreshConversationList();refreshSavedContacts();}
}
function renderUser(user,name){
  currentUser=user;currentProfileName=(name||"").trim();
  document.body.dataset.authState="user";const settingsButton=$("openSettingsButton");if(settingsButton){settingsButton.hidden=false;settingsButton.style.removeProperty("display");}
  $("userName").textContent=currentProfileName||(english?"Farnaz user":"کاربر فرناز");
  $("userEmail").textContent=user.email||"";
  setPhoneDisplay($("userPhone"),currentPhone);
  renderAvatar($("userAvatar"),currentAvatarUrl,$("userName").textContent);
}
async function showUser(user){
  const request=++profileRequestNumber;
  currentUser=user;renderUser(user,user.user_metadata?.display_name||"");
  if(!window.__farnazPersistenceRequested){window.__farnazPersistenceRequested=true;void window.FarnazLocalStore?.requestPersistentStorage().catch(error=>console.warn("Persistent storage request:",error));}
  window.dispatchEvent(new CustomEvent("farnaz-auth-user",{detail:{userId:user.id}}));
  setStatus("profileStatus",english?"Loading profile...":"در حال بارگذاری پروفایل...");
  let cachedProfile=null;
  try{cachedProfile=await window.FarnazLocalStore?.getSnapshot(user.id,"profile");}catch(cacheError){console.warn("Cached profile read:",cacheError);}
  if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
  if(cachedProfile){
    privacySettings={presence_visibility:cachedProfile.presence_visibility||"contacts",last_seen_visibility:cachedProfile.last_seen_visibility||"contacts",show_typing:cachedProfile.show_typing!==false,show_read_receipts:cachedProfile.show_read_receipts!==false,show_space_online_count:cachedProfile.show_space_online_count!==false};
    applyPrivacySettings();
    currentProfileName=cachedProfile.display_name||user.user_metadata?.display_name||"";
    currentAvatarUrl=cachedProfile.avatar_url||"";currentPhone=cachedProfile.phone||"";
    renderUser(user,currentProfileName);
    if($("profileNameInput"))$("profileNameInput").value=currentProfileName;
    setPhoneCountry("profilePhoneCountry",currentPhone);
    if($("profilePhoneInput"))$("profilePhoneInput").value=formatContactPhone(currentPhone);
    if($("showPhoneSetting"))$("showPhoneSetting").checked=cachedProfile.show_phone!==false;
    setStatus("profileStatus",english?"Showing saved profile while refreshing…":"نمایش پروفایل ذخیره‌شده؛ در حال همگام‌سازی…");
  }
  try{
    const {data,error}=await retryRead("current user profile",()=>getClient().from("profiles")
      .select("id,display_name,avatar_url,phone,show_phone,presence_visibility,last_seen_visibility,show_typing,show_read_receipts,show_space_online_count").eq("id",user.id).maybeSingle());
    if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
    if(error)throw error;
    let profile=data;
    if(!profile){
      const fallbackName=(user.user_metadata?.display_name||user.email?.split("@")[0]||"Farnaz user").trim();
      const created=await retryRead("create current user profile",()=>getClient().from("profiles")
        .upsert({id:user.id,display_name:fallbackName,phone:user.phone||null,show_phone:true},{onConflict:"id"})
        .select("id,display_name,avatar_url,phone,show_phone,presence_visibility,last_seen_visibility,show_typing,show_read_receipts,show_space_online_count").single(),2);
      if(created.error)throw created.error;
      profile=created.data;
    }
    privacySettings={presence_visibility:profile?.presence_visibility||"contacts",last_seen_visibility:profile?.last_seen_visibility||"contacts",show_typing:profile?.show_typing!==false,show_read_receipts:profile?.show_read_receipts!==false,show_space_online_count:profile?.show_space_online_count!==false};
    applyPrivacySettings();
    startFarnazPresence().catch(e=>console.warn("Farnaz presence:",e));
    currentProfileName=profile?.display_name||user.user_metadata?.display_name||"";
    currentAvatarUrl=profile?.avatar_url||"";currentPhone=profile?.phone||"";
    renderUser(user,currentProfileName);
    $("profileNameInput").value=currentProfileName;
    setPhoneCountry("profilePhoneCountry",currentPhone);
    $("profilePhoneInput").value=formatContactPhone(currentPhone);
    $("showPhoneSetting").checked=profile?.show_phone!==false;
    try{await window.FarnazLocalStore?.saveSnapshot(user.id,"profile",profile);}catch(cacheError){console.warn("Cached profile save:",cacheError);}
    setStatus("profileStatus",english?"Profile loaded.":"پروفایل بارگذاری شد.");
  }catch(e){
    console.error("Profile read:",e);
    if(cachedProfile){
      setStatus("profileStatus",english?"Showing saved profile; server refresh failed.":"پروفایل ذخیره‌شده نمایش داده می‌شود؛ به‌روزرسانی سرور ناموفق بود.");
      return;
    }
    setStatus("profileStatus",(english?"Could not load profile: ":"بارگذاری پروفایل ناموفق بود: ")+e.message,true);
  }
}
function showGuest(){
  const previousUserId=currentUser?.id;
  if(previousUserId)window.FarnazLocalStore?.clearUser(previousUserId).catch(cacheError=>console.warn("Could not clear local account data:",cacheError));
  stopFarnazPresence().catch(()=>{});farnazPresenceContactCache.clear();
  profileRequestNumber++;currentUser=null;currentProfileName="";currentAvatarUrl="";currentPhone="";
  document.body.dataset.authState="guest";if($("headerFButton"))$("headerFButton").hidden=true;const settingsButton=$("openSettingsButton");if(settingsButton){settingsButton.hidden=true;settingsButton.style.setProperty("display","none","important");}
  window.dispatchEvent(new CustomEvent("farnaz-auth-user",{detail:{userId:null}}));
  currentChatUser=null;
  $("bottomNav").classList.remove("visible");
  $("userName").textContent=english?"Farnaz user":"کاربر فرناز";
  $("userEmail").textContent="";$("userPhone").textContent="";
  $("profileForm").reset();
  $("conversationList").replaceChildren();$("foundContact").replaceChildren();
  $("savedContactsList").replaceChildren();setStatus("savedContactsStatus","");
  $("recipientValue").value="";setStatus("recipientStatus","");
  $("messageList").replaceChildren();
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="homePage"));
}


window.addEventListener("farnaz-auth-user",event=>{
  const userId=event.detail?.userId;
  if(!userId)return;
  setTimeout(()=>{
    if(currentUser?.id!==userId)return;
    if(document.getElementById("chatsPage")?.classList.contains("active"))refreshConversationList();
    if(document.getElementById("contactsPage")?.classList.contains("active"))refreshSavedContacts();
  },400);
});

let farnazPresenceStartPromise=null,farnazPresenceStartUserId=null;
async function startFarnazPresence(forceRestart=false){
 if(!currentUser)return;
 const uid=String(currentUser.id);
 const existing=farnazPresenceChannel;
 if(!forceRestart&&existing&&farnazPresenceStartUserId===uid&&(existing.state==="joining"||existing.state==="joined"))return;
 if(farnazPresenceStartPromise){
  try{await farnazPresenceStartPromise;}catch(_){}
  return;
 }
 const task=startFarnazPresenceNow(uid);
 farnazPresenceStartPromise=task;
 farnazPresenceStartUserId=uid;
 try{await task;}finally{if(farnazPresenceStartPromise===task)farnazPresenceStartPromise=null;}
}
async function startFarnazPresenceNow(expectedUid){
 if(!currentUser||String(currentUser.id)!==expectedUid)return;
 const client=getClient(),uid=String(currentUser.id);
 if(uid!==expectedUid)return;
 await stopFarnazPresence();
 if(!currentUser||String(currentUser.id)!==uid)return;
 if(!farnazPresenceSessionId)farnazPresenceSessionId=crypto.randomUUID();
 const ownTopic="farnaz-presence:"+uid;
 const ownChannel=client.channel(ownTopic,{config:{private:true,presence:{key:uid+":"+farnazPresenceSessionId}}});
 farnazPresenceChannel=ownChannel;
 const notifyPresence=()=>window.dispatchEvent(new CustomEvent("farnaz-presence-updated",{detail:{userIds:[...farnazPresenceMap.keys()]}}));
 const trackOwn=async()=>{
  if(!currentUser||String(currentUser.id)!==uid||farnazPresenceChannel!==ownChannel)return;
  if(document.visibilityState!=="visible"||privacySettings.presence_visibility==="nobody"){try{await ownChannel.untrack();}catch(_){}if(document.visibilityState==="visible"){try{await client.rpc("set_farnaz_presence_session",{p_session_id:farnazPresenceSessionId,p_active:true});}catch(_){}}return;}
  const now=new Date().toISOString();
  try{await client.rpc("set_farnaz_presence_session",{p_session_id:farnazPresenceSessionId,p_active:true});}catch(_){}
  try{await ownChannel.track({user_id:uid,online:true,updated_at:now});}catch(_){}
 };
 ownChannel.subscribe(async status=>{
  if(status==="SUBSCRIBED")await trackOwn();
 });
 if(farnazPresenceTimer)clearInterval(farnazPresenceTimer);
 farnazPresenceTimer=setInterval(trackOwn,60000);
 try{
  const {data,error}=await client.rpc("get_farnaz_mutual_contact_ids");
  if(error)throw error;
  for(const row of data||[]){
   const contactId=String(row.contact_user_id||"");
   if(!contactId||contactId===uid)continue;
   const ch=client.channel("farnaz-presence:"+contactId,{config:{private:true,presence:{key:contactId}}});
   farnazPresenceChannels.set(contactId,ch);
   ch.on("presence",{event:"sync"},()=>{
    if(farnazPresenceChannels.get(contactId)!==ch)return;
    const state=ch.presenceState()||{};
    const entries=Object.values(state).flat();
    const entry=entries.find(x=>String(x.user_id||"")===contactId&&x.online===true);
    if(entry)farnazPresenceMap.set(contactId,entry);else farnazPresenceMap.delete(contactId);
    window.farnazPresenceMap=farnazPresenceMap;notifyPresence();
   }).subscribe();
  }
 }catch(e){console.warn("Could not subscribe to mutual-contact presence:",e);}
 if(farnazVisibilityHandler)document.removeEventListener("visibilitychange",farnazVisibilityHandler);
 farnazVisibilityHandler=()=>{
  if(document.visibilityState==="visible"){
   startFarnazPresence(true).catch(e=>console.warn("Farnaz presence resume:",e));
   return;
  }
  if(farnazPresenceTimer){clearInterval(farnazPresenceTimer);farnazPresenceTimer=null;}
  try{client.rpc("set_farnaz_presence_session",{p_session_id:farnazPresenceSessionId,p_active:false});}catch(_){}
  try{ownChannel.untrack();}catch(_){}
  for(const [id,ch] of farnazPresenceChannels){client.removeChannel(ch).catch(()=>{});farnazPresenceChannels.delete(id);farnazPresenceMap.delete(id);}
  if(farnazTypingChannel){try{farnazTypingChannel.send({type:"broadcast",event:"typing",payload:{from:uid,typing:false}});}catch(_){}client.removeChannel(farnazTypingChannel).catch(()=>{});farnazTypingChannel=null;}
  window.farnazPresenceMap=farnazPresenceMap;notifyPresence();
 };
 document.addEventListener("visibilitychange",farnazVisibilityHandler);
}
async function startPrivateTypingChannel(contactId){
 if(!currentUser||!contactId)return;
 const client=getClient(),uid=String(currentUser.id),other=String(contactId);
 if(farnazTypingChannel){const old=farnazTypingChannel;farnazTypingChannel=null;try{await client.removeChannel(old);}catch(_){}}
 if(uid===other)return;
 const pair=[uid,other].sort();
 const ch=client.channel("farnaz-typing:"+pair.join(":"),{config:{private:true}});
 farnazTypingChannel=ch;
 ch.on("broadcast",{event:"typing"},event=>{
  const p=event?.payload||{};
  if(String(p.from)===uid||String(currentChatUser?.user_id)!==other||privacySettings.show_typing===false)return;
  const subtitle=$("chatSubtitle");if(!subtitle)return;
  subtitle.textContent=p.typing?(english?"Typing…":"در حال نوشتن…"):currentChatPresenceLabel;
  if(remoteTypingTimer)clearTimeout(remoteTypingTimer);
  if(p.typing)remoteTypingTimer=setTimeout(()=>{if(subtitle)subtitle.textContent=currentChatPresenceLabel;},2200);
 }).subscribe();
}
async function stopFarnazPresence(){
 if(farnazPresenceTimer){clearInterval(farnazPresenceTimer);farnazPresenceTimer=null;}
 if(farnazVisibilityHandler){document.removeEventListener("visibilitychange",farnazVisibilityHandler);farnazVisibilityHandler=null;}
 const client=farnazClient;
 if(client&&currentUser&&farnazPresenceSessionId){try{await client.rpc("set_farnaz_presence_session",{p_session_id:farnazPresenceSessionId,p_active:false});}catch(_){}}
 const own=farnazPresenceChannel;farnazPresenceChannel=null;
 if(own&&client){try{await own.untrack();await client.removeChannel(own);}catch(_){}}
 if(client){
  for(const ch of farnazPresenceChannels.values()){try{await client.removeChannel(ch);}catch(_){}}
  if(farnazTypingChannel){try{await client.removeChannel(farnazTypingChannel);}catch(_){}}
 }
 farnazPresenceChannels.clear();farnazTypingChannel=null;farnazPresenceMap=new Map();window.farnazPresenceMap=farnazPresenceMap;notifyFarnazPresenceChanged();
}
function notifyFarnazPresenceChanged(){window.dispatchEvent(new CustomEvent("farnaz-presence-updated",{detail:{userIds:[...farnazPresenceMap.keys()]}}));}
window.farnazCanSeePresence=async function(userId){
 const id=String(userId||"");if(!id||id===String(currentUser?.id))return true;
 return farnazPresenceMap.has(id);
};

function applyPrivacySettings(){
 const values={presenceVisibilitySetting:privacySettings.presence_visibility,lastSeenVisibilitySetting:privacySettings.last_seen_visibility,showTypingSetting:privacySettings.show_typing,showReadReceiptsSetting:privacySettings.show_read_receipts,showSpaceOnlineCountSetting:privacySettings.show_space_online_count};
 for(const [id,value] of Object.entries(values)){const el=$(id);if(el){if(el.type==="checkbox")el.checked=!!value;else el.value=value;}}
}
async function savePrivacySetting(key,value){
 if(!currentUser)return;
 const allowed={presence_visibility:["everyone","contacts","nobody"],last_seen_visibility:["everyone","contacts","nobody"]};
 if(allowed[key]&&!allowed[key].includes(value))return;
 const previous=privacySettings[key];privacySettings={...privacySettings,[key]:value};
 const status=$("privacySettingsStatus");if(status)status.textContent=english?"Saving…":"در حال ذخیره…";
 try{const {error}=await getClient().from("profiles").update({[key]:value}).eq("id",currentUser.id);if(error)throw error;
  if(status)status.textContent=english?"Privacy settings saved.":"تنظیمات حریم خصوصی ذخیره شد.";
  try{const cached=await window.FarnazLocalStore?.getSnapshot(currentUser.id,"profile");if(cached)await window.FarnazLocalStore.saveSnapshot(currentUser.id,"profile",{...cached,[key]:value});}catch(cacheError){console.warn("Cached privacy settings update:",cacheError);}
  window.dispatchEvent(new CustomEvent("farnaz-privacy-updated",{detail:{...privacySettings}}));
  if(farnazPresenceChannel)startFarnazPresence().then(()=>{if(currentChatUser&&privacySettings.show_typing!==false)startPrivateTypingChannel(currentChatUser.user_id).catch(()=>{});}).catch(()=>{});
 }catch(error){privacySettings={...privacySettings,[key]:previous};applyPrivacySettings();if(status)status.textContent=(english?"Could not save: ":"ذخیره ناموفق بود: ")+(error?.message||String(error));}
}

async function saveProfile(event){
  event.preventDefault();if(!currentUser)return;
  const name=$("profileNameInput").value.trim();
  const phone=normalizePhone($("profilePhoneInput").value,$("profilePhoneCountry").value);
  const showPhone=$("showPhoneSetting").checked;
  const file=$("avatarFile").files[0];
  const button=$("saveProfileButton");
  if(!name||name.length>60){
    setStatus("profileStatus",english?"Enter a name up to 60 characters.":"نامی بین ۱ تا ۶۰ نویسه وارد کن.",true);return;
  }
  if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone)){
    setStatus("profileStatus",english?"Use international phone format, e.g. +98912...":"شماره را با کد کشور وارد کن؛ مثل +98912...",true);return;
  }
  if(file&&!["image/jpeg","image/png","image/webp"].includes(file.type)){
    setStatus("profileStatus",english?"Use JPG, PNG or WebP.":"فقط عکس JPG، PNG یا WebP مجاز است.",true);return;
  }
  if(file&&file.size>3*1024*1024){
    setStatus("profileStatus",english?"Image must be 3 MB or smaller.":"حجم عکس باید حداکثر ۳ مگابایت باشد.",true);return;
  }
  button.disabled=true;setStatus("profileStatus",english?"Preparing to save profile...":"آماده‌سازی ذخیره پروفایل...");
  try{
    const client=getClient();let avatarUrl=currentAvatarUrl;
    if(file){
      setStatus("profileStatus",english?"Uploading profile photo...":"در حال بارگذاری عکس پروفایل...");
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const path=currentUser.id+"/avatar-"+Date.now()+"."+ext;
      const {error}=await client.storage.from("avatars").upload(path,file,{contentType:file.type,upsert:true});
      if(error)throw error;
      avatarUrl=client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }
    setStatus("profileStatus",english?"Saving profile details...":"در حال ذخیره مشخصات پروفایل...");
    const {data,error}=await client.from("profiles")
      .upsert({id:currentUser.id,display_name:name,phone:phone||null,avatar_url:avatarUrl||null,show_phone:showPhone,presence_visibility:privacySettings.presence_visibility,last_seen_visibility:privacySettings.last_seen_visibility,show_typing:privacySettings.show_typing,show_read_receipts:privacySettings.show_read_receipts,show_space_online_count:privacySettings.show_space_online_count},{onConflict:"id"})
      .select("id,display_name,phone,avatar_url,show_phone").single();
    if(error)throw error;
    currentProfileName=data.display_name||name;currentPhone=data.phone||"";
    currentAvatarUrl=data.avatar_url||"";
    setPhoneCountry("profilePhoneCountry",currentPhone);
    setStatus("profileStatus",english?"Updating account details...":"در حال به‌روزرسانی مشخصات حساب...");
    try{
      const {error:metadataError}=await client.auth.updateUser({data:{display_name:currentProfileName}});
      if(metadataError)console.warn("Auth metadata update:",metadataError);
    }catch(metadataError){
      // The profile row is already saved; account metadata is secondary and must not block success.
      console.warn("Auth metadata update:",metadataError);
    }
    renderUser(currentUser,currentProfileName);$("avatarFile").value="";
    try{await window.FarnazLocalStore?.saveSnapshot(currentUser.id,"profile",{...data,presence_visibility:privacySettings.presence_visibility,last_seen_visibility:privacySettings.last_seen_visibility,show_typing:privacySettings.show_typing,show_read_receipts:privacySettings.show_read_receipts,show_space_online_count:privacySettings.show_space_online_count});}catch(cacheError){console.warn("Cached profile update:",cacheError);}
    setStatus("profileStatus",english?"Profile saved.":"پروفایل ذخیره شد.");
  }catch(e){
    console.error("Profile save:",e);
    const reason=e?.name==="AbortError"||e?.name==="TimeoutError"
      ?(english?"Photo upload timed out. Check your connection and try again.":"بارگذاری عکس به پایان مهلت رسید. اتصال را بررسی کن و دوباره تلاش کن.")
      :(e?.message||String(e));
    setStatus("profileStatus",(english?"Could not save profile: ":"ذخیره پروفایل ناموفق بود: ")+reason,true);
  }finally{button.disabled=false;}
}
async function logout(){
  const button=$("logoutButton");
  if(button)button.disabled=true;
  try{
    // Sign out locally first. Realtime/presence cleanup must never block logout.
    const client=getClient();
    const {error}=await client.auth.signOut({scope:"local"});
    if(error)throw error;
    showGuest();
    setStatus("authStatus",english?"You have signed out.":"با موفقیت از حساب خارج شدی.",false);
    // Cleanup is best-effort and deliberately runs after the UI has returned to guest.
    void stopMessageSubscription().catch(e=>console.warn("Message channel cleanup after logout:",e));
  }catch(e){
    console.error("Farnaz logout failed:",e);
    setStatus("profileStatus",(english?"Sign out failed: ":"خروج ناموفق بود: ")+(e?.message||String(e)),true);
  }finally{
    if(button)button.disabled=false;
  }
}

function sendPrivateTyping(typing){
 if(!farnazTypingChannel||!currentUser||!currentChatUser||privacySettings.show_typing===false)return;
 farnazTypingChannel.send({type:"broadcast",event:"typing",payload:{from:currentUser.id,typing:!!typing}});
}
document.addEventListener("input",event=>{
 if(!event.target?.matches("#messageText"))return;
 if(privacySettings.show_typing===false)return;
 sendPrivateTyping(!!event.target.value.trim());
 if(privateTypingTimer)clearTimeout(privateTypingTimer);
 if(event.target.value.trim())privateTypingTimer=setTimeout(()=>sendPrivateTyping(false),1800);
});

async function stopMessageSubscription(){
  if(!messageSubscription||!farnazClient)return;
  const ch=messageSubscription;messageSubscription=null;
  // A suspended mobile realtime socket can make removeChannel never settle.
  // Continue app initialization after a short grace period instead of deadlocking.
  try{
    await Promise.race([
      farnazClient.removeChannel(ch),
      new Promise(resolve=>setTimeout(resolve,2000))
    ]);
  }catch(e){console.warn("Could not close previous realtime channel:",e);}
}
async function getContactProfile(id){
  const {data,error}=await getClient().rpc("get_farnaz_user_profile",{search_user_id:id});
  if(error)throw error;
  return Array.isArray(data)?(data[0]||null):(data||null);
}

// Fetch contact profiles in one authorized RPC instead of one network request
// per contact. This keeps the inbox responsive on mobile/slow connections.
async function getContactProfiles(ids){
  const unique=[...new Set((ids||[]).map(id=>String(id||"")).filter(Boolean))];
  if(!unique.length)return new Map();
  const {data,error}=await getClient().rpc("get_farnaz_user_profiles",{search_user_ids:unique});
  if(error)throw error;
  return new Map((data||[]).filter(p=>p?.user_id).map(p=>[String(p.user_id),p]));
}

let contactInfoDialog=null,contactInfoBlocked=false,contactInfoRequest=0;
/* Click is wired directly in index.html; avoid a second delegated click path. */
document.addEventListener("keydown",event=>{
  if((event.key==="Enter"||event.key===" ")&&event.target instanceof Element&&event.target.matches("#conversationTitle, #chatAvatar")&&currentUser&&currentChatUser){
    event.preventDefault();
    openContactInfo();
  }
});
function ensureContactInfoDialog(){
  if(contactInfoDialog)return contactInfoDialog;
  const modal=document.createElement("div");
  modal.id="contactInfoDialog";modal.className="contact-info-dialog";modal.hidden=true;
  modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","contactInfoTitle");
  modal.innerHTML='<section class="contact-info-card"><button type="button" class="contact-info-close" id="closeContactInfo" aria-label="بستن">×</button><div class="contact-info-profile"><div class="contact-info-avatar avatar large" id="contactInfoAvatar">F</div><h2 id="contactInfoTitle"></h2><p id="contactInfoAbout" class="muted-note"></p><div id="contactInfoPhone" class="contact-info-phone" hidden></div></div><div class="contact-info-actions" id="contactInfoActions"></div><section class="contact-info-media"><h3 id="contactInfoMediaTitle">رسانه‌ها و فایل‌ها</h3><p id="contactInfoMediaStatus" class="muted-note" role="status"></p><div id="contactInfoMediaList" class="contact-info-media-list"></div></section><p id="contactInfoStatus" class="status" role="status"></p><div class="contact-info-danger-actions"><button type="button" id="contactInfoBlock" class="contact-info-danger-button"></button><button type="button" id="contactInfoDelete" class="contact-info-danger-button">حذف گفتگو</button></div></section>';
  document.body.appendChild(modal);contactInfoDialog=modal;
  $("closeContactInfo").addEventListener("click",closeContactInfo);
  modal.addEventListener("click",event=>{if(event.target===modal)closeContactInfo();});
  $("contactInfoBlock").addEventListener("click",toggleContactBlock);
  $("contactInfoDelete").addEventListener("click",deleteContactConversation);
  const title=$("conversationTitle"),avatar=$("chatAvatar");
  [title,avatar].forEach(el=>{
    if(!el)return;
    el.style.cursor="pointer";el.setAttribute("role","button");el.setAttribute("tabindex","0");
    el.setAttribute("aria-haspopup","dialog");el.setAttribute("aria-label",english?"Contact information":"اطلاعات مخاطب");
  });
  return modal;
}
function closeContactInfo(){if(contactInfoDialog)contactInfoDialog.hidden=true;}
function contactInfoText(fa,en){return english?en:fa;}
function addContactInfoAction(label,icon,handler){
  const button=document.createElement("button");button.type="button";button.className="contact-info-action";
  const glyph=document.createElement("span");glyph.className="contact-info-action-icon";
  if(icon.startsWith("#chatPage")){
    const source=document.querySelector(icon);
    if(source)glyph.appendChild(source.cloneNode(true));
  }else glyph.textContent=icon;
  const text=document.createElement("span");text.textContent=label;button.append(glyph,text);button.addEventListener("click",handler);$("contactInfoActions").appendChild(button);
}
let messageSearchDialog=null,messageSearchRequest=0;
function ensureMessageSearchDialog(){
  if(messageSearchDialog)return messageSearchDialog;
  const modal=document.createElement("div");
  modal.id="messageSearchDialog";modal.className="message-search-dialog";modal.hidden=true;
  modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","messageSearchTitle");
  modal.innerHTML='<section class="message-search-card"><header class="message-search-heading"><h2 id="messageSearchTitle"></h2><button type="button" class="contact-info-close" id="closeMessageSearch" aria-label="Close">×</button></header><form id="messageSearchForm"><label for="messageSearchQuery" id="messageSearchQueryLabel"></label><input id="messageSearchQuery" type="search" maxlength="200" autocomplete="off"><div class="message-search-filters"><div><label for="messageSearchKind" id="messageSearchKindLabel"></label><select id="messageSearchKind"><option value="all"></option><option value="text"></option><option value="images"></option><option value="voice"></option><option value="files"></option></select></div><div><label for="messageSearchFrom" id="messageSearchFromLabel"></label><input id="messageSearchFrom" type="date"></div><div><label for="messageSearchTo" id="messageSearchToLabel"></label><input id="messageSearchTo" type="date"></div></div><button class="message-search-submit" id="messageSearchSubmit" type="submit"></button></form><p id="messageSearchStatus" class="muted-note" role="status" aria-live="polite"></p><div id="messageSearchResults" class="message-search-results"></div></section>';
  document.body.appendChild(modal);messageSearchDialog=modal;
  $("closeMessageSearch").addEventListener("click",closeMessageSearch);
  modal.addEventListener("click",e=>{if(e.target===modal)closeMessageSearch();});
  $("messageSearchForm").addEventListener("submit",searchMessageHistory);
  modal.addEventListener("keydown",e=>{if(e.key==="Escape")closeMessageSearch();});
  return modal;
}
function closeMessageSearch(){if(messageSearchDialog)messageSearchDialog.hidden=true;}
function searchCurrentConversation(){
  closeContactInfo();const modal=ensureMessageSearchDialog();
  $("messageSearchTitle").textContent=contactInfoText("جست‌وجوی پیشرفته","Advanced search");
  $("messageSearchQueryLabel").textContent=contactInfoText("عبارت جست‌وجو","Search phrase");
  $("messageSearchQuery").placeholder=contactInfoText("کلمه یا عبارت را بنویس…","Enter a word or phrase…");
  $("messageSearchKindLabel").textContent=contactInfoText("نوع پیام","Message type");
  $("messageSearchFromLabel").textContent=contactInfoText("از تاریخ","From date");
  $("messageSearchToLabel").textContent=contactInfoText("تا تاریخ","To date");
  $("messageSearchSubmit").textContent=contactInfoText("جست‌وجو","Search");
  [["all","همه","All"],["text","متنی","Text"],["images","تصاویر","Images"],["voice","صوتی","Voice"],["files","فایل‌ها","Files"]].forEach(([v,fa,en],i)=>{$("messageSearchKind").options[i].textContent=english?en:fa;});
  $("messageSearchStatus").textContent=contactInfoText("جست‌وجو در تمام تاریخچهٔ گفتگوی خصوصی","Search the full private conversation history");
  $("messageSearchResults").replaceChildren();modal.hidden=false;$("messageSearchQuery").focus();
}
function messageSearchQueryBase(client,myId,contactId,senderIsMe,kind,fromIso,toIso){
  let q=client.from("messages").select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at")
    .eq("sender_id",senderIsMe?myId:contactId).eq("receiver_id",senderIsMe?contactId:myId);
  if(fromIso)q=q.gte("created_at",fromIso);if(toIso)q=q.lt("created_at",toIso);
  if(kind==="text")q=q.is("attachment_path",null);
  if(kind==="images")q=q.eq("message_type","image").not("attachment_path","is",null);
  if(kind==="voice")q=q.ilike("attachment_mime","audio/%").not("attachment_path","is",null);
  if(kind==="files")q=q.not("attachment_path","is",null).not("attachment_mime","ilike","image/%").not("attachment_mime","ilike","audio/%").not("attachment_mime","ilike","video/%");
  return q.order("created_at",{ascending:false}).limit(101);
}
async function searchMessageHistory(event){
  event.preventDefault();if(!currentUser||!currentChatUser)return;
  const term=$("messageSearchQuery").value.trim(),kind=$("messageSearchKind").value,fromValue=$("messageSearchFrom").value,toValue=$("messageSearchTo").value;
  if(fromValue&&toValue&&fromValue>toValue){$("messageSearchStatus").textContent=contactInfoText("تاریخ شروع باید قبل از پایان باشد.","Start date must be before end date.");return;}
  if(!term&&!fromValue&&!toValue&&kind==="all"){$("messageSearchStatus").textContent=contactInfoText("عبارت، تاریخ یا نوع پیام را مشخص کن.","Enter a phrase, date range, or message type.");return;}
  const request=++messageSearchRequest,myId=currentUser.id,contactId=currentChatUser.user_id,client=getClient();
  const fromIso=fromValue?new Date(fromValue+"T00:00:00").toISOString():null;
  const toIso=toValue?new Date(new Date(toValue+"T00:00:00").getTime()+86400000).toISOString():null;
  const safeTerm=term.replace(/[%_\\]/g,c=>"\\"+c);
  const fields=term?(kind==="text"?["body"]:["body","attachment_name"]):[null];
  const submit=$("messageSearchSubmit");submit.disabled=true;$("messageSearchResults").replaceChildren();
  $("messageSearchStatus").textContent=contactInfoText("در حال جست‌وجو…","Searching…");
  try{
    const queries=[];
    for(const mine of [true,false])for(const field of fields){
      let q=messageSearchQueryBase(client,myId,contactId,mine,kind,fromIso,toIso);
      if(field)q=q.ilike(field,"%"+safeTerm+"%");
      queries.push(q);
    }
    const responses=await retryRead("message search",()=>Promise.all(queries));
    if(request!==messageSearchRequest||String(currentChatUser?.user_id)!==String(contactId))return;
    const unique=new Map();
    for(const r of responses){if(r.error)throw r.error;for(const m of r.data||[])unique.set(String(m.id),m);}
    let results=[...unique.values()];
    if(kind==="files")results=results.filter(m=>m.attachment_path&&!/^(image|audio|video)\//i.test(m.attachment_mime||""));
    if(kind==="images")results=results.filter(m=>m.attachment_path&&(m.message_type==="image"||(m.attachment_mime||"").startsWith("image/")));
    if(kind==="voice")results=results.filter(m=>m.attachment_path&&(m.message_type==="audio"||(m.attachment_mime||"").startsWith("audio/")));
    if(term){const n=term.toLocaleLowerCase();results=results.filter(m=>(m.body||"").toLocaleLowerCase().includes(n)||(m.attachment_name||"").toLocaleLowerCase().includes(n));}
    const hidden=await retryRead("hidden messages",()=>client.from("message_hidden").select("message_id").eq("user_id",myId));
    if(request!==messageSearchRequest||String(currentChatUser?.user_id)!==String(contactId))return;
    if(hidden.error)throw hidden.error;const hiddenIds=new Set((hidden.data||[]).map(x=>String(x.message_id)));
    results=results.filter(m=>!hiddenIds.has(String(m.id))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const total=results.length,list=$("messageSearchResults");list.replaceChildren();
    if(!total){$("messageSearchStatus").textContent=contactInfoText("نتیجه‌ای پیدا نشد.","No matching messages found.");return;}
    $("messageSearchStatus").textContent=total>100?contactInfoText("بیش از ۱۰۰ نتیجه؛ ۱۰۰ مورد تازه‌تر نمایش داده شده است.","More than 100 results; showing the 100 most recent."):contactInfoText(total+" نتیجه پیدا شد.",total+" result(s) found.");
    for(const m of results.slice(0,100)){
      const item=document.createElement("button");item.type="button";item.className="message-search-result";
      const snippet=document.createElement("span");snippet.className="message-search-snippet";
      snippet.textContent=m.body||m.attachment_name||(m.message_type==="image"?contactInfoText("تصویر","Image"):m.message_type==="audio"?contactInfoText("پیام صوتی","Voice message"):contactInfoText("پیوست","Attachment"));
      const meta=document.createElement("small");meta.className="message-search-meta";
      const date=new Date(m.created_at).toLocaleString(english?"en":"fa-IR",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
      meta.textContent=(String(m.sender_id)===String(myId)?contactInfoText("شما","You"):(currentChatUser.display_name||contactInfoText("مخاطب","Contact")))+" · "+date;
      item.append(snippet,meta);item.addEventListener("click",()=>openSearchedMessage(m.id,m.created_at,contactId));list.appendChild(item);
    }
  }catch(error){if(request===messageSearchRequest)$("messageSearchStatus").textContent=(english?"Search failed: ":"جست‌وجو ناموفق بود: ")+(error?.message||String(error));}
  finally{if(request===messageSearchRequest)submit.disabled=false;}
}
async function openSearchedMessage(messageId,createdAt,contactId){
  if(!currentUser||!currentChatUser||String(currentChatUser.user_id)!==String(contactId))return;
  closeMessageSearch();
  const already=[...$("messageList").querySelectorAll(".message[data-message-id]")].find(el=>String(el.dataset.messageId)===String(messageId));
  if(already){already.classList.add("contact-info-search-match");already.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>already.classList.remove("contact-info-search-match"),2500);return;}
  const request=++chatRequestNumber,myId=currentUser.id,client=getClient();
  setStatus("sendMessageStatus",contactInfoText("در حال باز کردن پیام پیدا‌شده…","Opening matched message…"));
  try{
    const queries=[];
    for(const [sender,receiver] of [[myId,contactId],[contactId,myId]]){
      queries.push(client.from("messages").select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at").eq("sender_id",sender).eq("receiver_id",receiver).lte("created_at",createdAt).order("created_at",{ascending:false}).limit(26));
      queries.push(client.from("messages").select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at").eq("sender_id",sender).eq("receiver_id",receiver).gt("created_at",createdAt).order("created_at",{ascending:true}).limit(26));
    }
    const responses=await retryRead("messages around search result",()=>Promise.all(queries));
    if(request!==chatRequestNumber||currentUser?.id!==myId||String(currentChatUser?.user_id)!==String(contactId))return;
    for(const r of responses)if(r.error)throw r.error;
    const unique=new Map();responses.forEach(r=>(r.data||[]).forEach(m=>unique.set(String(m.id),m)));
    let messages=[...unique.values()].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    const targetIndex=messages.findIndex(m=>String(m.id)===String(messageId));
    if(targetIndex<0)throw new Error(contactInfoText("پیام دیگر در دسترس نیست.","This message is no longer available."));
    const start=Math.max(0,Math.min(targetIndex-24,messages.length-50));messages=messages.slice(start,start+50);
    const hidden=await retryRead("hidden messages",()=>client.from("message_hidden").select("message_id").eq("user_id",myId));
    if(request!==chatRequestNumber||currentUser?.id!==myId||String(currentChatUser?.user_id)!==String(contactId))return;
    if(hidden.error)throw hidden.error;const hiddenIds=new Set((hidden.data||[]).map(m=>String(m.message_id)));
    messages=messages.filter(m=>!hiddenIds.has(String(m.id)));
    const ownIds=messages.filter(m=>String(m.sender_id)===String(myId)).map(m=>String(m.id));
    const received=messages.filter(m=>String(m.receiver_id)===String(myId)&&String(m.sender_id)!==String(myId)).map(m=>({message_id:m.id,sender_id:m.sender_id,receiver_id:m.receiver_id,reader_id:myId}));
    const receiptPromise=ownIds.length?client.from("message_read_receipts").select("message_id,reader_id,read_at").in("message_id",ownIds):Promise.resolve({data:[],error:null});
    const readPromise=(typeof privacySettings==="undefined"||privacySettings.show_read_receipts!==false)&&received.length?client.from("message_read_receipts").upsert(received,{onConflict:"message_id,reader_id",ignoreDuplicates:true}).then(({error})=>{if(error)console.warn("Could not save read receipts:",error.message);}):Promise.resolve();
    const [receipts]=await Promise.all([receiptPromise,readPromise]);
    if(request!==chatRequestNumber||currentUser?.id!==myId||String(currentChatUser?.user_id)!==String(contactId))return;
    readReceiptMessageIds=new Set((receipts?.data||[]).filter(r=>String(r.reader_id)!==String(myId)).map(r=>String(r.message_id)));
    await renderMessages(messages,myId);
    messageHasMore=start>0||responses[0].data?.length>=26||responses[2].data?.length>=26;$("loadOlderButton").hidden=true;
    const found=[...$("messageList").querySelectorAll(".message[data-message-id]")].find(el=>String(el.dataset.messageId)===String(messageId));
    if(found){found.classList.add("contact-info-search-match");found.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>found.classList.remove("contact-info-search-match"),3500);}
    setStatus("sendMessageStatus","");
  }catch(error){if(request===chatRequestNumber)setStatus("sendMessageStatus",(english?"Could not open search result: ":"باز کردن پیام پیدا‌شده ناموفق بود: ")+(error?.message||String(error)),true);}
}
async function openContactInfo(){
  if(!currentUser||!currentChatUser)return;
  ensureContactInfoDialog();
  const request=++contactInfoRequest,contactId=currentChatUser.user_id;
  $("contactInfoMediaTitle").textContent=contactInfoText("رسانه‌ها و فایل‌ها","Media and files");
  $("contactInfoDelete").textContent=contactInfoText("حذف گفتگو","Delete conversation");
  $("closeContactInfo").setAttribute("aria-label",contactInfoText("بستن","Close"));
  const name=currentChatUser.display_name||(english?"Farnaz user":"مخاطب فرناز");
  $("contactInfoTitle").textContent=name;
  $("contactInfoAbout").textContent=contactInfoText("گفتگوی خصوصی در فرناز","Private conversation on Farnaz");
  $("contactInfoPhone").hidden=true;$("contactInfoPhone").textContent="";
  renderAvatar($("contactInfoAvatar"),currentChatUser.avatar_url||"",name);
  $("contactInfoActions").replaceChildren();$("contactInfoMediaList").replaceChildren();
  $("contactInfoMediaStatus").textContent=contactInfoText("در حال بارگذاری رسانه‌ها…","Loading media and files…");
  $("contactInfoStatus").textContent="";
  $("contactInfoBlock").disabled=true;$("contactInfoDelete").disabled=false;
  $("contactInfoBlock").textContent=contactInfoText("در حال بررسی…","Checking…");
  contactInfoBlocked=false;contactInfoDialog.hidden=false;
  addContactInfoAction(contactInfoText("پیام","Message"),"✉",closeContactInfo);
  addContactInfoAction(contactInfoText("تماس صوتی","Audio call"),"#chatPage .call-actions button[onclick=\"startCall('audio')\"] svg",()=>{closeContactInfo();startCall("audio");});
  addContactInfoAction(contactInfoText("تماس تصویری","Video call"),"#chatPage .call-actions button[onclick=\"startCall('video')\"] svg",()=>{closeContactInfo();startCall("video");});
  addContactInfoAction(contactInfoText("جست‌وجو در گفتگو","Search chat"),"⌕",searchCurrentConversation);
  try{
    const client=getClient();
    const [profileResult,blockedResult]=await Promise.all([
      getContactProfile(contactId),
      client.from("blocked_contacts").select("blocked_user_id").eq("blocker_id",currentUser.id).eq("blocked_user_id",contactId).maybeSingle()
    ]);
    if(request!==contactInfoRequest||String(currentChatUser?.user_id)!==String(contactId))return;
    if(profileResult?.display_name){
      $("contactInfoTitle").textContent=profileResult.display_name;
      $("contactInfoAbout").textContent=contactInfoText("عضو فرناز","Farnaz member");
      if(profileResult.avatar_url)renderAvatar($("contactInfoAvatar"),profileResult.avatar_url,profileResult.display_name);
    }
    /* The profile RPC is the authority for phone visibility; never fall back to raw profile reads. */
    if(profileResult?.phone){
      $("contactInfoPhone").textContent=(english?"Phone: ":"شماره تلفن: ")+formatContactPhone(profileResult.phone);$("contactInfoPhone").setAttribute("dir","ltr");$("contactInfoPhone").style.direction="ltr";$("contactInfoPhone").style.unicodeBidi="isolate";
      $("contactInfoPhone").hidden=false;
    }
    if(blockedResult.error)throw blockedResult.error;
    contactInfoBlocked=!!blockedResult.data;
    $("contactInfoBlock").textContent=contactInfoBlocked?contactInfoText("رفع مسدودسازی","Unblock contact"):contactInfoText("مسدود کردن مخاطب","Block contact");
    $("contactInfoBlock").disabled=false;
    await loadContactInfoMedia(contactId,request);
  }catch(error){
    if(request===contactInfoRequest)$("contactInfoStatus").textContent=(english?"Could not load contact information: ":"بارگذاری اطلاعات مخاطب ناموفق بود: ")+error.message;
    $("contactInfoBlock").disabled=false;
    $("contactInfoBlock").textContent=contactInfoBlocked?contactInfoText("رفع مسدودسازی","Unblock contact"):contactInfoText("مسدود کردن مخاطب","Block contact");
  }
}
async function loadContactInfoMedia(contactId,request){
  const client=getClient(),myId=currentUser.id;
  const results=await Promise.all([
    client.from("messages").select("id,sender_id,receiver_id,created_at,message_type,attachment_path,attachment_name,attachment_mime,attachment_size").eq("sender_id",myId).eq("receiver_id",contactId).not("attachment_path","is",null).order("created_at",{ascending:false}).limit(60),
    client.from("messages").select("id,sender_id,receiver_id,created_at,message_type,attachment_path,attachment_name,attachment_mime,attachment_size").eq("sender_id",contactId).eq("receiver_id",myId).not("attachment_path","is",null).order("created_at",{ascending:false}).limit(60)
  ]);
  const failure=results.find(result=>result.error);if(failure)throw failure.error;
  if(request!==contactInfoRequest)return;
  const items=[...(results[0].data||[]),...(results[1].data||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,80);
  const list=$("contactInfoMediaList");list.replaceChildren();
  if(!items.length){$("contactInfoMediaStatus").textContent=contactInfoText("هنوز رسانه یا فایلی در این گفتگو نیست.","No media or files in this conversation yet.");return;}
  $("contactInfoMediaStatus").textContent=contactInfoText("آخرین پیوست‌های گفتگو","Recent chat attachments");
  for(const item of items){
    const {data,error}=await client.storage.from("chat-attachments").createSignedUrl(item.attachment_path,3600);
    if(request!==contactInfoRequest)return;
    if(error||!data?.signedUrl)continue;
    const link=document.createElement("a");link.className="contact-info-media-item";link.href=data.signedUrl;link.target="_blank";link.rel="noopener noreferrer";
    const isImage=(item.attachment_mime||"").startsWith("image/")||item.message_type==="image";
    if(isImage){const image=document.createElement("img");image.src=data.signedUrl;image.alt=item.attachment_name||contactInfoText("تصویر گفتگو","Chat image");image.loading="lazy";link.appendChild(image);}
    else{const glyph=document.createElement("span");glyph.className="contact-info-file-icon";glyph.textContent=(item.attachment_mime||"").startsWith("audio/")?"♫":"↧";link.appendChild(glyph);}
    const name=document.createElement("span");name.className="contact-info-media-name";name.textContent=item.attachment_name||contactInfoText("فایل پیوست","Attachment");
    link.appendChild(name);list.appendChild(link);
  }
  if(!list.children.length)$("contactInfoMediaStatus").textContent=contactInfoText("پیوست‌ها در حال حاضر قابل نمایش نیستند.","Attachments are currently unavailable.");
}
async function toggleContactBlock(){
  if(!currentUser||!currentChatUser)return;
  const contactId=currentChatUser.user_id,name=currentChatUser.display_name||(english?"this contact":"این مخاطب");
  if(contactInfoBlocked){
    if(!confirm(contactInfoText("مسدودسازی این مخاطب برداشته شود؟","Unblock this contact?")))return;
  }else if(!confirm(contactInfoText("با مسدود کردن "+name+"، تبادل پیام و شروع تماس بین دو حساب متوقف می‌شود. ادامه می‌دهی؟","Blocking "+name+" prevents messaging and starting calls between both accounts. Continue?")))return;
  const button=$("contactInfoBlock");button.disabled=true;
  try{
    const client=getClient();
    const result=contactInfoBlocked
      ?await client.from("blocked_contacts").delete().eq("blocker_id",currentUser.id).eq("blocked_user_id",contactId)
      :await client.from("blocked_contacts").insert({blocker_id:currentUser.id,blocked_user_id:contactId});
    if(result.error)throw result.error;
    contactInfoBlocked=!contactInfoBlocked;
    button.textContent=contactInfoBlocked?contactInfoText("رفع مسدودسازی","Unblock contact"):contactInfoText("مسدود کردن مخاطب","Block contact");
    $("chatSubtitle").textContent=contactInfoBlocked?contactInfoText("مخاطب مسدود شده است","Contact blocked"):contactInfoText("گفتگوی خصوصی","Private conversation");
    $("contactInfoStatus").textContent=contactInfoBlocked?contactInfoText("مخاطب مسدود شد؛ پیام و تماس جدید مجاز نیست.","Contact blocked. New messages and calls are disabled."):contactInfoText("مسدودسازی برداشته شد.","Contact unblocked.");
  }catch(error){
    $("contactInfoStatus").textContent=(english?"Could not update block status: ":"تغییر وضعیت مسدودسازی ناموفق بود: ")+error.message;
  }finally{button.disabled=false;}
}
async function deleteContactConversation(){
  if(!currentUser||!currentChatUser)return;
  if(!confirm(contactInfoText("این گفتگو فقط از فهرست شما حذف می‌شود؛ پیام‌ها و فایل‌ها برای طرف مقابل باقی می‌مانند. ادامه می‌دهی؟","This removes the conversation from your list only. Messages and files remain for the other person. Continue?")))return;
  $("contactInfoDelete").disabled=true;
  try{
    await saveConversationPref(currentChatUser.user_id,{hidden_at:new Date().toISOString(),archived:false,pinned:false});
    closeContactInfo();backFromChat();
  }catch(error){
    $("contactInfoStatus").textContent=(english?"Could not delete conversation: ":"حذف گفتگو ناموفق بود: ")+error.message;
  }finally{$("contactInfoDelete").disabled=false;}
}


async function refreshPrivatePresence(contactId){
 const subtitle=$("chatSubtitle");if(!subtitle||!currentUser||!contactId)return;
 currentChatPresenceLabel=english?"Private conversation":"گفتگوی خصوصی";subtitle.textContent=currentChatPresenceLabel;
 try{
  const {data,error}=await getClient().rpc("get_farnaz_presence_status",{p_user_id:contactId});if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;if(!row||String(currentChatUser?.user_id)!==String(contactId))return;
  if(row.can_see_online&&row.is_online)currentChatPresenceLabel=english?"Online":"آنلاین";
  else if(row.can_see_last_seen&&row.last_seen_at){const when=new Date(row.last_seen_at);currentChatPresenceLabel=(english?"Last seen ":"آخرین بازدید: ")+when.toLocaleString(english?"en":"fa-IR",{dateStyle:"short",timeStyle:"short"});}
  subtitle.textContent=currentChatPresenceLabel;
 }catch(_){subtitle.textContent=currentChatPresenceLabel;}
}

window.addEventListener("farnaz-presence-updated",()=>{if(currentChatUser&&!remoteTypingTimer)refreshPrivatePresence(currentChatUser.user_id);});
function openChat(contact,fromPage="chatsPage"){
  ensureContactInfoDialog();
  const nextContactId=String(contact.user_id||""),previousContactId=String(currentChatUser?.user_id||""),draftInput=$("messageText");
  if(currentUser&&previousContactId&&previousContactId!==nextContactId&&draftInput){
    if(window.farnazDraftSaveTimer)clearTimeout(window.farnazDraftSaveTimer);
    window.FarnazLocalStore?.saveDraft(currentUser.id,previousContactId,draftInput.value).catch(cacheError=>console.warn("Could not preserve previous draft:",cacheError));
  }
  const switchingContacts=previousContactId!==nextContactId;
  currentChatUser=contact;previousPage=fromPage;startPrivateTypingChannel(contact.user_id).catch(()=>{});
  if(switchingContacts&&draftInput){
    draftInput.value="";draftInput.style.height="auto";
    const draftUserId=currentUser?.id,draftContactId=nextContactId;
    window.FarnazLocalStore?.getDraft(draftUserId,draftContactId).then(draft=>{
      if(currentUser?.id===draftUserId&&String(currentChatUser?.user_id)===draftContactId&&draftInput&&!draftInput.value){
        draftInput.value=draft||"";draftInput.style.height="auto";draftInput.style.height=Math.min(draftInput.scrollHeight,112)+"px";
      }
    }).catch(cacheError=>console.warn("Could not restore draft:",cacheError));
  }
  $("conversationTitle").textContent=contact.display_name||(english?"Farnaz user":"مخاطب فرناز");
  $("chatSubtitle").textContent=english?"Private conversation":"گفتگوی خصوصی";
  renderAvatar($("chatAvatar"),contact.avatar_url||"",$("conversationTitle").textContent);
  setStatus("sendMessageStatus","");
  currentChatPresenceLabel=english?"Private conversation":"گفتگوی خصوصی";navigate("chatPage");refreshPrivatePresence(contact.user_id);loadPrivateMessages();
}
function makeContactButton(contact,preview="",timeText="",fromPage="chatsPage"){
  const button=document.createElement("button");
  button.type="button";button.className="list-item";button.dataset.contactId=String(contact.user_id||"");
  const avatar=document.createElement("span");avatar.className="avatar medium";
  renderAvatar(avatar,contact.avatar_url||"",contact.display_name);
  const details=document.createElement("span");details.className="list-details";
  const name=document.createElement("span");name.className="list-name";
  name.textContent=contact.display_name||(english?"Farnaz user":"مخاطب فرناز");
  const desc=document.createElement("span");desc.className="list-preview";
  desc.textContent=preview;
  details.append(name,desc);button.append(avatar,details);
  if(timeText){const time=document.createElement("span");time.className="list-time";time.textContent=timeText;details.appendChild(time);}
  button.addEventListener("click",()=>{if(button.dataset.suppressOpen==="1"){button.dataset.suppressOpen="0";return;}openChat(contact,fromPage);});
  return button;
}
async function refreshUnmatchedPhoneContacts(){
  const list=$("unmatchedPhoneContactsList");if(!list||!currentUser)return;
  const myId=currentUser.id;list.replaceChildren();
  try{
    const {data,error}=await retryRead("phone contacts",()=>getClient().from("user_phone_contacts")
      .select("id,display_name,phone,matched_user_id,updated_at")
      .eq("user_id",myId).is("matched_user_id",null).order("display_name",{ascending:true}).limit(5000));
    if(currentUser?.id!==myId)return;
    if(error)throw error;
    for(const item of data||[]){
      const row=document.createElement("div");row.className="phone-contact-row";
      const avatar=document.createElement("div");avatar.className="avatar";avatar.textContent=initials(item.display_name);
      const details=document.createElement("div");details.className="phone-contact-details";
      const name=document.createElement("strong");name.textContent=item.display_name||(english?"Phone contact":"مخاطب گوشی");
      const phone=document.createElement("span");setPhoneDisplay(phone,item.phone||"");
      const state=document.createElement("small");state.textContent=english?"Not on Farnaz yet":"هنوز در فرناز ثبت‌نام نکرده";
      details.append(name,phone,state);row.append(avatar,details);list.appendChild(row);
    }
    setStatus("unmatchedPhoneContactsStatus",data?.length?(english?"These contacts are saved privately for your account.":"این مخاطبان به‌صورت خصوصی برای حساب خودت ذخیره شده‌اند."):(english?"No unmatched phone contacts. Import a VCF file to begin.":"مخاطب گوشیِ تطبیق‌نیافته‌ای نیست؛ برای شروع فایل VCF را وارد کن."));
  }catch(e){
    console.error("Unmatched phone contacts:",e);
    setStatus("unmatchedPhoneContactsStatus",(english?"Could not load phone contacts: ":"بارگذاری مخاطبان گوشی ناموفق بود: ")+e.message,true);
  }
}
let savedContactsRequestNumber=0;
function renderSavedContactsSnapshot(entries){
  const list=$("savedContactsList");if(!list)return;
  list.replaceChildren();
  const dropdownList=$("newChatContactsList");if(dropdownList)dropdownList.replaceChildren();
  for(const entry of entries||[]){
    const contact=entry?.contact;if(!contact?.user_id)continue;
    list.appendChild(makeContactButton(contact,entry.subtitle||"",entry.date||"","contactsPage"));
    if(dropdownList){const quick=makeContactButton(contact,entry.subtitle||"","","chatsPage");quick.dataset.contactName=contact.display_name||"";dropdownList.appendChild(quick);}
  }
  filterSavedContactsForNewChat();
}
async function refreshSavedContacts(){
  const list=$("savedContactsList");if(!list||!currentUser)return;
  const request=++savedContactsRequestNumber,myId=currentUser.id;
  setStatus("savedContactsStatus",english?"Loading saved contacts...":"در حال بارگذاری مخاطبان ذخیره‌شده...");
  try{
    const cached=await window.FarnazLocalStore?.getSnapshot(myId,"contacts");
    if(currentUser?.id===myId&&request===savedContactsRequestNumber&&Array.isArray(cached)&&cached.length){
      renderSavedContactsSnapshot(cached);
      setStatus("savedContactsStatus",english?"Showing saved contacts while refreshing…":"نمایش مخاطبان ذخیره‌شده؛ در حال همگام‌سازی…");
    }
  }catch(cacheError){console.warn("Cached contacts read:",cacheError);}
  try{
    const {data,error}=await retryRead("saved contacts",()=>getClient().from("contacts").select("contact_user_id,created_at").eq("user_id",myId).order("created_at",{ascending:false}));
    if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;if(error)throw error;
    let phoneData=[];
    try{
      const phoneResult=await retryRead("phone contact names",()=>getClient().from("user_phone_contacts").select("display_name,matched_user_id").eq("user_id",myId).not("matched_user_id","is",null).limit(5000));
      phoneData=phoneResult.data||[];
    }catch(e){console.warn("Imported phone contact names:",e);}
    const importedNames=new Map();
    for(const item of phoneData){if(item.matched_user_id&&!importedNames.has(String(item.matched_user_id)))importedNames.set(String(item.matched_user_id),item.display_name);}
    let profilesById=new Map(),profilesLoaded=true;
    try{profilesById=await getContactProfiles((data||[]).map(item=>item.contact_user_id));}
    catch(e){profilesLoaded=false;console.warn("Saved contact profiles:",e);}
    if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;
    const snapshot=[];
    const seenContacts=new Set();
    (data||[]).forEach(item=>{
      const contactId=String(item.contact_user_id||"");if(!contactId||seenContacts.has(contactId))return;seenContacts.add(contactId);
      const p=profilesById.get(contactId)||{};
      const contact={user_id:contactId,display_name:importedNames.get(contactId)||p.display_name||(english?"Farnaz user":"کاربر فرناز"),avatar_url:p.avatar_url||"",phone:p.phone||""};
      snapshot.push({contact,subtitle:p.phone?formatContactPhone(p.phone):(english?"Farnaz member":"عضو فرناز"),date:item.created_at?new Date(item.created_at).toLocaleDateString(english?"en":"fa-IR"):""});
    });
    renderSavedContactsSnapshot(snapshot);
    if(profilesLoaded){try{await window.FarnazLocalStore?.saveSnapshot(myId,"contacts",snapshot);}catch(cacheError){console.warn("Cached contacts save:",cacheError);}}
    setStatus("savedContactsStatus",snapshot.length?"":(english?"No saved Farnaz contacts yet.":"هنوز مخاطب عضو فرنازی ذخیره نشده است."));
    await refreshUnmatchedPhoneContacts();
    return true;
  }catch(e){
    if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;
    console.error("Saved contacts:",e);
    setStatus("savedContactsStatus",(english?"Could not load saved contacts: ":"بارگذاری مخاطبان ناموفق بود: ")+e.message,true);
    await refreshUnmatchedPhoneContacts();
    return false;
  }
}
function parseVCardContacts(text,countryCode){
  const normalized=String(text||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  const unfolded=normalized.replace(/\n[ \t]/g,"");
  const cards=unfolded.split(/BEGIN:VCARD/i).slice(1),results=[],seen=new Set();
  for(const rawCard of cards){
    const body=rawCard.split(/END:VCARD/i)[0]||"",lines=body.split("\n");
    let name="";const phones=[];
    for(const line of lines){
      const colon=line.indexOf(":");if(colon<0)continue;
      const key=line.slice(0,colon).split(";")[0].split(".").pop().toUpperCase();
      let value=line.slice(colon+1).trim().replace(/^tel:/i,"");
      value=value.replace(/\\n/gi," ").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\");
      if(key==="FN"&&!name)name=value;
      if(key==="N"&&!name){const parts=value.split(";").map(part=>part.trim()).filter(Boolean);name=[parts[1],parts[0],parts.slice(2).join(" ")].filter(Boolean).join(" ");}
      if(key==="TEL"&&value){const phone=normalizePhone(value,countryCode);if(/^\+[1-9]\d{7,14}$/.test(phone))phones.push(phone);}
    }
    if(!name)name=english?"Phone contact":"مخاطب گوشی";
    for(const phone of phones){if(seen.has(phone))continue;seen.add(phone);results.push({display_name:name.slice(0,120),phone});}
  }
  return results;
}
async function syncSelectedPhoneContacts(contacts,button){
  if(!currentUser)return;
  const myId=currentUser.id;
  const valid=(contacts||[]).filter(c=>c?.phone&&/^\+[1-9]\d{7,14}$/.test(c.phone));
  const unique=[...new Map(valid.map(c=>[c.phone,c])).values()];
  if(!unique.length)throw new Error(english?"No valid phone numbers were selected.":"از مخاطبان انتخاب‌شده شماره تلفن معتبری دریافت نشد.");
  const {data,error}=await getClient().rpc("sync_farnaz_phone_contacts",{p_contacts:unique});
  if(error)throw error;
  if(currentUser?.id!==myId)return;
  const result=Array.isArray(data)?data[0]:(data||{});
  await refreshSavedContacts();
  setStatus("phoneContactsImportStatus",english
    ?`Sync complete: ${result.processed??unique.length} numbers processed, ${result.matched??0} matched with Farnaz accounts, ${result.unmatched??0} not registered.`
    :`همگام‌سازی انجام شد: ${result.processed??unique.length} شماره پردازش شد؛ ${result.matched??0} مورد با حساب‌های فرناز تطبیق یافت و ${result.unmatched??0} مورد هنوز عضو نیست.`);
}
async function syncPhoneContactsFromPicker(){
  const button=$("pickPhoneContactsButton");
  if(!currentUser){setStatus("phoneContactsImportStatus",english?"Sign in first.":"ابتدا وارد حساب فرناز شو.",true);return;}
  if(!window.isSecureContext){setStatus("phoneContactsImportStatus",english?"Contact access requires a secure HTTPS connection.":"دسترسی به مخاطبان به اتصال امن HTTPS نیاز دارد.",true);return;}
  if(!navigator.contacts?.select){
    setStatus("phoneContactsImportStatus",english
      ?"Safari has not enabled Contact Picker API. Open iPhone Settings → Safari → Advanced → Feature Flags, enable Contact Picker API, fully close and reopen Safari, then return and tap this button again."
      :"قابلیت انتخاب مخاطب Safari هنوز فعال نیست. در آیفون برو به Settings ← Safari ← Advanced ← Feature Flags، گزینه Contact Picker API را روشن کن، Safari را کامل ببند و دوباره باز کن؛ سپس به فرناز برگرد و همین دکمه را بزن.",true);
    return;
  }
  button.disabled=true;
  setStatus("phoneContactsImportStatus",english?"Choose the contacts you want to share with Farnaz…":"مخاطبانی را که می‌خواهی با فرناز به اشتراک بگذاری انتخاب کن…");
  try{
    const picked=await navigator.contacts.select(["name","tel"],{multiple:true});
    const contacts=[],country=$("phoneContactsCountry")?.value||"98";
    for(const item of picked||[]){
      const name=Array.isArray(item.name)?item.name[0]:item.name;
      for(const tel of Array.isArray(item.tel)?item.tel:[item.tel]){
        const phone=normalizePhone(tel,country);
        if(/^\+[1-9]\d{7,14}$/.test(phone))contacts.push({display_name:String(name||"").trim().slice(0,120)||(english?"Phone contact":"مخاطب گوشی"),phone});
      }
    }
    await syncSelectedPhoneContacts(contacts,button);
  }catch(e){
    if(e?.name==="AbortError"){setStatus("phoneContactsImportStatus",english?"Contact selection cancelled.":"انتخاب مخاطبان لغو شد.");return;}
    console.error("Phone contact picker:",e);
    setStatus("phoneContactsImportStatus",(english?"Could not sync selected contacts: ":"همگام‌سازی مخاطبان انتخاب‌شده ناموفق بود: ")+(e?.message||String(e)),true);
  }finally{button.disabled=false;}
}
async function handlePhoneContactsFile(event){
  const input=event?.target||$("phoneContactsFile"),file=input?.files?.[0];if(!file||!currentUser)return;
  const button=$("importPhoneContactsButton"),myId=currentUser.id;
  button.disabled=true;setStatus("phoneContactsImportStatus",english?"Reading VCF file…":"در حال خواندن فایل VCF…");
  try{
    if(file.size>15*1024*1024)throw new Error(english?"VCF file must be 15 MB or smaller.":"حجم فایل VCF باید حداکثر ۱۵ مگابایت باشد.");
    const contacts=parseVCardContacts(await file.text(),$("phoneContactsCountry").value);
    if(!contacts.length)throw new Error(english?"No valid phone numbers were found in this VCF file.":"شماره تلفن معتبری در فایل VCF پیدا نشد.");
    await syncSelectedPhoneContacts(contacts,button);
  }catch(e){
    console.error("Phone contacts import:",e);
    setStatus("phoneContactsImportStatus",(english?"Could not sync contacts: ":"همگام‌سازی مخاطبان ناموفق بود: ")+e.message,true);
  }finally{button.disabled=false;if(input)input.value="";}
}
function initPhoneContactsImport(){
  const input=$("phoneContactsFile");if(input&&!input.dataset.bound){input.dataset.bound="1";input.addEventListener("change",handlePhoneContactsFile);}
}
let conversationListRequestNumber=0;
function renderConversationSnapshot(snapshot,myId){
  const list=$("conversationList");if(!list||!Array.isArray(snapshot))return;
  const visible=snapshot.filter(c=>conversationView==="archived"?!!c.pref?.archived:!c.pref?.archived)
    .sort((a,b)=>Number(!!b.pref?.pinned)-Number(!!a.pref?.pinned)||new Date(b.created_at)-new Date(a.created_at));
  list.replaceChildren();
  if(!visible.length){
    setStatus("inboxStatus",conversationView==="archived"?(english?"No archived conversations.":"گفتگوی آرشیوشده‌ای وجود ندارد."):(english?"No conversations yet. Start one from Contacts.":"هنوز گفتگویی نداری؛ از بخش مخاطبان گفتگوی جدید بساز."));
    return;
  }
  for(const c of visible){
    const p=c.profile||{},pref=c.pref||{};
    const name=p.display_name||(english?"Farnaz user":"مخاطب فرناز");
    const preview=(c.lastSender===myId?(english?"You: ":"شما: "):"")+(pref.pinned?"📌 ":"")+(pref.archived?"🗄 ":"")+c.lastMessage;
    const contact={user_id:c.user_id,display_name:name,avatar_url:p.avatar_url||""};
    const card=document.createElement("div");card.className="conversation-card"+(pref.pinned?" pinned":"")+(pref.archived?" archived":"");
    const btn=makeContactButton(contact,preview,new Date(c.created_at).toLocaleString(english?"en":"fa-IR"));
    btn.addEventListener("contextmenu",e=>{e.preventDefault();showConversationActions(card,c.user_id);});
    let hold;btn.addEventListener("pointerdown",()=>{hold=setTimeout(()=>{btn.dataset.suppressOpen="1";showConversationActions(card,c.user_id);},550);});
    ["pointerup","pointercancel","pointerleave"].forEach(ev=>btn.addEventListener(ev,()=>clearTimeout(hold)));
    let sx=0;btn.addEventListener("touchstart",e=>{sx=e.changedTouches[0].clientX;},{passive:true});
    btn.addEventListener("touchend",e=>{if(Math.abs(e.changedTouches[0].clientX-sx)>65){btn.dataset.suppressOpen="1";showConversationActions(card,c.user_id);}},{passive:true});
    card.appendChild(btn);list.appendChild(card);
  }
  setStatus("inboxStatus","");
  applyConversationSearch();
}
async function refreshConversationList(){
  if(!currentUser)return;
  const request=++conversationListRequestNumber,myId=currentUser.id;
  const list=$("conversationList");if(!list)return;
  let cachedSnapshot=null;
  try{
    cachedSnapshot=await window.FarnazLocalStore?.getSnapshot(myId,"inbox");
    if(currentUser?.id===myId&&request===conversationListRequestNumber&&Array.isArray(cachedSnapshot)&&cachedSnapshot.length){
      conversationPrefs=new Map(cachedSnapshot.map(c=>[String(c.user_id),c.pref||{}]));
      renderConversationSnapshot(cachedSnapshot,myId);
      setStatus("inboxStatus",english?"Showing saved conversations while refreshing…":"نمایش گفتگوهای ذخیره‌شده؛ در حال همگام‌سازی…");
    }
  }catch(cacheError){console.warn("Cached inbox read:",cacheError);}
  try{
    const prefResult=await retryRead("conversation preferences",()=>getClient().from("conversation_preferences").select("*").eq("user_id",myId));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    conversationPrefs=new Map((prefResult.data||[]).map(p=>[String(p.contact_user_id),p]));
  }catch(prefError){
    console.warn("Conversation preferences:",prefError);
    if(!conversationPrefs.size)setConnectionBanner(english?"Some conversation settings could not load. Retrying…":"بخشی از تنظیمات گفتگو بارگذاری نشد؛ دوباره تلاش می‌کنیم.");
  }
  setStatus("inboxStatus",english?"Loading conversations...":"در حال بارگذاری گفتگوها...");
  try{
    const {data,error}=await retryRead("conversation list",()=>getClient().from("messages")
      .select("id,sender_id,receiver_id,body,created_at,message_type,attachment_name")
      .or("sender_id.eq."+myId+",receiver_id.eq."+myId)
      .order("created_at",{ascending:false}).limit(1000));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    if(error)throw error;
    const conversations=new Map();
    for(const m of data||[]){
      const id=String(m.sender_id===myId?m.receiver_id:m.sender_id||"");
      if(!id||id===myId||conversations.has(id))continue;
      const pref=prefFor(id);
      if(pref.hidden_at&&new Date(m.created_at)<=new Date(pref.hidden_at))continue;
      conversations.set(id,{user_id:id,lastMessage:m.body||((m.message_type||"text")==="image"?(english?"📷 Photo":"📷 عکس"):""),created_at:m.created_at,lastSender:m.sender_id,pref});
    }
    const entries=[...conversations.values()];
    let profilesById=new Map(),profilesLoaded=true;
    try{profilesById=await getContactProfiles(entries.map(c=>c.user_id));}catch(e){profilesLoaded=false;console.warn("Conversation contact profiles:",e);}
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    const snapshot=entries.map(c=>({...c,pref:prefFor(c.user_id),profile:profilesById.get(String(c.user_id))||{}}));
    renderConversationSnapshot(snapshot,myId);
    if(profilesLoaded){try{await window.FarnazLocalStore?.saveSnapshot(myId,"inbox",snapshot);}catch(cacheError){console.warn("Cached inbox save:",cacheError);}}
    return true;
  }catch(e){
    console.error("Inbox load:",e);
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    if(Array.isArray(cachedSnapshot)&&cachedSnapshot.length){
      renderConversationSnapshot(cachedSnapshot,myId);
      setStatus("inboxStatus",english?"Showing saved conversations; refresh failed.":"گفتگوهای ذخیره‌شده نمایش داده می‌شوند؛ به‌روزرسانی ناموفق بود.");
    }else setStatus("inboxStatus",(english?"Could not load conversations: ":"بارگذاری گفتگوها ناموفق بود: ")+e.message,true);
    return false;
  }
}
async function findRecipient(event){
  event.preventDefault();
  if(!currentUser){openAuth();return;}
  const value=$("recipientValue").value.trim();
  if(!value){setStatus("recipientStatus",english?"Enter an email or phone number.":"ایمیل یا شماره را وارد کن.",true);return;}
  const button=$("findRecipientBtn");button.disabled=true;
  $("foundContact").replaceChildren();
  setStatus("recipientStatus",english?"Searching...":"در حال جست‌وجو...");
  try{
    const client=getClient();let data,error;
    if(value.includes("@")){
      ({data,error}=await client.rpc("find_farnaz_user",{search_email:value}));
    }else{
      const phone=normalizePhone(value,$("recipientCountry").value);
      if(!/^\+[1-9]\d{7,14}$/.test(phone))
        throw new Error(english?"Enter a valid phone number.":"شماره تلفن معتبر وارد کن.");
      ({data,error}=await client.rpc("find_farnaz_user_by_phone",{search_phone:phone}));
    }
    if(error)throw error;
    if(!data||!data.length){
      setStatus("recipientStatus",english?"No account found. Check the details.":"حسابی پیدا نشد؛ اطلاعات را بررسی کن.");return;
    }
    const r=data[0];
    const id=r.user_id||r.id;
    if(!id)throw new Error(english?"Search did not return a user ID.":"جست‌وجو شناسهٔ کاربر را برنگرداند.");
    if(id===currentUser.id){
      setStatus("recipientStatus",english?"You cannot message yourself.":"نمی‌توانی به حساب خودت پیام بدهی.",true);return;
    }
    const {error:saveError}=await client.from("contacts")
      .upsert({user_id:currentUser.id,contact_user_id:id},{onConflict:"user_id,contact_user_id",ignoreDuplicates:true});
    if(saveError)throw saveError;
    let profile=null;
    try{profile=await getContactProfile(id);}catch(e){console.warn(e);}
    const contact={
      user_id:id,
      display_name:r.display_name||profile?.display_name||(english?"Farnaz user":"کاربر فرناز"),
      avatar_url:r.avatar_url||profile?.avatar_url||"",
      phone:r.phone||profile?.phone||""
    };
    $("foundContact").appendChild(makeContactButton(
      contact,english?"Tap to open a private conversation":"برای باز کردن گفتگوی خصوصی بزن"
    ));
    setStatus("recipientStatus",english?"Contact found and saved.":"مخاطب پیدا و ذخیره شد.");
    previousPage="contactsPage";
    await refreshSavedContacts();
  }catch(e){
    console.error("Find recipient:",e);
    setStatus("recipientStatus",(english?"Search failed: ":"جست‌وجوی مخاطب ناموفق بود: ")+e.message,true);
  }finally{button.disabled=false;}
}


/* Track the iOS/Android visual viewport so chat composers follow the keyboard. */
(function installChatKeyboardLayout(){
  const vv=window.visualViewport;
  let blurTimer=null;
  function activeChat(){
    return document.body.classList.contains("chat-mode") ||
      document.body.classList.contains("spaces-chat-mode");
  }
  function syncViewport(){
    if(!activeChat())return;
    const height=vv?vv.height:window.innerHeight;
    const offset=vv?vv.offsetTop:0;
    document.documentElement.style.setProperty("--chat-viewport-height",Math.max(180,height)+"px");
    document.documentElement.style.setProperty("--chat-viewport-offset",Math.max(0,offset)+"px");
    const keyboardOpen=!!vv&&(window.innerHeight-height>120);
    document.body.classList.toggle("keyboard-open",keyboardOpen);
    if(keyboardOpen){
      requestAnimationFrame(()=>{
        const privateList=document.getElementById("messageList");
        const groupList=document.getElementById("spaceMessages");
        if(document.body.classList.contains("chat-mode")&&privateList)privateList.scrollTop=privateList.scrollHeight;
        if(document.body.classList.contains("spaces-chat-mode")&&groupList)groupList.scrollTop=groupList.scrollHeight;
      });
    }
  }
  function clearViewport(){
    if(activeChat())return;
    document.documentElement.style.removeProperty("--chat-viewport-height");
    document.documentElement.style.removeProperty("--chat-viewport-offset");
    document.body.classList.remove("keyboard-open");
  }
  document.addEventListener("focusin",event=>{
    if(event.target?.matches("#messageText,#spaceText")){
      clearTimeout(blurTimer);
      requestAnimationFrame(syncViewport);
      setTimeout(syncViewport,80);
      setTimeout(syncViewport,220);
    }
  });
  document.addEventListener("focusout",event=>{
    if(event.target?.matches("#messageText,#spaceText")){
      clearTimeout(blurTimer);
      blurTimer=setTimeout(()=>{
        if(!document.activeElement?.matches("#messageText,#spaceText"))syncViewport();
      },180);
    }
  });
  vv?.addEventListener("resize",syncViewport);
  vv?.addEventListener("scroll",syncViewport);
  window.addEventListener("resize",syncViewport);
  document.addEventListener("click",event=>{
    if(event.target.closest("#backToChats,#backSpaces")||event.target.closest(".nav-button")){
      setTimeout(clearViewport,0);
    }
  });
  const originalNavigate=window.navigate;
  if(typeof originalNavigate==="function"&&!originalNavigate.__keyboardViewportWrapped){
    const wrapped=function(id){originalNavigate(id);if(id==="chatPage"||id==="spacesPage")requestAnimationFrame(syncViewport);else clearViewport();};
    wrapped.__keyboardViewportWrapped=true;
    window.navigate=wrapped;
  }
  
  // Keep email sign-up/sign-in wired to the active core script loaded by index.html.
  const authForm=$("authForm");
  if(authForm){
    authForm.addEventListener("submit",async event=>{
      event.preventDefault();
      const button=$("authSubmit"),email=$("authEmail").value.trim();
      const password=$("authPassword").value,name=$("authName").value.trim();
      if(!button)return;
      button.disabled=true;
      const authStartedAt=performance.now();
      setStatus("authStatus",english?"Connecting to server…":"در حال اتصال به سرور…");
      const slowAuthTimer=setTimeout(()=>{
        if(button.disabled)setStatus("authStatus",english
          ?"The connection is taking longer than expected. Keep this page open…"
          :"اتصال بیشتر از حد معمول طول کشیده؛ صفحه را باز نگه دار…");
      },5000);
      try{
        const client=getClient();
        let result;
        if(authMode==="signup"){
          result=await client.auth.signUp({
            email,password,
            options:{
              emailRedirectTo:"https://kalaghkocholo.github.io/Farnaz/",
              data:{display_name:name}
            }
          });
          if(result.error)throw result.error;
          if(!result.data.session){
            setStatus("authStatus",english
              ?"Sign-up submitted. Confirm your email, then sign in."
              :"ثبت‌نام انجام شد. ایمیلت را تأیید کن و سپس وارد شو.");
            return;
          }
        }else{
          result=await client.auth.signInWithPassword({email,password});
          if(result.error)throw result.error;
        }
        console.info("Farnaz auth response time (ms):",Math.round(performance.now()-authStartedAt));
        if(!result.data.user)throw new Error("اطلاعات حساب دریافت نشد.");
        // Authentication succeeded: enter the app before loading optional profile/chat data.
        // A later conversation or realtime failure must not be reported as a failed login.
        const authenticatedUser=result.data.user;
        // Set the authenticated user before navigating. navigate() deliberately
        // opens the auth form when currentUser is empty; navigating first used to
        // reopen the form and erase the email/password immediately after login.
        currentUser=authenticatedUser;
        closeAuth();
        navigate("chatsPage");
        // Authentication has succeeded. Keep profile and inbox initialization
        // outside the authentication error path so they cannot undo a valid login.
        setStatus("authStatus","");
        setConnectionBanner(english?"Signed in. Loading your conversations…":"ورود موفق بود؛ در حال بارگذاری گفتگوها…");
        // Profile data is independent from authentication. Do not let a slow
        // profile query block realtime or other screens after successful sign-in.
        void showUser(authenticatedUser);
        try{
          await subscribeToMessages();
          // Reconcile inbox and contacts after auth and realtime setup. The
          // navigation-triggered refresh may have been superseded during startup.
          const initialDataResults=await Promise.allSettled([refreshConversationList(),refreshSavedContacts()]);
          const initialDataFailure=initialDataResults.find(result=>result.status==="rejected"||result.value===false);
          if(initialDataFailure)throw initialDataFailure.reason;
          setConnectionBanner("",false);
        }catch(connectionError){
          console.error("Post-login realtime initialization:",connectionError);
          setConnectionBanner(english
            ?"You are signed in, but live updates could not start. Farnaz will retry."
            :"ورود موفق است، اما اتصال زنده برقرار نشد؛ فرناز دوباره تلاش می‌کند.");
          scheduleReconnect();
        }
      }catch(error){
        console.error("Farnaz authentication error:",error);
        const message=String(error?.message||error||"Unknown error");
        const code=String(error?.code||"").toLowerCase();
        const status=Number(error?.status||error?.statusCode||0);
        const isCredentialsError=code==="invalid_credentials"||/invalid login credentials|invalid email or password/i.test(message);
        const isNetwork=error?.name==="TypeError"||error?.name==="TimeoutError"||
          /failed to fetch|fetch failed|network|load failed|timeout|connection|did not respond|request could not reach|aborted/i.test(message);
        const safeMessage=isCredentialsError
          ?(english?"Email or password is incorrect. Check both and try again.":"ایمیل یا رمز عبور درست نیست؛ هر دو را بررسی کن و دوباره تلاش کن.")
          :isNetwork
            ?(english?"Could not complete the request to Supabase. Check your connection and retry.":"درخواست به سوپابیس کامل نشد؛ اتصال را بررسی کن و دوباره تلاش کن.")
            :(status===429
              ?(english?"Too many attempts. Wait a little and try again.":"تعداد تلاش‌ها زیاد بوده؛ کمی صبر کن و دوباره تلاش کن.")
              :message);
        setStatus("authStatus",(english?"Sign-up/sign-in failed: ":"ثبت‌نام یا ورود ناموفق بود: ")+safeMessage,true);
      }finally{
        clearTimeout(slowAuthTimer);
        button.disabled=false;
      }
    });
  }
  // Restore the persisted Supabase session on app launch. Persisting a session is
  // not enough by itself: currentUser starts as null on every page reload.
  async function restoreSavedSession(){
    let client=null;
    try{
      client=getClient();
      const {data,error}=await withTimeout(client.auth.getSession(),9000,"saved session restore");
      if(error)throw error;
      const session=data?.session;
      if(!session?.user){
        document.body.dataset.authState="guest";
        return;
      }
      currentUser=session.user;
      document.body.dataset.authState="authenticated";
      closeAuth();
      navigate("chatsPage");
      setConnectionBanner(english?"Restoring your session…":"در حال بازیابی نشست ورود…");
      // Profile loading is independent; it must not hold session restoration.
      void showUser(session.user);
      try{
        await subscribeToMessages();
        // Reconcile inbox and contacts after restoring the saved session.
        const initialDataResults=await Promise.allSettled([refreshConversationList(),refreshSavedContacts()]);
        const initialDataFailure=initialDataResults.find(result=>result.status==="rejected"||result.value===false);
        if(initialDataFailure)throw initialDataFailure.reason;
        setConnectionBanner("",false);
      }catch(connectionError){
        console.error("Restored-session initialization:",connectionError);
        setConnectionBanner(english
          ?"You are signed in, but some account data could not load. Check your connection; Farnaz will retry."
          :"نشست ورود بازیابی شد، اما بارگذاری بخشی از اطلاعات حساب ناموفق بود. اتصال را بررسی کن؛ فرناز دوباره تلاش می‌کند.");
        scheduleReconnect();
      }
    }catch(error){
      // Do not erase a potentially valid session on a transient network failure.
      // A later explicit sign-in can still use the existing credentials.
      console.warn("Farnaz saved-session restore failed:",{
        name:error?.name||"Error",
        status:error?.status||error?.statusCode||null,
        code:error?.code||null,
        message:String(error?.message||error||"Unknown error")
      });
      document.body.dataset.authState="guest";
      setConnectionBanner(english
        ?"Farnaz could not restore your saved session. Check your connection and try signing in again."
        :"بازیابی نشست ورود کامل نشد. اتصال را بررسی کن و دوباره برای ورود تلاش کن.");
      if(/refresh token.*(invalid|not found|expired)|invalid refresh token|session not found/i.test(String(error?.message||""))){
        try{if(client)await client.auth.signOut({scope:"local"});}catch(_){}
      }
    }
  }
  // The HTML loader calls this only after all required feature modules are ready.
  // This prevents the restored-session event from firing before spaces/calls listeners exist.
  let farnazBootStarted=false;
  window.FarnazBoot=()=>{
    if(farnazBootStarted)return;
    farnazBootStarted=true;
    void restoreSavedSession();
  };
  document.addEventListener("DOMContentLoaded",()=>{if(activeChat())syncViewport();});
})();
