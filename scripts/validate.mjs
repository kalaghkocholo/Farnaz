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
const clientFiles = [
  "js/core.js",
  "js/chat-menu-v5.js",
  "js/spaces.js",
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

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const seenIds = new Set();
for (const id of ids) {
  if (seenIds.has(id)) errors.push("index.html contains duplicate id: " + id);
  seenIds.add(id);
}

checkBalancedCss("styles.css", sources["styles.css"]);
checkBalancedCss("spaces.css", sources["spaces.css"]);

for (const path of ["js/core.js", "js/chat-menu-v5.js", "js/spaces.js"]) {
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
