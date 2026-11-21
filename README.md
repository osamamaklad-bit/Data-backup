# PetFriend Shopify Backup (Google Apps Script)

Source of the Apps Script project `13oa6DgQzXe3rcPifGim1jWEvDcNHIEZ6pL_ZNni2W_52HRlA9dVwsCaq`.

- `Code.gs` – all functions (products / customers / inventory export, CSV export, theme backup)
- `appsscript.json` – project manifest

Required Script Properties: `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`,
`SPREADSHEET_ID`, `DRIVE_FOLDER_ID`.

## Automatic sync GitHub → Apps Script

Every push to `main` that changes `Code.gs` or `appsscript.json` runs
`.github/workflows/deploy-apps-script.yml`, which uploads the code to the Apps Script
project with [clasp](https://github.com/google/clasp). You can also run it by hand
from the **Actions** tab ("Run workflow").

## Sync back Apps Script → GitHub

`.github/workflows/pull-from-apps-script.yml` runs once a day at 03:23 Cairo time (and on demand from the
**Actions** tab: "Sync back from Google Apps Script") and commits any edits made in the
Apps Script editor back into this repo.

Avoid editing in both places at once: before changing code on GitHub, run the sync-back
workflow first, otherwise the deploy overwrites editor changes that were not synced yet.

### One-time setup (all from the browser)

1. Turn on the Apps Script API: https://script.google.com/home/usersettings
2. Create the `CLASPRC_JSON` secret (lets GitHub upload to Apps Script):
   - On the repo page click **Code → Codespaces → Create codespace on this branch**.
   - In the terminal at the bottom run:
     ```bash
     npx @google/clasp@2.4.2 login --no-localhost
     ```
     Open the link it prints, allow access with the Google account that owns the script,
     and paste the code back into the terminal.
   - Run `cat ~/.clasprc.json` and copy everything it prints.
   - Repo **Settings → Secrets and variables → Actions → New repository secret**:
     name `CLASPRC_JSON`, value = what you copied.
   - Delete the codespace afterwards (github.com/codespaces).
3. In the Apps Script project, under **Project Settings → Script Properties**, set
   `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` (copy the secret from
   https://dev.shopify.com → the app → **Settings → Credentials**). Deploys never touch
   Script Properties.
4. **Actions → Deploy to Google Apps Script → Run workflow.**
