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

const coreSource = sources["js/core.js"];
const chatSource = sources["js/chat-menu-v5.js"];
const loaderChecks = [
  [html.includes('script.src="./js/supabase-sdk.js"') && html.includes('script.onload=()=>{') && html.includes("loadLocalScripts();"),
    "index.html must wait for the local Supabase SDK before loading the app core"],
  [html.includes('core.src="./js/core.js?v=20261025-92"') && html.includes("core.onload=()=>{") && html.includes("core.onerror=()=>{"),
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
  [coreSource.includes('withTimeout(client.auth.getSession(),9000,"saved session restore")'),
    "js/core.js must bound saved-session restoration so startup cannot wait indefinitely"],
  [coreSource.includes('retryRead("create current user profile"') && coreSource.includes('withTimeout(operation(),9000,label)'),
    "js/core.js must bound the initial profile creation request"],
  [coreSource.includes("could not restore your saved session") && coreSource.includes("setConnectionBanner("),
    "js/core.js must visibly report a failed saved-session restore"],
  [(coreSource.match(/const initialDataFailure=initialDataResults\.find\(result=>result\.status===\"rejected\"\)/g)||[]).length===2,
    "js/core.js must not silently hide failed inbox/contact initialization after login or session restore"],
  [chatSource.includes("window.loadPrivateMessages") || chatSource.includes("loadPrivateMessages"),
    "js/chat-menu-v5.js must retain the explicit private-message loader"],
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
