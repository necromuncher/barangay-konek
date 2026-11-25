# Barangay Konek

Barangay Konek is a mobile-first Angular community app for Quezon Province. Supabase Auth handles email verification and account roles; community content and most app data remain local prototype data in browser storage.

## Features

- **Public browsing:** unauthenticated visitors can browse Community posts and Marketplace listings, open individual post/listing details, and use the read-only preview cards. Posting, messaging, and all other app areas require sign-in.
- **Email authentication:** Supabase password sign-in, email OTP codes, and magic links are supported, with password recovery through a verified email link. New accounts start as Residents; roles are read from protected Supabase profiles and assigned by server-checked role administration.
- **Dashboard:** community and marketplace summaries, unread-message count, and clickable latest updates. Officers and Captains see incident analytics for their barangay; Superusers see province-wide data.
- **Incident analytics:** interactive severity and incident-status charts, with month, year, and all-time filters. Dashboard severity summaries rotate through Low, Medium, High, and Critical every five seconds, including categories with no incidents, and cycle through up to five recent matching incidents.
- **Community Wall:** updates, incident reports, announcements, events, comments, likes, reports, image galleries, and severity filters. Quezon barangays use an optimized Quezon Provincial Capitol banner by default until a custom one is uploaded. Captains can manage their barangay's hero banner; Superusers can select and manage banners for any barangay. Custom banner images are optimized and saved per barangay, so local accounts in that browser profile see the same banner.
- **Marketplace:** searchable, filterable free listings with grid, list, and text-only layouts; item details; owner messaging; and sold-state management.
- **Private messages and notifications:** local direct messaging, unread counts, notification links, and encrypted-at-rest message storage.
- **Admin tools:** incident queues, resolution evidence, violation summaries, moderation words, and barangay directory management. Superusers can search users by city and barangay and save Officer/Captain role assignments.
- **System Logs:** a Superuser-only Workspace page records who uploaded or changed a barangay hero banner and when.
- **Profile and settings:** editable profile details, profile photo upload, notification preferences, and location settings. Phone numbers are read-only.

## Run locally

Requirements: Node.js and npm. From this directory, install dependencies and start the Angular development server:

```bash
npm install
npm start
```

Open `http://localhost:4200/`. The development server reloads when source files change.

In PowerShell, if script execution policy blocks `npm`, use the Windows command shim:

```powershell
npm.cmd install
npm.cmd start
```

To generate a development build without starting the server:

```bash
npm run build -- --configuration development
```

To rebuild automatically when source files change, run `npm run watch`.

## Validate

```bash
npm run build
npm test
```

## Seeded locations

The directory source is `src/app/auth/barangays.data.ts`. It currently includes 33 barangays in Lucena City and 66 barangays in Tayabas City, Quezon. This keeps later Quezon Province city and municipality additions in the same data shape.

Lucena coordinates are carried over from the HTML prototype. Tayabas coordinates are not yet seeded, and Purok/Zone names are demo placeholders rather than an official directory. Distances for localities without coordinates use demo values.

Marketplace listings are fictitious examples associated with the seeded barangay names; they are not real offers.

## Local data and security

Authentication sessions and authoritative account roles use Supabase Auth and the `profiles` table. Directory edits, posts, listings, barangay community banners, banner system logs, notifications, moderation state, and direct messages still persist in versioned browser storage and are not synchronized to other devices. Community banners are shared among local accounts assigned to that barangay.

Existing local demo accounts are not imported into Supabase. Users must register or log in with a verified email; the reserved address is promoted to Superuser by the database function after verification.

Direct-message content is AES-GCM encrypted before it is written to `localStorage`; its non-extractable browser key is kept in IndexedDB. This provides basic at-rest protection only, not end-to-end encryption or protection from malicious same-origin scripts. Other local data, including uploaded images and banners, is not encrypted. Images are resized and recompressed before saving.

Community content and moderation data remain a local prototype; browser storage is not suitable for real personal or sensitive data. Clear the browser's site data to reset local test state. Supabase Auth validates email OTPs, and database functions protect the reserved Superuser role. The Supabase publishable key in the Angular client is public by design; never put a `service_role` key in the client. Web3Forms is not used for authentication.

## Backend and PWA

The Supabase setup and initial SQL baseline are in [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) and [supabase-schema.sql](./supabase-schema.sql).

For Supabase setup, apply `supabase-schema.sql`, `supabase-seed-barangays.sql`, and then `supabase-auth-hardening.sql` to the project. Enable Supabase email OTP and configure its Auth email template/SMTP before registering or logging in. The hardening SQL reserves the requested verified email as Superuser and exposes role assignment only through a Superuser-checked database function.

The project includes a PWA manifest and Angular service worker. For local PWA/offline checks, serve a production build on localhost; the development server disables service-worker registration.

## License

This project is licensed under the [MIT License](../LICENSE).
