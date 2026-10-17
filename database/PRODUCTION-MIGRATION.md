# Production repair: `test` to `maintenance`

Changing the database name does not fix shared data. Deploy the user-isolation
code as part of this cutover and explicitly assign the legacy records to the
first user, camjhirsh. Do not recreate either account or change their `_id`s.

These are operator-run steps, not an automatic startup migration. No production
connection is needed to build or test the code.

## 1. Pause access and prepare

- Block public Maintenance access and pause all Maintenance writes, including
  auth-service signup, verification, password changes and account updates for
  this app. Keep writes paused through the copy, migration and verification.
  Ensure old Cloud Run revisions cannot continue serving requests.
- Install MongoDB Database Tools (`mongodump`, `mongorestore`) and `mongosh`
  locally. Use an Atlas database user with access to both databases and permit
  your IP in Atlas Network Access.
- Privately set `ATLAS_CLUSTER_URI` in your local PowerShell environment to the
  Atlas cluster connection string with **no application database in the path**:
  `mongodb+srv://<credentials>@<cluster>/?authSource=admin&<existing-options>`.
  Preserve required Atlas TLS/replica-set options. Do not paste credentials in
  chat, commit them, print them or include them in logs. Database Tools receive
  this URI as a process argument; run on a trusted machine.
- Back up the current Maintenance and auth-service configuration/secret
  references for rollback.

Connect using `mongosh` (or use the equivalent Atlas shell):

```powershell
mongosh "$env:ATLAS_CLUSTER_URI"
```

In the shell, verify the source accounts and record collection counts:

```javascript
const source = db.getSiblingDB("test");
source.users.find({}, { _id: 1, email: 1 }).toArray();
source.getCollectionNames().sort().forEach(name =>
  print(name + ": " + source.getCollection(name).countDocuments({})));
if (db.getSiblingDB("maintenance").getCollectionNames().length !== 0) {
  throw new Error("maintenance already contains collections. Stop; do not merge or overwrite it.");
}
```

Confirm camjhirsh's exact email and copy that account's `_id`. The migration
requires both values to match. If `maintenance` is not empty, stop and determine
what it contains before proceeding.

## 2. Back up and copy the entire database

In PowerShell, with writes still paused:

```powershell
$backup = Join-Path $env:USERPROFILE 'maintenance-prod-before-ownership.archive.gz'
if (Test-Path $backup) { throw 'Backup already exists. Choose a new backup filename.' }
mongodump --uri "$env:ATLAS_CLUSTER_URI" --db test --archive="$backup" --gzip
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; do not continue.' }

mongorestore --uri "$env:ATLAS_CLUSTER_URI" --archive="$backup" --gzip --nsInclude='test.*' --nsFrom='test.*' --nsTo='maintenance.*' --stopOnError
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; keep traffic paused and investigate.' }
```

There is intentionally no `--drop`. Restore only into an empty destination;
do not blindly retry a partial restore. Keep the archive private: it contains
account password hashes and shop data.

This copies **all collections and indexes**, including `users`, `machines`,
`taskLedgers`, `userappblobs` and `userappsettings`. Verify that every collection
count matches the source, that both user `_id`s and account fields are preserved,
and that indexes were restored successfully. Do not copy just `machines`.

In `mongosh`, compare collection counts before the ownership migration:

```javascript
const from = db.getSiblingDB("test");
const to = db.getSiblingDB("maintenance");
from.getCollectionNames().sort().forEach(name => {
  const before = from.getCollection(name).countDocuments({});
  const after = to.getCollection(name).countDocuments({});
  print(name + ": source=" + before + ", destination=" + after);
  if (before !== after) throw new Error("Count mismatch: " + name);
});
```

## 3. Claim legacy data in the destination

From the repository root, privately set `MONGODB_URI` to the Atlas URI for
`/maintenance`, then run:

```powershell
npm run migrate:ownership -w @maintenance/api -- --db maintenance --owner-id '<CAMJHIRSH_OBJECT_ID>' --owner-email '<CAMJHIRSH_EMAIL>'
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed; do not apply.' }
```

This is a **read-only dry run**. The script does not load local dotenv files,
run API initialization, or infer an owner from account creation order.
Review the counts. It assigns only missing/null `userId` fields in:

- `machines`
- `rules`
- `taskDefinitions`
- `completions`
- `taskLedgers`
- non-core `validationValues`

Ownership uses the user's **ObjectId rendered as a string**, matching the
authenticated API. Existing owners, users, profiles, app blobs and shared core
dropdown values are not rewritten. Unowned records stay hidden until claimed.

If preflight reports a foreign-owned, duplicate or orphan ledger, **stop**.
The old app allowed each user to save a ledger against the same machine, so
there can be competing versions. Export those ledger documents and review them
before deciding which sections/history to preserve for camjhirsh. Do not
mass-update all ledger owners: that can violate the unique
`{ userId, machineId }` index and discard the distinction between versions.
Reconcile only the destination while traffic is paused, retaining the source
and backup as evidence.

After a clean dry run, apply:

```powershell
npm run migrate:ownership -w @maintenance/api -- --db maintenance --owner-id '<CAMJHIRSH_OBJECT_ID>' --owner-email '<CAMJHIRSH_EMAIL>' --apply
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; keep traffic paused.' }
```

The writes run in one MongoDB transaction (supported by Atlas), with another
preflight inside that transaction. A post-commit check verifies no eligible
unowned records remain. Re-running is safe: existing owners are preserved.
Do not bypass transaction errors with non-transactional updates.

## 4. Update both services and deploy

| Service | Variable | Required production value |
| --- | --- | --- |
| Maintenance API / Cloud Run | `MONGODB_URI` | Existing Atlas cluster URI with `/maintenance` explicitly in the path |
| Maintenance API / Cloud Run | `MONGODB_DB` | `maintenance` (overrides the URI database) |
| auth-service | `ATLAS_URI_MAINTENANCE` | Same cluster and `/maintenance` database, preserving its credentials/options |

If Cloud Run variables reference Secret Manager, update the appropriate secret
version/reference and deploy a revision that uses it. Deploy the Maintenance
API with the user-isolation changes, and redeploy/restart auth-service with its
updated app URI. No frontend variable change is needed for this database move.
Keep `JWT_SECRET`, cookie configuration, origins and URLs unchanged. A URI with
no database path can silently select MongoDB's default `test` database.

Do not resume public access until both services target the destination and no
old API/auth revision can write to `test`.

## 5. Verify both accounts, then reopen

With access limited to the operator:

1. Sign in as camjhirsh. Verify every original item, image and task history.
2. Sign in as the second user. Shop and tasks should be empty; core dropdown
   values are intentionally shared.
3. Create one item under the second user. Verify it is invisible to camjhirsh.
4. Verify both users can save their own item and ledger, and that using the
   other user's item ID cannot update/delete it or save a ledger against it
   (the API returns 404).
5. Verify profile settings and password/sign-in behavior still work for both
   accounts. Check logs for database/index/authentication errors.
6. Reopen traffic only after those checks pass. Retain `test` and the backup
   privately until the new deployment is confirmed stable. Do not delete them
   as part of this procedure.

Before reopening writes, rollback can restore **both** services' old database
configuration and route to the new isolated API against the untouched `test`
database. Legacy unowned shop records will be hidden there until ownership is
also migrated; do not return traffic to the old shared-data API to make them
visible. After new writes occur in `maintenance`, do not switch back blindly:
pause writes and reconcile the databases first.

MongoDB documents database copying using namespace remapping in its
[mongorestore examples](https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-examples/).
