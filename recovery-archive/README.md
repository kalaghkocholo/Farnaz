# Recovery archive — legacy JavaScript

This directory preserves older Farnaz JavaScript files that were not referenced by the active script loader in this recovery baseline.

## Files
- `legacy-js/app.js`
- `legacy-js/chat.js`
- `legacy-js/chat-delete-dialog-v2.js`
- `legacy-js/chat-delete-dialog-v3.js`
- `legacy-js/chat-menu-v4.js`

These are preserved for comparison and selective restoration; they are not part of the active application boot path. Do not delete this archive while investigating regressions.

## Recovery baseline
- Candidate commit: `40e83d48b3010ab36062dd04d383067517d70963`
- Branch: `recovery/core-baseline-auth-20261025`
- This is a candidate with an explicit email/password form handler and session restoration in the chat module. Static checks passed, but it has not been runtime-tested on iPhone Safari.
- The candidate still loads the Supabase SDK from external CDNs with a fallback. This remains a network-dependent boot risk; do not call this baseline production-ready until SDK loading and real login/session flows are tested.
- No changes were made to `main` or to Supabase data/schema.
