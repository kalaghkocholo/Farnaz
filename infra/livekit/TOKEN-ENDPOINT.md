# LiveKit token endpoint

Function path: `supabase/functions/livekit-token/index.ts`

## What it does

- Accepts a signed-in Supabase user's bearer access token.
- Validates that token with Supabase Auth.
- Checks the caller has a real row in `public.space_members` for the requested `spaceId`.
- Confirms the space is a group, not merely a publicly visible channel.
- Issues a LiveKit token scoped to that group room, with a five-minute token lifetime.
- Keeps LiveKit API credentials on the server and returns only the signed participant token and WSS URL.

The function does not change any database tables or RLS policies. It uses the existing membership schema and the caller's authenticated Supabase context.

## Required server-side environment

Configure these as Supabase Edge Function secrets, not as browser/PWA environment variables:

- `LIVEKIT_URL`: public LiveKit WSS URL, e.g. `wss://livekit.example.com`.
- `LIVEKIT_API_KEY`: LiveKit API key.
- `LIVEKIT_API_SECRET`: matching LiveKit API secret.
- `FARNAZ_ALLOWED_ORIGINS` (optional): comma-separated exact origins. The default allowed browser origin is `https://kalaghkocholo.github.io`. Add a local development origin explicitly when testing locally.

Supabase normally provides `SUPABASE_URL` and `SUPABASE_ANON_KEY`; the function also accepts `SUPABASE_PUBLISHABLE_KEY` if that is the configured key name.

## Request

Send an authenticated `POST` to the `livekit-token` function with JSON:

```json
{ "spaceId": "UUID-OF-AN-EXISTING-GROUP" }
```

Expected success response:

```json
{ "token": "SHORT_LIVED_SIGNED_TOKEN", "serverUrl": "wss://livekit.example.com", "roomName": "farnaz-group-UUID" }
```

Do not log or persist the returned token. The PWA should use it only to join the corresponding LiveKit room.

## Important rollout notes

- The function is not deployed by committing this file. It must be deployed separately after local/static review and the required secrets are configured.
- The function is not yet called by the PWA; the existing one-to-one call flow remains unchanged.
- A five-minute token limits the initial join window; it does not itself evict an already connected participant. Membership removal and active-call moderation need a separate operational policy.
- CORS is an additional browser boundary, not authentication. The bearer JWT and database membership check remain mandatory.
- Before production rollout, test member and non-member requests, expired tokens, wrong space types, origin rejection, and real LiveKit connection from iOS Safari.
