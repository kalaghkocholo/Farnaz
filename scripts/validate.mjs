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
    const shellPaths = new Set(
      [...shell[1].matchAll(/["'](\.\/[^"']+)["']/g)].map((match) => match[1].split(/[?#]/, 1)[0])
    );
    for (const path of loadedLocalPaths) {
      if (!shellPaths.has(path)) {
        errors.push("service-worker.js shell is missing a dynamically loaded script: " + path);
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

if (errors.length) {
  console.error("Farnaz validation failed:");
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("Farnaz validation passed: " + ids.length + " static IDs, local asset links, CSS structure, and client secret scan.");
}
