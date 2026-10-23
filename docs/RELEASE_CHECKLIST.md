# Farnaz release checklist

Use this checklist before publishing changes that affect authentication, messaging, groups/channels, styling, or database access.

## Automated checks

- [ ] GitHub Actions JavaScript syntax workflow passes.
- [ ] New SQL migrations are committed under `supabase/migrations/` and match the connected project.
- [ ] Supabase security and performance advisors have been reviewed.
- [ ] No service-role or secret key is present in client files.

## Authentication and privacy

- [ ] Sign-up, sign-in, sign-out, and session restoration work.
- [ ] Account lookup returns only the minimum data needed to start a conversation.
- [ ] Users cannot enumerate or retrieve private profile fields beyond the intended product rules.
- [ ] RLS prevents cross-account reads and writes.
- [ ] Storage paths and policies restrict private attachments to authorized participants.
- [ ] Privileged database functions validate the current authenticated user and the requested resource.

## Messaging

- [ ] Sending, receiving, pagination, reply/edit/delete, and read receipts work.
- [ ] Multi-select actions state the deletion scope clearly.
- [ ] Realtime reconnect does not duplicate messages or reset the active conversation.
- [ ] Attachment type and size restrictions match the server-side Storage limits.
- [ ] Voice recordings can be discarded before sending and their temporary URLs are released when no longer needed.

## Groups and channels

- [ ] Owners, admins, and members can perform only their intended actions.
- [ ] Private invite codes work and do not expose private channel data.
- [ ] Channel posting permissions are enforced by the database, not only by hidden UI controls.
- [ ] Hiding a message for one user does not delete it for other members.

## UI and mobile

- [ ] Persian RTL and English LTR layouts work.
- [ ] Light/dark themes have readable text, composer, and message bubbles.
- [ ] iOS keyboard does not cover the composer.
- [ ] Dialogs can be closed and have accessible labels/status messages.
- [ ] No console errors on startup, navigation, sending, or reconnection.

## Known not-yet-implemented capabilities

- Real audio/video calling
- Background push notifications
- Service-worker/offline PWA behavior

Do not mark these capabilities complete until their implementation and end-to-end tests exist.
