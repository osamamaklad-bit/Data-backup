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

### One-time setup

1. Turn on the Apps Script API: https://script.google.com/home/usersettings
2. On your computer (needs Node.js), log in with the Google account that owns the script:

   ```bash
   npx @google/clasp@2.4.2 login
   ```

3. Copy the contents of the file it creates, `~/.clasprc.json`
   (Windows: `C:\Users\<you>\.clasprc.json`).
4. In GitHub: repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `CLASPRC_JSON`
   - Value: the file contents
5. Merge this branch into `main` (or run the workflow manually).

`.claspignore` makes sure only `Code.gs` and `appsscript.json` are uploaded.
