# Maintenance Tracker

Maintenance tracker for vehicles, motorcycles, bicycles, houses, equipment, or other machines.

## Demos
- demo to come shortly!
  
## Features
- **Tasks** is the main tab: a table ledger grouped by item and user-created sections, without a visible page title. The active **All** button is centered on the same row as **Edit**. Toggle **All** off to select the first item and show centered item buttons; **All** moves beside **Edit** on the right. Select **All** again to restore the combined ledger.
- Tasks with any red timeline entries show a matching pale-red rectangle inline with the task description, just left of the timeline divider. Each machine header shows its total number of red entries (not just red-marked tasks) as a dark-red number without a background directly above the marker column. No count is shown when there are no red entries. Markers and totals reflect edits immediately and revert when changes are discarded.
- In **Edit** mode, add/remove sections and task rows (ID, action, description), and edit free-text timeline values with a status color: red for expected done, green for done (with an optional text note), orange for upcoming, and blue for future. Use the small up/down arrows beside **Remove section** to move a whole section, including all its tasks and timeline entries, above or below the adjacent section within the same item. Arrows beside a task's **Remove** button reorder rows within their section. Moving the first row up places it at the bottom of the previous section; moving the last row down places it at the top of the next section, including empty sections. Tasks keep all their fields and timeline entries and never cross into another item. Timeline values stay above their status in both edit and view modes. Save changes per item or discard them; navigation warns about unsaved work.
- **Shop** displays equal-sized item and add-new cards. Item cards show only the centered name (or ID when unnamed) above the image. Open a card to edit the full item form, or use **Add new item**. Add and edit forms have no visible heading or introductory text. Fields are manually entered text, including dates, year, and mileage. The optional image file selector accepts JPEG, PNG, GIF, or WebP files up to 5 MB. Images are stored as base64 data in the MongoDB item document, not as external URLs. Editing without selecting a file keeps the current image; the picker shows **Change image** and **Image attached** for a saved image, or the filename for a newly selected image. Select a new file to replace it or use **Remove image** to clear it. Existing URL-based images remain visible until replaced or removed.
- Selecting an image opens an **Edit image** popup over the item form; use **Edit image** beside an attached image to adjust it again. Drag the preview to position its crop (mouse or touch), or focus it and use the arrow keys (Shift moves faster). Use **Zoom in**, **Zoom out**, or the zoom slider to adjust from 100% to 300%; **Reset crop** restores centered framing at 100%. The 4:3 preview matches the Shop image frame. **Submit** applies the image and framing to the item form without saving the item; **Cancel** or Escape closes only the popup and discards its changes, including a newly selected replacement image. **Save item** stores the crop and zoom separately from the original image, including for existing URL-based images, so reopening the popup lets you readjust without losing quality or animation. A replacement image starts with centered framing; cancelling the item form leaves the saved image and framing unchanged.
- Click **Image attached** (or a newly selected image's filename) to open the uncropped original in a borderless overlay. The full-resolution source is fitted to the screen without cropping or scrollbars. A small close button sits in the top-right corner, separate from the image. The close button or Escape dismisses only the image popup without changing the item form; **Change image** still opens the file selector.
- **Profile** has Identity, Update Profile, and About sections for Maintenance and NCC. Update Profile contains Sign Out and Change Your Password buttons; the latter opens a form requiring the current password and a confirmed new password. A successful change keeps this browser signed in with a fresh session and invalidates other sessions. Email-code password recovery is available only on the sign-in page.
- Existing task definitions, notes, and completion history appear in the manual ledger until that item's first ledger is saved. Original scheduling records are retained.

## Design
- no figma wireframes at this moment
  
## Tech Stack

### Frontend

- React + Vite + TypeScript
- Tasks, Shop, and Profile screens
- Runs at http://localhost:5173

Start the frontend with the root development command after the server and database are configured:

```bash
npm run dev
```

The web app calls `/api` by default. Vite proxies that path to the local server during development; in production, Express serves the frontend and API together from one origin.

Run `npm test` from the repository root for scheduling, image crop geometry, and crop payload validation tests.

Browser favicons, the Apple touch icon, and the Android web app manifest icons are served from `frontend/public`. Keep the icon links in `frontend/index.html` and the icon paths in `frontend/public/site.webmanifest` in sync when replacing them.

### Server

- Express + TypeScript API
- Zod shared schemas
- auth-service cookie login required for API routes
- API routes live in `server/src/routes`

Build or run the full application from the repository root:

```bash
npm run build
npm run dev
```

### Database

- MongoDB Atlas document database
- Direct cloud persistence through `MONGODB_URI`
- Seed data is optional and based on the supplied spreadsheet

1. Create a free MongoDB Atlas cluster and database user.
2. Copy `.env.development.example` to `.env.development` and fill in `MONGODB_URI`, `JWT_SECRET`, and auth-service values.
3. Install dependencies with `npm install`.
4. Optionally load starter data with `npm run seed`.

#### Connection troubleshooting

`querySrv ECONNREFUSED` means the DNS lookup for the Atlas cluster failed before the API could connect to MongoDB. Flushing the DNS cache does not fix a resolver that refuses SRV queries.

If your network permits public DNS, add `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` to `.env.development` and restart the API. This explicitly replaces Node's DNS resolver servers for SRV/TXT and other `dns.resolve*` calls throughout the API process; it does not change Windows DNS settings or hostname lookups through `dns.lookup`. Leave it unset to retain the system resolver. Use DNS servers approved for your network; the app never switches to public DNS automatically.

Alternatively, set `MONGODB_URI` to a standard `mongodb://` connection string supplied by Atlas. That avoids SRV/TXT discovery, but still requires hostname resolution and network access. Keep all Atlas-provided hosts, replica-set, authentication, and TLS settings; do not guess the hosts or disable TLS. Neither DNS option changes the selected database. Explicitly configure `maintenance-dev` for local development and `maintenance` for production, and keep auth-service pointed at the same database. Omitting the database path from a URI can select MongoDB's default `test` database.

Concurrent requests share one connection attempt. A failed connection or database initialization is closed and discarded so the next request (including the UI's **Retry** button) can try again. The API only caches the database after initialization succeeds; failures remain visible rather than returning empty data.

#### Data ownership and existing production data

Shop items, rules, task definitions, completions and ledgers are private to the signed-in user through a string `userId` field. The server assigns ownership and scopes reads, updates, deletes, related-record references and dashboard queries to that user. Ledgers also require ownership of the referenced item. Custom dropdown values are user-owned; built-in (`core: true`) dropdown values remain shared and cannot be deleted.

Legacy records without ownership are hidden, not automatically claimed by the next person who signs in. Use the dry-run-first [production migration runbook](database/PRODUCTION-MIGRATION.md) to copy an existing `test` database into `maintenance`, preserve both accounts and assign legacy data to the confirmed original owner. Do not change only the connection strings or rerun the seed.

### Authentication

Maintenance uses the shared auth-service the same way finances does: auth-service routes the login flow and signs the cookie, but the `maintenance` app's users live in this maintenance MongoDB database. In development, Vite proxies `/auth` to `VITE_AUTH_BASE_URL`, while the Express server proxies `/auth` to `AUTH_BASE_URL` when serving the built frontend from `localhost:8787`. In production, set both auth URLs to `https://auth.lnks.info` and configure auth-service with a `maintenance` app using cookie token mode.

Signed-in password changes call `PATCH /auth/account/password` with `{ currentPassword, password }`. Deploy an auth-service version that verifies the current password before updating it. The browser accepts the replacement HttpOnly session cookie via credentialed requests.

If a signup verification code expires, submit **Sign up** again with the original email and a valid password. Auth-service sends a fresh code for an existing unverified account, and the app opens the verification screen. The existing password and account are preserved; verified accounts still receive **Email already in use**. Sign-in continues to require email verification and never requests a code. The verification screen also offers **Resend code** and displays request failures and resend confirmations. Deploy the auth-service signup-retry change along with this frontend.

The API verifies the JWT from `AUTH_COOKIE_NAME` with audience `maintenance` and issuer `auth-service`, then checks the signed user id and `authVersion` against the local `users` collection. `/api/health` stays public for health checks, while all other `/api` routes require a valid maintenance user session cookie.

The API uses the database named in `MONGODB_URI` unless `MONGODB_DB` explicitly overrides it. Keep that effective database identical to auth-service's `ATLAS_URI_MAINTENANCE`; otherwise sign-in can succeed while API requests return `Unauthorized` because the API cannot find the signed-in user. Database or server configuration failures are reported as server errors, not invalid sessions.

Auth-service needs this app registered in each environment. Its app database URI must point at the same database used by this service:

```text
AUTH_APP_IDS=spice,finances,maintenance
AUTH_APP_NAME_MAINTENANCE=Maintenance
AUTH_TOKEN_MODE_MAINTENANCE=cookie
AUTH_ORIGINS_MAINTENANCE=http://localhost:5173,http://localhost:8787
ATLAS_URI_MAINTENANCE=mongodb+srv://<user>:<password>@<cluster>/<maintenance-dev-db>?appName=<app>
```

For production, use `AUTH_ORIGINS_MAINTENANCE=https://maintenance.lnks.info` and an `ATLAS_URI_MAINTENANCE` value for the production maintenance database.

## Deployment

Production hosts the frontend on Cloudflare Pages at `maintenance.lnks.info` and the API on Cloud Run at `api.maintenance.lnks.info`. Keep the frontend's Pages custom domain and the API's Cloud Run domain mapping separate.

The frontend defaults to `https://api.maintenance.lnks.info/api` for data requests and `https://auth.lnks.info` for authentication. To override these, set `VITE_API_BASE_URL` and `VITE_AUTH_BASE_URL` in the Cloudflare Pages production build environment, then rebuild the frontend. Cloud Run runtime variables do not change a previously built frontend. In development, requests stay on the localhost frontend origin: Vite proxies `/api` to the local API and `/auth` to the configured auth-service.

Set the following on Cloud Run, using Secret Manager for `MONGODB_URI` and `JWT_SECRET`, not a tracked `.env` file:

```text
MONGODB_URI=mongodb+srv://camjhirsh_db_user:URL_ENCODED_PASSWORD@cluster0.ejtoobf.mongodb.net/maintenance?appName=Cluster0
MONGODB_DB=maintenance
JWT_SECRET=same-secret-as-auth-service
AUTH_COOKIE_NAME=auth_session
AUTH_BASE_URL=https://auth.lnks.info
ALLOWED_ORIGINS=https://maintenance.lnks.info
```

The runtime image must include the built `shared` workspace because the API imports `@maintenance/shared` through npm's workspace link. On Cloud Run, leave `PORT` managed by the platform (normally `8080`); the server reads it automatically.

Map `api.maintenance.lnks.info` to Cloud Run. Its `/api/health` endpoint must return `{"ok":true}`; the same path on the Pages hostname may return frontend HTML. The Dockerfile also includes the built frontend, but Pages remains the public frontend host in this setup.

Deploy API changes to Cloud Run before publishing frontend features that depend on them to Pages. A successful Pages deployment does not update the Cloud Run API, and a healthy `/api/health` response does not verify that new routes are deployed.

If `GET /api/machines` fails with **500**, a browser CORS warning, and Cloud Run logs report **Response size was too large**, the combined item images exceeded Cloud Run's 32 MiB non-streaming HTTP/1 response limit. The item-list endpoint uses chunked JSON streaming so existing images and the response format remain unchanged without that buffered-response limit. Deploy the streaming API fix; changing CORS settings, increasing container memory, or deleting saved images is not required. Verify the signed-in item-list request succeeds, not just the unauthenticated health endpoint.

If dragging Shop items fails with `POST /api/machines/reorder` returning **404** and an HTML response (`Cannot POST /api/machines/reorder`), the serving API revision is missing the reorder route. Check Cloud Run **traffic**, not just successful build history: an explicit pin to an older revision remains in place when the build trigger updates the service image. The maintenance API must route 100% to **Latest**, rather than a named revision, to serve new successful deployments automatically. With production approval, restore that policy using:

```bash
gcloud run services update-traffic maintenance-api --to-latest --project maintenance-508912 --region us-east4
```

Before switching, confirm the latest revision is healthy and retains the intended database and authentication configuration. If no current revision exists, rebuild and deploy the service from this repository's Dockerfile first. No database migration is required for ordering. After switching, reorder items while signed in, confirm the request returns `200` with `{"updated":<item count>}`, and reload to confirm the saved order persists. A JSON `400` or `409` response instead indicates validation or changed items; follow its error message rather than treating it as a missing deployment.

Register `maintenance` in auth-service with `AUTH_TOKEN_MODE_MAINTENANCE=cookie`, `AUTH_ORIGINS_MAINTENANCE=https://maintenance.lnks.info`, `AUTH_COOKIE_DOMAIN_MAINTENANCE=.lnks.info`, and `ATLAS_URI_MAINTENANCE` pointed at this production maintenance database. The shared cookie domain allows auth-service's session cookie to reach the API subdomain. Both services must use the same JWT secret and cookie name.

### Domain model
- **machines**: hard facts, service start date, current odometer/date, status
- **rules**: reusable scheduling rules (`mileage`, `age`, `either`, `special`)
- **taskDefinitions**: master/hard-copy maintenance tasks assigned to a machine, with a rule + schedule parameters
- **completions**: immutable service history events (what actually happened, date, odometer, note)
- **instances**: derived API/UI objects representing the next/previous occurrence of a task; not a giant table that must stay synchronized
- **taskLedgers**: user/item-scoped manual sections, rows, and timeline entries, saved as an item-sized document
- **userappsettings**: app-specific profile username for each user

The main Tasks screen uses manual ledgers rather than generated schedules. The existing dashboard API and scheduling engine remain available for numeric odometer values and parseable dates; arbitrary free-text mileage/date values are not used as scheduling anchors.

### Scheduling semantics
For a recurring task, the next milestone is anchored to the latest completion if one exists; otherwise it is anchored to the machine's in-service date / starting odometer. `either` means the earlier of age or mileage. The engine reports overdue, due-soon, upcoming, or unscheduled.

This skeleton intentionally keeps scheduling logic in `server/src/services/due.ts` so it is easy to test and evolve.

## Architecture notes

### Why MongoDB
The data is naturally document-oriented and evolves easily. A machine can gain fields later without migrations, while tasks/rules/completions remain separately queryable collections.

### Collections

#### machines
One document per maintained object. `currentOdometer` is a current-state value for dashboard calculation; historical readings can later move into an `odometerReadings` collection if graphs/auditability are desired.

#### rules
Reusable scheduling semantics. Initial kinds:
- `mileage`
- `age`
- `either` (first trigger wins)
- `special` (seasonal/custom/manual hook)

#### taskDefinitions
The canonical "hard copy" of a maintenance task for a specific machine. It describes what the task is and its schedule parameters. This is the equivalent of the spreadsheet's Unique Tasks table.

#### completions
Append-only history. A completion is an actual performed/inspected event with date, odometer, note, and optional cost.

### Instances without instance-table explosion
An instance is a view of a task occurrence, not necessarily a database row. The next instance can be derived from:
1. task definition,
2. machine state,
3. latest completion,
4. selected rule.

For UI history dropdowns, fetch the completion history and represent:
- occurrence 1 = base task / first due milestone
- occurrence 2+ = repeated milestones anchored from prior completion

If later you need explicit deferred/skipped/acknowledged occurrences, add a small `taskOccurrenceOverrides` collection instead of materializing every future recurrence.

### Dashboard calculation
`services/due.ts` owns scheduling. Keep UI dumb: API returns already-calculated `DueInstance` objects. This makes rule semantics testable and prevents React components from becoming the source of truth.

## Future features that fit without redesign
- seasonal rules (`beforeWinter`, `afterWinter`, annual month/window)
- engine-hours instead of or alongside miles
- multiple counters per machine
- attachments/receipts
- service-provider history
- cost reporting
- odometer history
- JSON backup/export
