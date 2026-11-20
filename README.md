# PetFriend Shopify Backup (Google Apps Script)

Source of the Apps Script project `13oa6DgQzXe3rcPifGim1jWEvDcNHIEZ6pL_ZNni2W_52HRlA9dVwsCaq`.

- `Code.gs` – all functions (products / customers / inventory export, CSV export, theme backup, picklist email)
- `appsscript.json` – project manifest

Required Script Properties: `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`,
`SPREADSHEET_ID`, `DRIVE_FOLDER_ID`.

## Automatic sync GitHub → Apps Script

Every push to `main` that changes `Code.gs` or `appsscript.json` runs
`.github/workflows/deploy-apps-script.yml`, which uploads the code to the Apps Script
project with [clasp](https://github.com/google/clasp). You can also run it by hand
from the **Actions** tab ("Run workflow").

GitHub is the source of truth: edits made directly in the Apps Script editor are
overwritten on the next deploy, so make changes here.

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
3. Create the `SHOPIFY_CLIENT_SECRET` secret: in https://dev.shopify.com open the app,
   **Settings → Credentials**, click the copy button next to *Client secret*, and save it as
   a new repository secret named `SHOPIFY_CLIENT_SECRET`.
4. **Actions → Deploy to Google Apps Script → Run workflow.**

The Shopify secret is written into a generated `Secrets.gs` in the Apps Script project at
deploy time; it is never committed to GitHub. To change it later, update the GitHub secret and
run the workflow again.
