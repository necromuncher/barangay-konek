# Barangay Konek backend architecture

## Current build

The runnable client is the standalone Angular app in `barangay-konek-angular/`. `barangay-app.html` remains the original React prototype and is not the active application.

The Angular app uses Supabase email/password, email OTP, or magic links for identity and the Supabase `profiles` table for authoritative roles. Password recovery uses a verified Supabase email link. Direct profile reads are limited to the signed-in user's row; the `member_directory` view exposes only names, roles, barangays, and account creation dates. The client's publishable key is public; never put a `service_role` key in Angular. Apply `supabase-schema.sql`, `supabase-seed-barangays.sql`, and `supabase-auth-hardening.sql` before using authentication. The hardening SQL reserves the verified Superuser email and restricts role assignment to a database function that checks the caller's role.

Directory edits, posts, listings, notifications, moderation state, and direct messages remain in versioned browser storage and do not sync across devices. Direct-message content is AES-GCM encrypted before it is written to `localStorage`; the non-extractable key is stored in IndexedDB. This is basic at-rest protection only: same-origin scripts can still request decryption, so it is not end-to-end encryption. Use test identities only for local content and do not enter sensitive personal information. Clear the browser's site data to reset local prototype state. Uploaded images are resized/recompressed before saving. Profile photos and moderation overrides remain local. The email field is managed by Supabase Auth and cannot be changed through the local profile form.

Private messaging is initiated as a local prototype: messages are text-only, stripped of HTML and hyperlinks, encrypted at rest in the browser, and surfaced as recipient-targeted in-app notifications. Messages are not delivered to other devices and have no server-side access control or end-to-end encryption. The Supabase schema does not yet include conversation/message tables; implement those with strict participant-only RLS before any hosted messaging pilot.

The local marketplace includes one clearly labeled fictitious sample listing for every seeded Lucena City and Tayabas City barangay. Sample pickup locations use the barangay/city name only; no unverified street addresses or real offers are implied. Tayabas distance values remain demonstrative because verified barangay coordinates are not seeded.

Angular Service Worker/PWA support is configured for production builds with an installable manifest and static app-shell caching. The development server disables the service worker; PWA installation needs HTTPS (or localhost) and a production build. Web Push is not configured. See the [Angular service-worker guide](https://angular.dev/ecosystem/service-workers/getting-started) for local production testing and deployment requirements.

## Supabase backend rollout

Supabase is a practical initial backend for a barangay pilot: hosted Postgres, Supabase Auth, Realtime and Storage are available under its free plan, subject to current usage quotas, inactivity policies, and regional availability. As checked on 2026-11-22, the pricing page lists Free with 50,000 monthly active users, 500 MB database size, 1 GB file storage and two active projects; free projects pause after one week of inactivity. Confirm current limits and terms on the [Supabase pricing page](https://supabase.com/pricing) before launch. The app can remain Angular; migrating the prototype back to React is not required.

| Capability | Supabase service | Client integration |
| --- | --- | --- |
| Accounts and identity | Auth + `profiles` | Email OTP is enabled; roles are read from protected profiles and identity comes from `auth.uid()` |
| Barangay directory | Postgres `barangays` | Seed Lucena/Tayabas; import Quezon localities after data verification |
| Wall, comments, likes | Postgres tables | Filter by barangay; use RLS for reads/writes |
| Incident queues/reports | Postgres posts and reports | Subscribe to relevant table changes; server-enforce staff scope and resolution evidence |
| Nearby listings | Postgres listings + barangay coordinates | Calculate Haversine distance in the client or PostGIS later; request device geolocation only with consent |
| Community images | Private Storage bucket `community-media` | Upload under `{auth.uid()}/...`; store object paths, not base64 data URLs |
| In-app alerts | `notifications` + Realtime | Subscribe only to the signed-in user's notifications |
| Browser/phone push | Web Push service worker or a push provider | Add only after PWA and consent flows; push delivery is not provided merely by enabling Realtime |

`supabase-schema.sql` provides a starting schema and RLS policies. Review and test it in a disposable Supabase project before applying to production. In particular:

- The schema does not yet include all product workflows (private-message conversations, report-to-strike aggregation, audited role administration, automated ban-identity hashing/registration blocking, rate limits, or verified full Purok/Zone boundaries).
- A report must not automatically become a permanent violation without review. The schema keeps reports separate from the profile's `violation_count`; a trusted server function/admin workflow should adjudicate reports and apply suspension/ban changes.
- Store normalized, one-way hashes for blocked email/phone/provider identities. Never store raw banned identity values in a publicly readable table. Auth provider identities require a server-side signup check; email/mobile uniqueness alone does not stop someone from creating an unrelated identity.
- The client must never receive a Supabase `service_role` key. Only the publishable/anon key belongs in Angular configuration, with RLS enabled on every exposed table and Storage bucket.
- The SQL contains baseline policies, not a complete security certification. Add tests for resident/officer/captain/superuser access before real data is loaded.

## Free-tier feasibility and setup

Supabase Auth is configured in the Angular client with the supplied project URL and publishable key. No `service_role` credential is used. Authentication requires the project schema and `supabase-auth-hardening.sql` to be applied and the Supabase Auth email OTP/SMTP settings to be enabled:

1. Apply `supabase-schema.sql`, `supabase-seed-barangays.sql`, and `supabase-auth-hardening.sql` in that order in the SQL Editor.
2. Enable email/password authentication and verify SMTP delivery. Add the password recovery callback URL (`<app-origin>/auth?mode=update-password`) to Supabase Auth's allowed redirect URLs for local development and deployment. To send numeric codes, configure the relevant Supabase Auth email templates (Magic Link and Confirm Signup) to display `{{ .Token }}`. If a template instead uses `{{ .ConfirmationURL }}`, Supabase sends a clickable magic link; click it rather than pasting its URL token into the numeric-code field. The app detects the resulting session and opens the authenticated dashboard.
3. If an Auth user existed before the profile trigger was installed, rerun `supabase-auth-hardening.sql`; it backfills missing profile rows and restores the reserved verified Superuser role.
4. Confirm email ownership is required; test resident signup and reserved-Superuser promotion with the actual mailbox.
5. Test role assignment and RLS with separate resident, barangay staff, and superuser accounts.
6. Move community data, moderation workflows, and messages from browser storage to Supabase before any real-data pilot.
7. Configure Realtime subscriptions, private Storage uploads, backups/export, and operational monitoring before the pilot.

Free-tier quotas can change and should be checked against the official Supabase pricing and product-limit pages. Supabase Realtime supports in-app updates while the site is open; delivery to a closed mobile browser requires a PWA service worker and a push service/browser permission, plus server-side push dispatch.

## Recommended rollout

1. Move moderation data and incident workflows to trusted database functions; local overrides are still browser-editable.
2. Move posts/comments/likes and reports; add moderation audit history and transactional strike/suspension workflows.
3. Move listings and image uploads; enforce listing ownership, size/type limits and retention rules.
4. Add notification persistence and Realtime; then add optional Web Push.
5. Import verified Purok/Zone records only when authoritative data is available. Current client labels are demo placeholders, not an official directory.
