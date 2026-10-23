# Technical review — 2026-10-23

This is a source-level review and a record of the hardening changes applied during this pass. It is not a substitute for end-to-end browser testing.

## Changes applied

1. Removed the stray `s += "";` statement after the closing IIFE in `js/spaces.js`. No matching global `s` was defined in the inspected frontend files.
2. Bumped the `spaces.js` cache query in `index.html` from `20261023-67` to `20261023-68`.
3. Updated `public.find_farnaz_user_by_phone(text)` so its result keeps the existing return shape but always returns `NULL` for the `phone` field. The frontend uses the result's user ID to start a conversation and does not need the matched user's raw phone number.
4. Added indexes for the four foreign-key columns identified by Supabase's performance advisor:
   - `message_read_receipts.reader_id`
   - `message_read_receipts.receiver_id`
   - `space_message_hidden.message_id`
   - `space_message_reads.user_id`
5. Added repository documentation, a release smoke-test checklist, and a GitHub Actions workflow that runs `node --check` on the three browser scripts.

## Database verification

The connected database was queried after the migrations:

- The phone-search function still has its original table return signature, and the function definition now masks the phone field.
- All four new indexes are present.
- The advisor no longer reports the four previously unindexed foreign keys.

The new indexes may appear as unused until representative production queries exercise them. Do not remove them based on a fresh/low-traffic usage counter alone.

## Findings to address next

### High priority — authentication configuration

Supabase reports that leaked-password protection is disabled. Enable it in the project's Auth password/security settings before inviting real users. This setting is managed in Supabase Auth configuration and was not changed by the SQL migrations in this pass.

### High priority — validate account lookup privacy and abuse resistance

The user-search RPCs are callable by authenticated users and intentionally use `SECURITY DEFINER` to read profile data across RLS boundaries. Current database inspection shows these RPCs have a fixed `search_path`, explicit authenticated-user checks, and execute grants for `authenticated` rather than `PUBLIC`. That is useful defense in depth, but it does not replace review of returned fields, row authorization, and abuse/rate-limiting protections. The phone-search response was reduced to the minimum required fields in this pass. Further rate limiting should be designed without breaking legitimate contact discovery.

### Medium priority — complete migration history

The connected database contains older migrations that are not all represented in this repository. The two new migrations are recorded under `supabase/migrations/`, but the folder is not yet a complete reproducible baseline. Reconstruct and verify the historical migration set before using the repository to create a new Supabase environment.

### Medium priority — reduce coupling carefully

The application is currently built from classic browser scripts with shared global state. `js/core.js` wraps navigation and `js/spaces.js` also wraps navigation/language switching. This is fragile but can be part of the current integration contract. Before changing it, map all callers and split the refactor into small changes with smoke tests.

### Medium priority — CSS duplication and injected styles

`styles.css` contains multiple override layers, and `js/spaces.js` injects a large block of CSS. This makes theme/layout bugs harder to reason about. Consolidate one component at a time only after capturing the current selectors and testing dark/light mode, RTL/LTR, group headers, dialogs, and the mobile composer.

### Product gaps, not represented as completed features

- `startCall()` currently displays a message that audio/video calling is not configured. Actual calls require a signaling service and a WebRTC implementation.
- No service worker or background push implementation was found in the inspected application files.
- The current GitHub Actions job checks JavaScript syntax only; it does not execute browser flows or test Supabase authorization.

## Suggested order for the next pass

1. Enable leaked-password protection in Supabase Auth.
2. Reconstruct the historical migrations and add repeatable database access-control tests.
3. Add focused tests for profile/phone lookup, private messages, attachment ownership, group roles, and per-user message hiding.
4. Consolidate group styles out of the injected CSS in small batches.
5. Reduce global navigation/language coupling after the existing behavior is covered by tests.
6. Plan service-worker notifications and real audio/video calling as separate feature projects.

## Verification boundary

The SQL changes were applied to the connected Supabase project and queried afterward. GitHub file changes were committed. A complete browser session on iOS/desktop was not run in this pass, and the syntax workflow's hosted result was not available at review time. Do not interpret source review or SQL metadata checks as proof that all user flows work end to end.


## Follow-up pass — static checks and product accuracy

1. Added `scripts/validate.mjs` and expanded the GitHub Actions workflow. It checks the syntax of all three browser scripts, validates local script/stylesheet links in `index.html`, detects duplicate static IDs, checks CSS string/comment/brace balance, and scans browser JavaScript for common Supabase secret-key patterns. These are guardrails, not a full browser test suite.
2. Updated the landing-page feature cards and both Persian/English translation entries so the public-facing copy emphasizes contacts, groups, and channels instead of suggesting that background reminders and real audio/video calls are already implemented.
3. Rechecked CSS selector repetition with a lightweight source scan. The main `styles.css` contains many repeated selector blocks (roughly 90 selectors appear more than once in the source scan), particularly around chat viewport, composer, and theme overrides. Some rules may be intentional because they sit in different media queries or are later compatibility overrides. They should not be deleted mechanically. The next CSS refactor should first map each rule to its enclosing media/theme context and remove only demonstrably redundant declarations, with visual regression checks for iOS chat layout.
4. The connected Supabase project has a migration history covering the existing database changes, but the repository does not yet contain a complete historical SQL migration baseline. The database's migration ledger alone does not provide the original SQL text. Do not synthesize old migrations from their names or use a guessed baseline; recover the original SQL from a trusted source or create a carefully reviewed schema baseline in a separate, tested process.

## Follow-up pass — low-risk CSS cleanup

1. Consolidated the two group-call SVG rules into one rule, preserving the final cascade values: 19px icon dimensions, mint stroke/color, no fill, and the existing stroke width/caps/joins.
2. Removed one redundant group-composer override that repeated `justify-content:flex-end!important` and `direction:ltr!important` already set by the immediately preceding rule for the same selector and context.
3. Left other repeated selectors untouched where they change layout, specificity, or final values, or where responsive/context boundaries could affect behavior. No visual regression test was available in this pass, so this was deliberately limited to declarations whose redundancy could be established from the source.
