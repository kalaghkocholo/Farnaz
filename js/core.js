"use strict";

window.FARNAZ_CONFIG = {
  supabaseUrl: "https://iemykhluluoymsbqpjsn.supabase.co",
  supabasePublishableKey: "sb_publishable_LhUmVjXJlazgYRtEvXna6g_GGKxi_kC"
};

let english=false,authMode="signup",farnazClient=null,currentUser=null;
let currentProfileName="",currentAvatarUrl="",currentPhone="";
let currentChatUser=null,messageSubscription=null,reconnectTimer=null,reconnectAttempts=0;
let profileRequestNumber=0,chatRequestNumber=0,previousPage="chatsPage";
let conversationView="active",conversationPrefs=new Map(),messageLoadedCount=50,messageHasMore=false;
let selectedMessageIds=new Set(),replyTarget=null,editingMessageId=null,messageSelectionMode=false,preEditDraft="";
let recordedVoiceFile=null,recordedVoiceUrl=null,mediaRecorder=null,recordedAudioChunks=[],recordingStream=null;

const $=id=>document.getElementById(id);

const APPEARANCE_DEFAULTS={theme:"dark",accent:"#50e3c2",fontSize:"medium",fontFamily:"system",fontColor:"auto",outgoingBubble:"auto",incomingBubble:"auto"};
const APPEARANCE_KEY="farnaz-appearance-v1";
function readAppearanceSettings(){
  try{return {...APPEARANCE_DEFAULTS,...JSON.parse(localStorage.getItem(APPEARANCE_KEY)||"{}")};}
  catch(_){return {...APPEARANCE_DEFAULTS};}
}
let appearanceSettings=readAppearanceSettings();
function applyAppearanceSettings(){
  const root=document.documentElement;
  let theme=appearanceSettings.theme||"dark";
  if(theme==="system")theme=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";
  document.body.dataset.theme=theme;
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
  const outgoingColor=outgoing==="auto"?accent:outgoing;
  const incomingColor=incoming==="auto"?(accent.toLowerCase()==="#ffffff"?"#eef1f5":accent.toLowerCase()==="#000000"?"#252525":"color-mix(in srgb, "+accent+" 15%, var(--panel2))"):incoming;
  root.style.setProperty("--my-message-bg",outgoingColor);
  root.style.setProperty("--my-message-ink",readableInk(outgoingColor));
  root.style.setProperty("--their-message-bg",incomingColor);
  root.style.setProperty("--their-message-ink",incoming==="auto"&&accent!=="#ffffff"&&accent!=="#000000"?(theme==="light"?"#172237":"#f7f9fc"):readableInk(incomingColor));
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
if("serviceWorker" in navigator && location.protocol!=="file:"){
  navigator.serviceWorker.register("./service-worker.js").then(reg=>{window.farnazServiceWorkerRegistration=reg;})
    .catch(error=>console.warn("Farnaz service worker registration:",error));
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
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
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
    /network|fetch failed|failed to fetch|timeout|timed out|temporar|connection reset|connection closed|load failed|offline|gateway|too many requests/.test(message);
}
const recoveryDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retryRead(label,operation,maxAttempts=3){
  let lastError;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      if(typeof navigator!=="undefined"&&navigator.onLine===false){
        setConnectionBanner(english?"You are offline. Farnaz will reconnect automatically.":"اتصال اینترنت قطع است؛ فرناز پس از وصل‌شدن خودکار تلاش می‌کند.");
        throw new Error("NETWORK_OFFLINE");
      }
      const result=await operation();
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
    if(currentChatUser&&document.body.classList.contains("chat-mode")&&typeof loadMessages==="function"){
      await loadMessages(false,true);
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
  toggleNewChatPopover();
}
function toggleNewChatPopover(force){
  const panel=$("newChatPopover"),button=$("topNewChatButton");
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
  if(pageId!=="chatPage"){document.documentElement.style.removeProperty("--chat-viewport-offset");document.documentElement.style.removeProperty("--chat-viewport-height");}
  document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.page===pageId));
  $("bottomNav").classList.toggle("visible",pageId!=="homePage"&&pageId!=="chatPage");
  $("topNewChatButton").classList.toggle("visible",pageId==="chatsPage");
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
function openAuth(){
  $("authBox").style.display="flex";setStatus("authStatus","");
  $("authName").value="";$("authEmail").value="";$("authPassword").value="";
  updateAuthTexts();
}
function closeAuth(){$("authBox").style.display="none";}
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
    contactsIntro:["مخاطبان ذخیره‌شده را انتخاب کن یا از جست‌وجوی پایین حساب جدیدی پیدا کن.","Choose a saved contact or find a new account using the search control below."],
    recipientLabel:["ایمیل یا شماره تلفن با کد کشور","Email or phone with country code"],
    recipientCountryLabel:["کد کشور شماره تلفن","Phone country code"],
    findRecipientBtn:["پیدا کردن مخاطب","Find contact"],foundHeading:["نتیجه جست‌وجو","Search result"],
    savedContactsStatus:["",""],
    profilePhoneCountryLabel:["کد کشور شماره تلفن","Phone country code"],
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
  $("topNewChatButton").title=english?"New chat":"گفتگوی جدید";
  $("topNewChatButton").setAttribute("aria-label",english?"New chat":"گفتگوی جدید");
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
  $("userName").textContent=currentProfileName||(english?"Farnaz user":"کاربر فرناز");
  $("userEmail").textContent=user.email||"";
  $("userPhone").textContent=currentPhone||"";
  renderAvatar($("userAvatar"),currentAvatarUrl,$("userName").textContent);
}
async function showUser(user){
  const request=++profileRequestNumber;
  currentUser=user;renderUser(user,user.user_metadata?.display_name||"");
  window.dispatchEvent(new CustomEvent("farnaz-auth-user",{detail:{userId:user.id}}));
  setStatus("profileStatus",english?"Loading profile...":"در حال بارگذاری پروفایل...");
  try{
    const {data,error}=await getClient().from("profiles")
      .select("id,display_name,avatar_url,phone").eq("id",user.id).maybeSingle();
    if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
    if(error)throw error;
    let profile=data;
    if(!profile){
      const fallbackName=(user.user_metadata?.display_name||user.email?.split("@")[0]||"Farnaz user").trim();
      const created=await getClient().from("profiles")
        .upsert({id:user.id,display_name:fallbackName,phone:user.phone||null},{onConflict:"id"})
        .select("id,display_name,avatar_url,phone").single();
      if(created.error)throw created.error;
      profile=created.data;
    }
    currentProfileName=profile?.display_name||user.user_metadata?.display_name||"";
    currentAvatarUrl=profile?.avatar_url||"";currentPhone=profile?.phone||"";
    renderUser(user,currentProfileName);
    $("profileNameInput").value=currentProfileName;
    $("profilePhoneInput").value=currentPhone;
    setPhoneCountry("profilePhoneCountry",currentPhone);
    setStatus("profileStatus",english?"Profile loaded.":"پروفایل بارگذاری شد.");
  }catch(e){
    console.error("Profile read:",e);
    setStatus("profileStatus",(english?"Could not load profile: ":"بارگذاری پروفایل ناموفق بود: ")+e.message,true);
  }
}
function showGuest(){
  profileRequestNumber++;currentUser=null;currentProfileName="";currentAvatarUrl="";currentPhone="";
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
async function saveProfile(event){
  event.preventDefault();if(!currentUser)return;
  const name=$("profileNameInput").value.trim();
  const phone=normalizePhone($("profilePhoneInput").value,$("profilePhoneCountry").value);
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
  button.disabled=true;setStatus("profileStatus",english?"Saving profile...":"در حال ذخیره پروفایل...");
  try{
    const client=getClient();let avatarUrl=currentAvatarUrl;
    if(file){
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const path=currentUser.id+"/avatar-"+Date.now()+"."+ext;
      const {error}=await client.storage.from("avatars").upload(path,file,{contentType:file.type,upsert:false});
      if(error)throw error;
      avatarUrl=client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }
    const {data,error}=await client.from("profiles")
      .upsert({id:currentUser.id,display_name:name,phone:phone||null,avatar_url:avatarUrl||null},{onConflict:"id"})
      .select("id,display_name,phone,avatar_url").single();
    if(error)throw error;
    currentProfileName=data.display_name||name;currentPhone=data.phone||"";
    currentAvatarUrl=data.avatar_url||"";
    setPhoneCountry("profilePhoneCountry",currentPhone);
    const {error:metadataError}=await client.auth.updateUser({data:{display_name:currentProfileName}});
    if(metadataError)console.warn("Auth metadata update:",metadataError);
    renderUser(currentUser,currentProfileName);$("avatarFile").value="";
    setStatus("profileStatus",english?"Profile saved.":"پروفایل ذخیره شد.");
  }catch(e){
    console.error("Profile save:",e);
    setStatus("profileStatus",(english?"Could not save profile: ":"ذخیره پروفایل ناموفق بود: ")+e.message,true);
  }finally{button.disabled=false;}
}
async function logout(){
  $("logoutButton").disabled=true;
  try{
    const {error}=await getClient().auth.signOut();if(error)throw error;
    await stopMessageSubscription();showGuest();
  }catch(e){
    setStatus("profileStatus",(english?"Sign out failed: ":"خروج ناموفق بود: ")+e.message,true);
  }finally{$("logoutButton").disabled=false;}
}
async function stopMessageSubscription(){
  if(!messageSubscription||!farnazClient)return;
  const ch=messageSubscription;messageSubscription=null;
  try{await farnazClient.removeChannel(ch);}catch(e){console.warn(e);}
}
async function getContactProfile(id){
  const {data,error}=await getClient().rpc("get_farnaz_user_profile",{search_user_id:id});
  if(error)throw error;
  return Array.isArray(data)?(data[0]||null):(data||null);
}

let contactInfoDialog=null,contactInfoBlocked=false,contactInfoRequest=0;
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
    el.addEventListener("click",openContactInfo);
    el.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openContactInfo();}});
  });
  return modal;
}
function closeContactInfo(){if(contactInfoDialog)contactInfoDialog.hidden=true;}
function contactInfoText(fa,en){return english?en:fa;}
function addContactInfoAction(label,icon,handler){
  const button=document.createElement("button");button.type="button";button.className="contact-info-action";
  const glyph=document.createElement("span");glyph.className="contact-info-action-icon";glyph.textContent=icon;
  const text=document.createElement("span");text.textContent=label;button.append(glyph,text);button.addEventListener("click",handler);$("contactInfoActions").appendChild(button);
}
function searchCurrentConversation(){
  closeContactInfo();
  const term=prompt(contactInfoText("جست‌وجو در پیام‌های بارگذاری‌شده:","Search loaded messages:"));
  if(!term?.trim())return;
  const messages=[...$("messageList").querySelectorAll(".message")];
  messages.forEach(item=>item.classList.remove("contact-info-search-match"));
  const found=messages.find(item=>item.textContent.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()));
  if(found){found.classList.add("contact-info-search-match");found.scrollIntoView({behavior:"smooth",block:"center"});}
  else alert(contactInfoText("عبارت در پیام‌های بارگذاری‌شده پیدا نشد.","No match in the messages currently loaded."));
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
  addContactInfoAction(contactInfoText("تماس صوتی","Audio call"),"☎",()=>{closeContactInfo();startCall("audio");});
  addContactInfoAction(contactInfoText("تماس تصویری","Video call"),"▣",()=>{closeContactInfo();startCall("video");});
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
      $("contactInfoPhone").textContent=(english?"Phone: ":"شماره تلفن: ")+profileResult.phone;
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

function openChat(contact,fromPage="chatsPage"){
  ensureContactInfoDialog();
  currentChatUser=contact;previousPage=fromPage;
  $("conversationTitle").textContent=contact.display_name||(english?"Farnaz user":"مخاطب فرناز");
  $("chatSubtitle").textContent=english?"Private conversation":"گفتگوی خصوصی";
  renderAvatar($("chatAvatar"),contact.avatar_url||"",$("conversationTitle").textContent);
  setStatus("sendMessageStatus","");
  navigate("chatPage");loadMessages();
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
async function refreshSavedContacts(){
  const list=$("savedContactsList");if(!list||!currentUser)return;
  const myId=currentUser.id;
  list.replaceChildren();
  setStatus("savedContactsStatus",english?"Loading saved contacts...":"در حال بارگذاری مخاطبان ذخیره‌شده...");
  try{
    const {data,error}=await retryRead("saved contacts",()=>getClient().from("contacts")
      .select("contact_user_id,created_at")
      .eq("user_id",myId).order("created_at",{ascending:false}));
    if(currentUser?.id!==myId)return;
    if(!data?.length){
      $("newChatContactsList")?.replaceChildren();filterSavedContactsForNewChat();
      setStatus("savedContactsStatus",english?"No saved contacts yet. Search using the button below.":"هنوز مخاطبی ذخیره نشده؛ از دکمه جست‌وجوی پایین استفاده کن.");
      return;
    }
    const profiles=await Promise.all(data.map(async item=>{
      try{return await getContactProfile(item.contact_user_id);}
      catch(e){console.warn("Saved contact profile:",e);return null;}
    }));
    if(currentUser?.id!==myId)return;
    const dropdownList=$("newChatContactsList");if(dropdownList)dropdownList.replaceChildren();
    const seenContacts=new Set();
    data.forEach((item,i)=>{
      const contactId=String(item.contact_user_id||"");if(!contactId||seenContacts.has(contactId))return;seenContacts.add(contactId);
      const p=profiles[i]||{};
      const contact={user_id:contactId,display_name:p.display_name||(english?"Farnaz user":"کاربر فرناز"),avatar_url:p.avatar_url||"",phone:p.phone||""};
      list.appendChild(makeContactButton(contact,p.phone||(english?"Saved contact":"مخاطب ذخیره‌شده"),
        new Date(item.created_at).toLocaleDateString(english?"en":"fa-IR"),"contactsPage"));
      if(dropdownList){const quick=makeContactButton(contact,p.phone||(english?"Saved contact":"مخاطب ذخیره‌شده"),"","chatsPage");quick.dataset.contactName=contact.display_name;dropdownList.appendChild(quick);}
    });
    filterSavedContactsForNewChat();
    setStatus("savedContactsStatus","");
  }catch(e){
    console.error("Saved contacts:",e);
    setStatus("savedContactsStatus",(english?"Could not load saved contacts: ":"بارگذاری مخاطبان ناموفق بود: ")+e.message,true);
  }
}
let conversationListRequestNumber=0;
async function refreshConversationList(){
  if(!currentUser)return;
  const request=++conversationListRequestNumber;
  const myId=currentUser.id;
  try{
    const prefResult=await retryRead("conversation preferences",()=>getClient().from("conversation_preferences").select("*").eq("user_id",myId));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    conversationPrefs=new Map((prefResult.data||[]).map(p=>[String(p.contact_user_id),p]));
  }catch(prefError){
    console.warn("Conversation preferences:",prefError);
    if(!conversationPrefs.size)setConnectionBanner(english?"Some conversation settings could not load. Retrying…":"بخشی از تنظیمات گفتگو بارگذاری نشد؛ دوباره تلاش می‌کنیم.");
  }

  const list=$("conversationList");if(!list||!currentUser||request!==conversationListRequestNumber)return;
  setStatus("inboxStatus",english?"Loading conversations...":"در حال بارگذاری گفتگوها...");
  try{
    const {data,error}=await retryRead("conversation list",()=>getClient().from("messages")
      .select("id,sender_id,receiver_id,body,created_at,message_type,attachment_name")
      .or("sender_id.eq."+myId+",receiver_id.eq."+myId)
      .order("created_at",{ascending:false}).limit(1000));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    const conversations=new Map();
    for(const m of data||[]){
      const id=String(m.sender_id===myId?m.receiver_id:m.sender_id||"");
      if(!id||id===myId||conversations.has(id))continue;
      const pref=prefFor(id);
      if(pref.hidden_at&&new Date(m.created_at)<=new Date(pref.hidden_at))continue;
      conversations.set(id,{user_id:id,lastMessage:m.body||((m.message_type||"text")==="image"?(english?"📷 Photo":"📷 عکس"):""),created_at:m.created_at,lastSender:m.sender_id});
    }
    list.replaceChildren();
    const entries=[...conversations.values()].filter(c=>conversationView==="archived"?prefFor(c.user_id).archived:!prefFor(c.user_id).archived)
      .sort((a,b)=>Number(prefFor(b.user_id).pinned)-Number(prefFor(a.user_id).pinned)||new Date(b.created_at)-new Date(a.created_at));
    if(!entries.length){setStatus("inboxStatus",conversationView==="archived"?(english?"No archived conversations.":"گفتگوی آرشیوشده‌ای وجود ندارد."):(english?"No conversations yet. Start one from Contacts.":"هنوز گفتگویی نداری؛ از بخش مخاطبان گفتگوی جدید بساز."));return;}
    setStatus("inboxStatus","");
    const profiles=await Promise.all(entries.map(async c=>{
      try{return await getContactProfile(c.user_id);}catch(e){console.warn("Contact profile:",e);return null;}
    }));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    entries.forEach((c,i)=>{
      const p=profiles[i]||{};
      const name=p.display_name||(english?"Farnaz user":"مخاطب فرناز");
      const pref=prefFor(c.user_id);
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
    });
  }catch(e){
    console.error("Inbox load:",e);
    setStatus("inboxStatus",(english?"Could not load conversations: ":"بارگذاری گفتگوها ناموفق بود: ")+e.message,true);
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
  document.addEventListener("DOMContentLoaded",()=>{if(activeChat())syncViewport();});
})();
