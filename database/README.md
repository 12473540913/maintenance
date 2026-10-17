`seed.json` was generated from the supplied Maintenance Sheet workbook and is only starter data.

`npm run seed` is destructive to the four starter collections. Once you start using the application, do not casually rerun it against your real database.

For the existing shared-data production database, follow the
[production migration runbook](PRODUCTION-MIGRATION.md). It covers copying
`test` to `maintenance`, preserving accounts, explicitly assigning legacy
ownership, and updating both Maintenance and auth-service configuration.
