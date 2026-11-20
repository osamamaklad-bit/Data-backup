# PetFriend Shopify Backup (Google Apps Script)

Source of the Apps Script project `13oa6DgQzXe3rcPifGim1jWEvDcNHIEZ6pL_ZNni2W_52HRlA9dVwsCaq`.

- `Code.gs` – all functions (products / customers / inventory export, CSV export, theme backup, picklist email)
- `appsscript.json` – project manifest

Required Script Properties: `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`,
`SPREADSHEET_ID`, `DRIVE_FOLDER_ID`.

To deploy: open the script in the Apps Script editor and paste `Code.gs` over the existing `Code` file
(or use `clasp push` with a `.clasp.json` pointing at the script ID).
