import { readFileSync, existsSync } from "node:fs";

const errors = [];
const read = (path) => {
  if (!existsSync(path)) {
    errors.push("Missing required infrastructure file: " + path);
    return "";
  }
  return readFileSync(path, "utf8");
};
const requireCheck = (condition, message) => {
  if (!condition) errors.push(message);
};

const fn = read("supabase/functions/livekit-token/index.ts");
const config = read("supabase/config.toml");
const envExample = read("infra/livekit/.env.example");
const plan = read("docs/call-infrastructure-plan.md");
const tokenDocs = read("infra/livekit/TOKEN-ENDPOINT.md");
const adapter = read("js/livekit-calls.js");
const adapterDocs = read("infra/livekit/CLIENT-ADAPTER.md");

requireCheck(fn.includes("supabase.auth.getUser(userJwt)"),
  "Token endpoint must validate the caller's JWT with Supabase Auth.");
requireCheck(fn.includes('.from("space_members")') &&
  fn.includes('.eq("space_id", spaceId)') &&
  fn.includes('.eq("user_id", userId)'),
  "Token endpoint must check the authenticated user's actual group membership.");
requireCheck(fn.includes('space.type !== "group"'),
  "Token endpoint must reject channels and non-group spaces.");
requireCheck(fn.includes('ttl: "5m"') && fn.includes("roomJoin: true") &&
  fn.includes("room: roomName"),
  "Tokens must be short-lived and restricted to one named room.");
requireCheck(!/roomAdmin\s*:\s*true/.test(fn),
  "Unexpected privileged LiveKit grant found.");
requireCheck(fn.includes('"Cache-Control": "no-store"'),
  "Token responses must not be cacheable.");
requireCheck(fn.includes("FARNAZ_ALLOWED_ORIGINS") &&
  fn.includes("DEFAULT_ALLOWED_ORIGINS"),
  "Token endpoint must maintain an explicit browser-origin allowlist.");
requireCheck(config.includes('[functions.livekit-token]') &&
  config.includes("verify_jwt = false") &&
  fn.includes("supabase.auth.getUser(userJwt)"),
  "If gateway JWT verification is disabled, the function itself must validate the bearer JWT.");
requireCheck(envExample.includes("replace_with_server_side_api_key") &&
  envExample.includes("replace_with_long_random_server_side_secret"),
  "Environment template must contain placeholders, not real credentials.");
requireCheck(!/sb_secret_[A-Za-z0-9_-]{16,}/i.test(fn + envExample) &&
  !/sk_live_[A-Za-z0-9_-]{16,}/i.test(fn + envExample),
  "Possible real API credential found in infrastructure source/template.");
requireCheck(plan.includes("No architecture can guarantee calls") &&
  tokenDocs.includes("not deployed by committing this file"),
  "Documentation must state reachability limits and that code commit is not deployment.");

requireCheck(adapter.includes('root.FarnazLiveKitCalls') &&
  adapter.includes('root.LivekitClient') &&
  adapter.includes('supabase.functions.invoke("livekit-token"') &&
  adapter.includes("adaptiveStream: true") &&
  adapter.includes("dynacast: true"),
  "LiveKit adapter must be isolated, authenticate through Supabase, and enable adaptive media options.");
requireCheck(adapter.includes('integrationStatus: "isolated-adapter-not-enabled"') &&
  adapterDocs.includes("not loaded by the app startup sequence yet"),
  "The new adapter must remain disabled until the local SDK and UI are tested.");
requireCheck(!/LIVEKIT_API_SECRET|LIVEKIT_API_KEY/.test(adapter),
  "LiveKit server credentials must never be referenced in browser adapter code.");

if (errors.length) {
  console.error("Call infrastructure validation failed:");
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("Call infrastructure validation passed: token auth, group membership, scoped grants, no-store responses, and isolated client adapter.");
}
