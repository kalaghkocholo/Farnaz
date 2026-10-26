import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const errors = [];
const read = (path) => {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    errors.push("Missing required file: " + path);
    return "";
  }
  return readFileSync(fullPath, "utf8");
};

function checkBalancedCss(path, source) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let comment = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (comment) {
      if (ch === "*" && next === "/") {
        comment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "*") {
      comment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "\`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth < 0) {
        errors.push(path + ": unexpected closing brace at character " + i);
        return;
      }
    }
  }
  if (comment) errors.push(path + ": unclosed CSS comment");
  if (quote) errors.push(path + ": unclosed CSS string");
  if (depth !== 0) errors.push(path + ": unbalanced braces (depth " + depth + ")");
}

const html = read("index.html");
const supabaseSdk = read("js/supabase-sdk.js");
const supabaseSdkVersion = read("js/supabase-sdk-version.txt").trim();
const supabaseSdkLicense = read("js/SUPABASE-SDK-LICENSE.txt");
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(supabaseSdkVersion)) {
  errors.push("js/supabase-sdk-version.txt does not contain a valid pinned SDK version");
}
if (!supabaseSdkLicense.includes("MIT License")) {
  errors.push("js/SUPABASE-SDK-LICENSE.txt is missing the SDK license notice");
}
if (!supabaseSdk.includes("createClient")) {
  errors.push("js/supabase-sdk.js does not appear to contain the Supabase browser SDK");
}
if (!html.includes('script.src="./js/supabase-sdk.js"')) {
  errors.push("index.html must load the locally vendored Supabase SDK");
}
if (html.includes("cdn.jsdelivr.net/npm/@supabase/supabase-js") || html.includes("unpkg.com/@supabase/supabase-js")) {
  errors.push("index.html must not depend on a remote Supabase SDK CDN");
}

const clientFiles = [
  "js/local-store.js",
  "js/core.js",
  "js/chat-menu-v5.js",
  "js/spaces.js",
  "js/calls.js",
  "service-worker.js",
  "styles.css",
  "spaces.css",
];
const sources = Object.fromEntries(clientFiles.map((path) => [path, read(path)]));

for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
  const tag = match[0];
  const isScript = /^<script\b/i.test(tag);
  const attr = isScript ? /\bsrc=["']([^"']+)["']/i : /\bhref=["']([^"']+)["']/i;
  const found = tag.match(attr);
  if (!found) continue;
  const url = found[1];
  if (/^(?:https?:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("#")) continue;
  const localPath = decodeURIComponent(url.split(/[?#]/, 1)[0]).replace(/^\.\//, "");
  if (!localPath || !existsSync(resolve(root, localPath))) {
    errors.push("index.html references missing local " + (isScript ? "script" : "stylesheet") + ": " + url);
  }
}

// The app's real script dependencies are injected by a runtime loader, so the
// ordinary <script src> scan above cannot see them. Validate those paths too.
const loader = html.match(/const (?:featureScripts|scripts)\s*=\s*\[([\s\S]*?)\n\s*\];/);
if (!loader) {
  errors.push("index.html: dynamic script loader list was not found");
} else {
  const loadedLocalPaths = [];
  for (const match of loader[1].matchAll(/["'](\.\/[^"']+)["']/g)) {
    const url = match[1];
    if (/^(?:https?:)?\/\//i.test(url) || url.startsWith("data:")) continue;
    const localPath = decodeURIComponent(url.split(/[?#]/, 1)[0]).replace(/^\.\//, "");
    loadedLocalPaths.push("./" + localPath);
    if (!existsSync(resolve(root, localPath))) {
      errors.push("index.html dynamic loader references missing local script: " + url);
    }
  }

  const serviceWorker = sources["service-worker.js"];
  const shell = serviceWorker.match(/const SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!shell) {
    errors.push("service-worker.js: shell asset list was not found");
  } else {
    const shellUrls = new Set(
      [...shell[1].matchAll(/["'](\.\/[^"']+)["']/g)].map((match) => match[1])
    );
    const shellPaths = new Set([...shellUrls].map((url) => url.split(/[?#]/, 1)[0]));
    for (const url of shellUrls) {
      const localPath = decodeURIComponent(url.split(/[?#]/, 1)[0]).replace(/^\.\//, "");
      if (!localPath || !existsSync(resolve(root, localPath))) {
        errors.push("service-worker.js shell references missing local asset: " + url);
      }
    }
    for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
      const src = match[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if (src?.startsWith("./") && !shellUrls.has(src)) {
        errors.push("service-worker.js shell URL/version does not exactly match a script: " + src);
      }
    }
    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = match[0];
      const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
      const as = tag.match(/\bas=["']([^"']+)["']/i)?.[1]?.toLowerCase();
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (href?.startsWith("./") && (rel === "stylesheet" || (rel === "preload" && as === "script")) && !shellUrls.has(href)) {
        errors.push("service-worker.js shell URL/version does not exactly match a stylesheet/script preload: " + href);
      }
    }
    for (const match of html.matchAll(/script\.src=["'](\.\/[^"']+)["']/g)) {
      if (!shellUrls.has(match[1])) {
        errors.push("service-worker.js shell URL/version does not exactly match a dynamically loaded script: " + match[1]);
      }
    }
    for (const path of loadedLocalPaths) {
      if (!shellPaths.has(path)) {
        errors.push("service-worker.js shell is missing a dynamically loaded script: " + path);
      }
    }
    for (const match of loader[1].matchAll(/["'](\.\/[^"']+\.js(?:\?[^"']*)?)["']/g)) {
      const url = match[1];
      if (!shellUrls.has(url)) {
        errors.push("service-worker.js shell URL/version does not exactly match a dynamically loaded script: " + url);
      }
    }
  }
}

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const seenIds = new Set();
for (const id of ids) {
  if (seenIds.has(id)) errors.push("index.html contains duplicate id: " + id);
  seenIds.add(id);
}

checkBalancedCss("styles.css", sources["styles.css"]);
checkBalancedCss("spaces.css", sources["spaces.css"]);
try {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  if (!manifest.start_url || !manifest.scope || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    errors.push("manifest.webmanifest is missing required install metadata");
  }
} catch (error) {
  errors.push("manifest.webmanifest is not valid JSON: " + error.message);
}
for (const path of ["js/local-store.js", "js/core.js", "js/chat-menu-v5.js", "js/spaces.js", "js/calls.js", "service-worker.js"]) {
  const source = sources[path];
  if (/sb_secret_[A-Za-z0-9_-]{16,}/i.test(source)) {
    errors.push(path + ": possible Supabase secret key found in client code");
  }
  if (/service_role\s*[:=]\s*["'][^"']{12,}/i.test(source)) {
    errors.push(path + ": possible service_role credential found in client code");
  }
}

// Keep shell cache and versioned local-store assets synchronized after cache behavior changes.
const coreSource = sources["js/core.js"];
const chatSource = sources["js/chat-menu-v5.js"];
if (!sources["service-worker.js"].includes('const CACHE_NAME="farnaz-shell-v133"') || !sources["service-worker.js"].includes('core.js?v=20261026-9') || !sources["service-worker.js"].includes('local-store.js?v=20261026-1')) {
  errors.push("service-worker.js must use the current shell cache and core asset versions");
}
const loaderChecks = [
  [html.includes('script.src="./js/supabase-sdk.js"') && html.includes('script.onload=()=>{') && html.includes("loadLocalScripts();"),
    "index.html must wait for the local Supabase SDK before loading the app core"],
  [html.includes('core.src="./js/core.js?v=20261026-9"') && html.includes("core.onload=()=>{") && html.includes("core.onerror=()=>{"),
    "index.html must handle both successful and failed core-script loading"],
  [html.includes("script.onload=loadNextFeature;") && html.includes("if(typeof window.FarnazBoot===\"function\")window.FarnazBoot();"),
    "index.html must load feature scripts sequentially and boot only after the loader sequence"],
  [html.includes('script.onerror=()=>{') && html.includes("window.FARNAZ_APP_LOAD_FAILED=true;"),
    "index.html must report a failed feature-script load"],
];
for (const [passed, message] of loaderChecks) {
  if (!passed) errors.push(message);
}

const authChecks = [
  [coreSource.includes('storageKey:"sb-iemykhluluoymsbqpjsn-auth-token"') &&
   coreSource.includes("persistSession:true") &&
   coreSource.includes("autoRefreshToken:true") &&
   coreSource.includes("storage:window.localStorage"),
    "js/core.js must keep the explicit persisted Supabase session configuration"],
  [coreSource.includes("client.auth.signInWithPassword({email,password})"),
    "js/core.js must retain the email/password sign-in path"],
  [coreSource.includes("client.auth.getSession()") && coreSource.includes("window.FarnazBoot=()=>"),
    "js/core.js must restore the saved session from the app boot entry point"],
  [coreSource.includes('withTimeout(client.auth.getSession(),18000,"saved session restore")') &&
   coreSource.includes("longer than the fetch wrapper's 15-second auth-request deadline"),
    "js/core.js must avoid timing out before its bounded refresh-token request settles"],
  [coreSource.includes("async function restoreSavedSession(attempt=0)") &&
   coreSource.includes('transientRestoreFailure=error?.name==="TimeoutError"||error?.name==="TypeError"||isTransientError(error)') &&
   coreSource.includes("await restoreSavedSession(attempt+1)"),
    "js/core.js must retry transient saved-session restoration failures before falling back to guest"],
  [coreSource.includes("// Never let a late restore overwrite the newer authenticated identity.") &&
   coreSource.includes("if(currentUser)return;") &&
   coreSource.includes("// In that case this stale boot-time failure must not switch the UI back to guest.") &&
   coreSource.includes("if(currentUser)return;") &&
   coreSource.includes("Retry transient startup failures before falling back to the guest screen."),
    "js/core.js must prevent late session reads and failures from overriding a completed manual sign-in"],
  [coreSource.includes('async function logout()') && coreSource.includes('client.auth.signOut({scope:"local"})') &&
   coreSource.includes('recoveryDelay(5000).then(()=>({timedOut:true}))') &&
   coreSource.includes('localStorage.removeItem("sb-iemykhluluoymsbqpjsn-auth-token")') &&
   coreSource.includes('Always return to the guest screen'),
    "js/core.js must keep local logout bounded and clear the persisted session if auth cleanup stalls"],
  [coreSource.includes('setStatus("profileStatus","");') && coreSource.includes('setConnectionBanner("",false);'),
    "js/core.js must clear stale profile/connection loading status when returning to guest"],
  [coreSource.includes("// Ignore a late profile failure after logout or a newer account/profile request.") && coreSource.includes("if(request!==profileRequestNumber||currentUser?.id!==user.id)return;"),
    "js/core.js must ignore stale profile failures after logout or account switching"],
  [coreSource.includes("// Logout/account switching may happen while profile creation is pending.") && coreSource.includes("// A completed cache write must not let a stale profile request update the UI after logout.") ,
    "js/core.js must re-check the profile request after awaited profile creation and cache writes"],
  [coreSource.includes("let unmatchedPhoneContactsRequestNumber=0;") && coreSource.includes("request!==unmatchedPhoneContactsRequestNumber") && coreSource.includes("// Invalidate every in-flight list request before clearing the signed-in UI."),
    "js/core.js must invalidate stale contact/list requests after logout"],
  [coreSource.includes("// The account or a newer contacts refresh may have changed during the cache write.") && coreSource.includes("if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;"),
    "js/core.js must guard contacts UI updates after awaited cache writes"],
  [coreSource.includes("// A failed preferences request may finish after logout or a newer refresh.") && coreSource.includes("// Do not let a stale preferences read continue into the messages request or update guest UI.") && (coreSource.match(/if\(currentUser\?\.id!==myId\|\|request!==conversationListRequestNumber\)return;/g)||[]).length>=3,
    "js/core.js must stop stale conversation-preferences requests before they can update the guest UI or continue loading messages"],
  [coreSource.includes("function navigate(pageId,options={})") && coreSource.includes('navigate("chatsPage",{refreshData:false})') && !coreSource.includes('window.addEventListener("farnaz-auth-user",event=>{'),
    "js/core.js must avoid duplicate inbox/contact refreshes during sign-in and saved-session restoration"],
  [sources["js/local-store.js"].includes("const clearingUsers=new Map()") && sources["js/local-store.js"].includes("await waitForUserClear(userId)") && sources["js/local-store.js"].includes("Queue repeated cleanup operations for the same account") && sources["js/local-store.js"].includes("function clearUser(userId)") && sources["js/local-store.js"].includes("Local account cleanup timed out") && sources["js/local-store.js"].includes("remove(STORE_TEMP,record.key,userId)"),
    "js/local-store.js must serialize per-user cache writes with logout cleanup to prevent a quick re-login from losing new cache data"],
  [coreSource.includes('retryRead("create current user profile"') && coreSource.includes('withTimeout(operation(),timeoutMs,label)') && coreSource.includes('timeoutMs=16000'),
    "js/core.js must bound the initial profile creation request"],
  [coreSource.includes('label==="current user profile"||label==="create current user profile"') && coreSource.includes('Profile connection interrupted; retrying automatically…') && coreSource.includes('ارتباط پروفایل قطع شده؛ تلاش مجدد خودکار…'),
    "js/core.js must show profile retry progress instead of leaving the profile status apparently frozen"],
  [coreSource.includes("could not restore your saved session") && coreSource.includes("setConnectionBanner("),
    "js/core.js must visibly report a failed saved-session restore"],
  [coreSource.includes("let preferencesLoaded=true;") && coreSource.includes("preferencesLoaded=false;") && coreSource.includes("return preferencesLoaded;"),
    "js/core.js must not report inbox recovery as successful when server-side conversation preferences failed"],
  [coreSource.includes("const recoveryUserId=String(currentUser.id);") &&
   coreSource.includes("const inboxRefreshed=await refreshConversationList();") &&
   coreSource.includes("if(inboxRefreshed===false)throw new Error") &&
   coreSource.includes("const contactsRefreshed=await refreshSavedContacts();") &&
   coreSource.includes("if(contactsRefreshed===false)throw new Error") &&
   coreSource.includes('if(!currentUser||String(currentUser.id)!==recoveryUserId)return;'),
    "js/core.js must treat failed inbox/contact refreshes as recovery failures and ignore stale account recovery"],
  [coreSource.includes('if(!session?.user){') && coreSource.includes('setConnectionBanner("",false);') && coreSource.includes('setStatus("profileStatus","");'),
    "js/core.js must clear stale startup/profile status when no saved session exists"],
  [coreSource.includes('result.status==="rejected"||result.value===false') && (coreSource.match(/const initialDataFailure/g)||[]).length===2,
    "js/core.js must not silently hide failed inbox/contact initialization after login or session restore"],
  [chatSource.includes("window.loadPrivateMessages") || chatSource.includes("loadPrivateMessages"),
    "js/chat-menu-v5.js must retain the explicit private-message loader"],
  [chatSource.includes("const subscriptionReady=new Promise") &&
   chatSource.includes("await subscriptionReady") &&
   chatSource.includes("},12000);") &&
   chatSource.includes("client.removeChannel(channel)"),
    "js/chat-menu-v5.js must wait for confirmed Realtime subscription and clean up failed setup"],
  [coreSource.includes('const profilePrivacy={...privacySettings};') &&
   coreSource.includes('.upsert({id:userId,display_name:name') &&
   coreSource.includes('if(String(currentUser?.id)!==userId)return;') &&
   coreSource.includes('const path=userId+"/avatar-"'),
    "js/core.js must keep profile/photo writes bound to the account that started the save"],
  [coreSource.includes('const requestMethod=String(init?.method||') &&
   coreSource.includes('const canRetry=isStorageUpload||["GET","HEAD","OPTIONS"].includes(requestMethod);') &&
   coreSource.includes("retrying those requests can duplicate messages or side effects."),
    "js/core.js must not automatically replay potentially non-idempotent Supabase POST writes after transport failures"],
  [chatSource.includes('const senderId=String(currentUser.id),receiverId=String(currentChatUser.user_id);') &&
   chatSource.includes('const row={sender_id:senderId,receiver_id:receiverId') &&
   chatSource.includes('if(String(currentChatUser?.user_id||"")===receiverId){') &&
   chatSource.includes('input.value="";input.style.height="auto";'),
    "js/chat-menu-v5.js must bind private message writes and composer cleanup to the initiating account/chat"],
  [sources["js/spaces.js"].includes('const senderId=String(currentUser.id),spaceId=String(active.id),editId=editingSpaceMessageId;') &&
   sources["js/spaces.js"].includes('.insert({space_id:spaceId,sender_id:senderId') &&
   sources["js/spaces.js"].includes('const sameSpace=()=>sameAccount()&&String(active?.id||"")===spaceId;'),
    "js/spaces.js must bind group/channel message writes and UI updates to the initiating account/space"],
  [coreSource.includes('async function findRecipient(event)') &&
   coreSource.includes('const myId=String(currentUser.id);') &&
   coreSource.includes('.upsert({user_id:myId,contact_user_id:id}') &&
   coreSource.includes('if(String(currentUser?.id)!==myId)return;'),
    "js/core.js must keep recipient search and contact creation bound to the initiating account"],
  [coreSource.includes('const pending=farnazPresenceStartPromise;') &&
   coreSource.includes('return startFarnazPresence(forceRestart);') &&
   coreSource.includes('if(!currentUser||String(currentUser.id)!==uid||farnazPresenceChannel!==ownChannel)return;'),
    "js/core.js must re-evaluate overlapping presence starts and ignore stale contact results after account changes"],
];
for (const [passed, message] of authChecks) {
  if (!passed) errors.push(message);
}

if (errors.length) {
  console.error("Farnaz validation failed:");
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("Farnaz validation passed: " + ids.length + " static IDs, local asset links, CSS structure, and client secret scan.");
}
