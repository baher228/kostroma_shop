# Local email feature testing, 2026-10-10

Active checkout: `C:\Users\george\projects\kostroma_shop-1\email-downloading-discount`.
Branch: `email-downloading-discount`, merged with `origin/master` at
`333e2ccfcaf694aef2359cd40e4bc7355655a304`. The previous AI QC checkout,
including its Git history, local settings and uncommitted changes, is archived
at `..\.archives\qc`.

## Open and sign in

Open <http://127.0.0.1:5173>. Dashboard login is `admin`, using the password in
`.local-runtime/account.json`; credentials are deliberately excluded from Git.
The additional `email_admin` account uses the same password for direct API tests.
RU API runs on port 4000, Dubai API on port 4001, and Vite proxies `/ru` and
`/dxb` to these processes. Both backends use new local databases on a dedicated
PostgreSQL 16 instance at `127.0.0.1:5545`:

- `analitika_email_ru`: local accounts and RU data;
- `analitika_email_ops`: promotion data for manual testing;
- `analitika_email_pipeline_test`: disposable automated integration data.

Existing local R2 and Google Drive settings were retained in ignored env files.
Manual uploads use the configured R2 bucket; the automated tests use fake storage
and Gmail clients and make no cloud writes. Local metadata is separate from
production metadata. The new databases initially contain seeded products/shops
and no imported promotion documents.

## Try the promotion screens

Open the promotions screen and its document panel. Sample files are in
`.local-runtime/test-documents`; upload in order:

1. `01-price.xlsx` as retail price list;
2. `02-plan.csv` as two-month promotion plan;
3. `03-invoice.pdf` as invoice.

Then try document preview, the current final table, single price tags and the
combined A4 PDF for selected rows. Sample dates are October 4–10, 2026; use the
selected-row scope when testing outside that interval. Drive poster availability
depends on the templates in the configured folder.

Web OAuth client configuration is now installed locally. No real mailbox is
connected until the administrator presses **Connect Gmail** in the document
panel and grants consent. Follow [gmail-import.md](gmail-import.md). Gmail
integration tests use simulated messages and do not read a real mailbox.

## Restart

From this checkout, run in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-email-dev.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-email-dev.ps1
```

The start script expects the initialized local database, ignored env files,
installed dependencies and compiled backends. It launches hidden processes and
records their PIDs/start times. The stop script checks their command lines and
start times before stopping them; it stops only this PostgreSQL data directory.
Logs are in `.local-runtime/*.stdout.log`, `*.stderr.log` and `postgres.log`.

After editing backend code, run `npm run backend:build` before restarting.

## Validation completed

- `npm run ci`: frontend/worker/backend type checks, dashboard tests/build,
  53 RU tests, 117 Dubai tests, Compose validation — passed.
- Real PostgreSQL smoke: migrations, PDF recognition, import ordering,
  Gmail → document → parser → promotion row → A4 PDF, restart deduplication,
  nested rollback, storage compensation and poll locking — passed.
- OAuth PostgreSQL smoke: expiring browser-bound one-time states, persistent
  single mailbox, disconnect and mailbox-scoped import claims — passed.
- HTTP smoke through Vite: dashboard, both health endpoints, local manager
  login, RU-issued Ops token, promotion rows/documents and Gmail status — passed.

Production Gmail app configuration uses individual GitHub environment secrets;
the mailbox owner completes consent in the dashboard after deployment.
