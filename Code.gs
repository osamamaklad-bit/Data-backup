function testShopifyConnection() {

  const props = PropertiesService.getScriptProperties();

  const store = props.getProperty('SHOPIFY_STORE');
  const clientId = props.getProperty('SHOPIFY_CLIENT_ID');
  const clientSecret = props.getProperty('SHOPIFY_CLIENT_SECRET');

  if (!store || !clientId || !clientSecret) {
    throw new Error(
      'Missing SHOPIFY_STORE, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET'
    );
  }

  // Step 1: Get temporary Admin API access token
  const tokenUrl =
    `https://${store}/admin/oauth/access_token`;

  const tokenResponse = UrlFetchApp.fetch(tokenUrl, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    },
    muteHttpExceptions: true
  });

  const tokenCode = tokenResponse.getResponseCode();
  const tokenBody = tokenResponse.getContentText();

  Logger.log('Token HTTP Status: ' + tokenCode);
  Logger.log(tokenBody);

  if (tokenCode !== 200) {
    throw new Error(
      'Could not obtain Shopify access token. HTTP ' +
      tokenCode +
      ': ' +
      tokenBody
    );
  }

  const tokenData = JSON.parse(tokenBody);

  if (!tokenData.access_token) {
    throw new Error(
      'Shopify did not return an access token: ' +
      tokenBody
    );
  }

  const accessToken = tokenData.access_token;

  // Step 2: Use the access token to call GraphQL Admin API
  const graphqlUrl =
    `https://${store}/admin/api/2026-10/graphql.json`;

  const query = `
    query {
      shop {
        name
        myshopifyDomain
      }
    }
  `;

  const response = UrlFetchApp.fetch(graphqlUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Shopify-Access-Token': accessToken
    },
    payload: JSON.stringify({
      query: query
    }),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  Logger.log('GraphQL HTTP Status: ' + code);
  Logger.log(body);

  if (code !== 200) {
    throw new Error(
      'Shopify GraphQL request failed. HTTP ' +
      code +
      ': ' +
      body
    );
  }

  const data = JSON.parse(body);

  if (data.errors) {
    throw new Error(
      'Shopify GraphQL error: ' +
      JSON.stringify(data.errors, null, 2)
    );
  }

  Logger.log(
    'SUCCESS! Connected to Shopify store: ' +
    data.data.shop.name
  );
}
function getShopifyAccessToken_() {
  const props = PropertiesService.getScriptProperties();

  const store = props.getProperty('SHOPIFY_STORE');
  const clientId = props.getProperty('SHOPIFY_CLIENT_ID');
  const clientSecret = props.getProperty('SHOPIFY_CLIENT_SECRET');

  if (!store || !clientId || !clientSecret) {
    throw new Error(
      'Missing SHOPIFY_STORE, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET'
    );
  }

  const url = `https://${store}/admin/oauth/access_token`;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code !== 200) {
    throw new Error(
      `Could not obtain Shopify access token. HTTP ${code}: ${body}`
    );
  }

  const data = JSON.parse(body);

  if (!data.access_token) {
    throw new Error(
      'Shopify did not return an access token.'
    );
  }

  return data.access_token;
}


function shopifyGraphQL_(query, variables) {

  const props = PropertiesService.getScriptProperties();
  const store = props.getProperty('SHOPIFY_STORE');

  const accessToken = getShopifyAccessToken_();

  const url =
    `https://${store}/admin/api/2026-10/graphql.json`;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Shopify-Access-Token': accessToken
    },
    payload: JSON.stringify({
      query: query,
      variables: variables || {}
    }),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code !== 200) {
    throw new Error(
      `Shopify GraphQL HTTP ${code}: ${body}`
    );
  }

  const data = JSON.parse(body);

  if (data.errors) {
    throw new Error(
      'Shopify GraphQL error:\n' +
      JSON.stringify(data.errors, null, 2)
    );
  }

  return data.data;
}
function exportShopifyProducts() {

  const props = PropertiesService.getScriptProperties();

  const spreadsheetId =
    props.getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is missing.');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  let sheet = ss.getSheetByName('Products');

  if (!sheet) {
    sheet = ss.insertSheet('Products');
  }

  sheet.clearContents();

  // =====================================================
  // HEADERS
  // =====================================================

  const headers = [

    'Handle',
    'Title',
    'Body (HTML)',
    'Vendor',
    'Product Category',
    'Type',
    'Tags',
    'Published',

    'Option1 Name',
    'Option1 Value',
    'Option1 Linked To',

    'Option2 Name',
    'Option2 Value',
    'Option2 Linked To',

    'Option3 Name',
    'Option3 Value',
    'Option3 Linked To',

    'Variant SKU',
    'Variant Grams',
    'Variant Inventory Tracker',
    'Variant Inventory Policy',
    'Variant Fulfillment Service',

    'Variant Price',
    'Variant Compare At Price',

    'Variant Requires Shipping',
    'Variant Taxable',

    'Unit Price Total Measure',
    'Unit Price Total Measure Unit',
    'Unit Price Base Measure',
    'Unit Price Base Measure Unit',

    'Variant Barcodes',

    'Image Src',
    'Image Position',
    'Image Alt Text',

    'Gift Card',

    'SEO Title',
    'SEO Description',

    'Google Shopping / Google Product Category',
    'Google Shopping / Gender',
    'Google Shopping / Age Group',
    'Google Shopping / MPN',
    'Google Shopping / Condition',
    'Google Shopping / Custom Product',
    'Google Shopping / Custom Label 0',
    'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2',
    'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4',

    'Variant Image',
    'Variant Weight Unit',
    'Variant Tax Code',
    'Cost per item',

    'Included / Egypt',
    'Price / Egypt',
    'Compare At Price / Egypt',

    'Included / Golf',
    'Price / Golf',
    'Compare At Price / Golf',

    'Status',

    'Variant Packed Length',
    'Variant Packed Width',
    'Variant Packed Height',
    'Variant Packed Dimension Unit'

  ];

  // =====================================================
  // GET METAFIELD DEFINITIONS SEPARATELY
  // =====================================================

  const metafieldQuery = `
    query {

      metafieldDefinitions(
        first: 250,
        ownerType: PRODUCT
      ) {

        nodes {
          name
          namespace
          key
        }

      }

    }
  `;

  const metafieldData =
    shopifyGraphQL_(metafieldQuery, {});

  const metafieldDefinitions =
    metafieldData.metafieldDefinitions.nodes || [];

  metafieldDefinitions.forEach(def => {

    headers.push(
      `${def.name} (product.metafields.${def.namespace}.${def.key})`
    );

  });

  // =====================================================
  // WRITE HEADERS
  // =====================================================

  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([headers]);

  // =====================================================
  // PRODUCT QUERY
  // REDUCED COST
  // =====================================================

  const query = `

    query getProducts($cursor: String) {

      products(
        first: 50,
        after: $cursor
      ) {

        pageInfo {
          hasNextPage
          endCursor
        }

        nodes {

          handle
          title
          descriptionHtml
          vendor
          productType
          tags
          status
          isGiftCard

          category {
            fullName
          }

          seo {
            title
            description
          }

          options {
            name
            position
          }

          media(first: 10) {

            nodes {

              ... on MediaImage {

                image {
                  url
                  altText
                }

              }

            }

          }

          metafields(first: 250) {

            nodes {
              namespace
              key
              value
            }

          }

          variants(first: 250) {

            nodes {

              sku
              barcode

              price
              compareAtPrice

              inventoryPolicy
              taxable

              selectedOptions {
                name
                value
              }

              unitPrice {
                amount
              }

              unitPriceMeasurement {
                quantityUnit
                referenceValue
                referenceUnit
              }

              inventoryItem {

                tracked
                requiresShipping

                unitCost {
                  amount
                }

                measurement {

                  weight {
                    value
                    unit
                  }

                }

              }

              media(first: 1) {

                nodes {

                  ... on MediaImage {

                    image {
                      url
                    }

                  }

                }

              }

            }

          }

        }

      }

    }

  `;

  // =====================================================
  // PAGINATION
  // =====================================================

  let cursor = null;

  let rows = [];

  let productCount = 0;
  let variantCount = 0;

  // =====================================================
  // GET PRODUCTS
  // =====================================================

  do {

    const data =
      shopifyGraphQL_(
        query,
        {
          cursor: cursor
        }
      );

    const products = data.products;

    products.nodes.forEach(product => {

      productCount++;

      // =================================================
      // OPTIONS
      // =================================================

      const options =
        product.options || [];

      const option1Name =
        options[0]
          ? options[0].name
          : '';

      const option2Name =
        options[1]
          ? options[1].name
          : '';

      const option3Name =
        options[2]
          ? options[2].name
          : '';

      // =================================================
      // METAFIELDS
      // =================================================

      const metafields = {};

      (
        product.metafields.nodes || []
      ).forEach(metafield => {

        const key =
          `${metafield.namespace}.${metafield.key}`;

        metafields[key] =
          metafield.value || '';

      });

      // =================================================
      // IMAGES
      // =================================================

      const images = [];

      (
        product.media.nodes || []
      ).forEach(media => {

        if (
          media.image &&
          media.image.url
        ) {

          images.push({

            url: media.image.url,

            alt:
              media.image.altText || ''

          });

        }

      });

      // =================================================
      // VARIANTS
      // =================================================

      const variants =
        product.variants.nodes || [];

      variants.forEach(variant => {

        variantCount++;

        // ===============================================
        // OPTION VALUES
        // ===============================================

        let option1Value = '';
        let option2Value = '';
        let option3Value = '';

        (
          variant.selectedOptions || []
        ).forEach(option => {

          if (option.name === option1Name) {
            option1Value = option.value;
          }

          if (option.name === option2Name) {
            option2Value = option.value;
          }

          if (option.name === option3Name) {
            option3Value = option.value;
          }

        });

        // ===============================================
        // INVENTORY ITEM
        // ===============================================

        const inventoryItem =
          variant.inventoryItem || {};

        // ===============================================
        // WEIGHT
        // ===============================================

        let grams = '';
        let weightUnit = '';

        if (
          inventoryItem.measurement &&
          inventoryItem.measurement.weight
        ) {

          const weight =
            inventoryItem.measurement.weight;

          weightUnit =
            weight.unit || '';

          if (weight.unit === 'GRAMS') {

            grams = weight.value;

          } else if (weight.unit === 'KILOGRAMS') {

            grams =
              Number(weight.value) * 1000;

          } else if (weight.unit === 'POUNDS') {

            grams =
              Number(weight.value) * 453.59237;

          } else if (weight.unit === 'OUNCES') {

            grams =
              Number(weight.value) * 28.349523125;

          } else {

            grams = weight.value;

          }

        }

        // ===============================================
        // UNIT PRICE
        // ===============================================

        let unitPriceTotal = '';
        let unitPriceTotalUnit = '';
        let unitPriceBase = '';
        let unitPriceBaseUnit = '';

        if (variant.unitPrice) {

          unitPriceTotal =
            variant.unitPrice.amount || '';

        }

        if (variant.unitPriceMeasurement) {

          const measurement =
            variant.unitPriceMeasurement;

          unitPriceTotalUnit =
            measurement.quantityUnit || '';

          unitPriceBase =
            measurement.referenceValue || '';

          unitPriceBaseUnit =
            measurement.referenceUnit || '';

        }

        // ===============================================
        // VARIANT IMAGE
        // ===============================================

        let variantImage = '';

        if (
          variant.media &&
          variant.media.nodes &&
          variant.media.nodes.length > 0 &&
          variant.media.nodes[0].image
        ) {

          variantImage =
            variant.media.nodes[0].image.url || '';

        }

        // ===============================================
        // COST
        // ===============================================

        let cost = '';

        if (inventoryItem.unitCost) {

          cost =
            inventoryItem.unitCost.amount || '';

        }

        // ===============================================
        // ROW
        // ===============================================

        const row = [

          product.handle || '',
          product.title || '',
          product.descriptionHtml || '',
          product.vendor || '',

          product.category
            ? product.category.fullName
            : '',

          product.productType || '',

          product.tags
            ? product.tags.join(', ')
            : '',

          product.status === 'ACTIVE'
            ? 'TRUE'
            : 'FALSE',

          option1Name,
          option1Value,
          '',

          option2Name,
          option2Value,
          '',

          option3Name,
          option3Value,
          '',

          variant.sku || '',
          grams,

          inventoryItem.tracked
            ? 'shopify'
            : '',

          variant.inventoryPolicy || '',

          '',

          variant.price || '',
          variant.compareAtPrice || '',

          inventoryItem.requiresShipping
            ? 'TRUE'
            : 'FALSE',

          variant.taxable
            ? 'TRUE'
            : 'FALSE',

          unitPriceTotal,
          unitPriceTotalUnit,
          unitPriceBase,
          unitPriceBaseUnit,

          variant.barcode || '',

          images.length > 0
            ? images[0].url
            : '',

          images.length > 0
            ? 1
            : '',

          images.length > 0
            ? images[0].alt
            : '',

          product.isGiftCard
            ? 'TRUE'
            : 'FALSE',

          product.seo
            ? product.seo.title || ''
            : '',

          product.seo
            ? product.seo.description || ''
            : '',

          // Google Shopping

          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',

          // Variant Image

          variantImage,

          // Weight Unit

          weightUnit,

          // Tax Code

          '',

          // Cost

          cost,

          // Egypt

          '',
          '',
          '',

          // Golf

          '',
          '',
          '',

          // Status

          product.status || '',

          // Packed dimensions

          '',
          '',
          '',
          ''

        ];

        // ===============================================
        // PRODUCT METAFIELDS
        // ===============================================

        metafieldDefinitions.forEach(def => {

          const key =
            `${def.namespace}.${def.key}`;

          row.push(
            metafields[key] || ''
          );

        });

        rows.push(row);

      });

    });

    cursor =
      products.pageInfo.hasNextPage
        ? products.pageInfo.endCursor
        : null;

  } while (cursor);

  // =====================================================
  // WRITE TO SHEET
  // =====================================================

  if (rows.length > 0) {

    sheet
      .getRange(
        2,
        1,
        rows.length,
        headers.length
      )
      .setValues(rows);

  }

  // =====================================================
  // FORMAT
  // =====================================================

  sheet.setFrozenRows(1);

  sheet.autoResizeColumns(
    1,
    headers.length
  );

  // =====================================================
  // LOG
  // =====================================================

  Logger.log(
    '===================================='
  );

  Logger.log(
    `Products exported: ${productCount}`
  );

  Logger.log(
    `Variants exported: ${variantCount}`
  );

  Logger.log(
    `Rows written: ${rows.length}`
  );

  Logger.log(
    `Columns written: ${headers.length}`
  );

  Logger.log(
    '===================================='
  );
}
function exportShopifyCustomers() {

  const spreadsheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is missing from Script Properties.');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  let sheet = ss.getSheetByName('Customers');

  if (!sheet) {
    sheet = ss.insertSheet('Customers');
  }

  sheet.clearContents();

  const headers = [
    'Customer ID',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Orders Count',
    'Total Spent',
    'Currency',
    'State',
    'Tags',
    'Created At',
    'Updated At'
  ];

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers]);

  const query = `
    query getCustomers($cursor: String) {

      customers(first: 250, after: $cursor) {

        pageInfo {
          hasNextPage
          endCursor
        }

        nodes {

          id

          firstName
          lastName

          email
          phone

          numberOfOrders

          amountSpent {
            amount
            currencyCode
          }

          state

          tags

          createdAt
          updatedAt
        }
      }
    }
  `;

  let cursor = null;

  let rows = [];
  let customerCount = 0;

  do {

    const data = shopifyGraphQL_(query, {
      cursor: cursor
    });

    const customers = data.customers;

    customers.nodes.forEach(customer => {

      customerCount++;

      rows.push([
        customer.id || '',
        customer.firstName || '',
        customer.lastName || '',
        customer.email || '',
        customer.phone || '',
        customer.numberOfOrders || 0,
        customer.amountSpent
          ? customer.amountSpent.amount
          : '',
        customer.amountSpent
          ? customer.amountSpent.currencyCode
          : '',
        customer.state || '',
        customer.tags
          ? customer.tags.join(', ')
          : '',
        customer.createdAt || '',
        customer.updatedAt || ''
      ]);

    });

    cursor = customers.pageInfo.hasNextPage
      ? customers.pageInfo.endCursor
      : null;

  } while (cursor);

  if (rows.length > 0) {

    sheet
      .getRange(
        2,
        1,
        rows.length,
        headers.length
      )
      .setValues(rows);

  }

  sheet.setFrozenRows(1);

  sheet.autoResizeColumns(
    1,
    headers.length
  );

  Logger.log(
    `Customers exported: ${customerCount}`
  );

  Logger.log(
    `Rows written: ${rows.length}`
  );
}
function exportSheetToCSV_(sheetName, fileName) {

  const props = PropertiesService.getScriptProperties();

  const spreadsheetId =
    props.getProperty('SPREADSHEET_ID');

  const folderId =
    props.getProperty('DRIVE_FOLDER_ID');

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is missing.');
  }

  if (!folderId) {
    throw new Error('DRIVE_FOLDER_ID is missing.');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      `Sheet "${sheetName}" does not exist.`
    );
  }

  const data = sheet.getDataRange().getValues();

  if (data.length === 0) {
    throw new Error(
      `Sheet "${sheetName}" is empty.`
    );
  }

  const csv = data
    .map(row =>
      row.map(value =>
        csvEscape_(value)
      ).join(',')
    )
    .join('\r\n');

  const folder =
    DriveApp.getFolderById(folderId);

  folder.createFile(
    fileName,
    csv,
    MimeType.PLAIN_TEXT
  );

  Logger.log(
    `CSV created: ${fileName}`
  );
}


function csvEscape_(value) {

  if (value === null || value === undefined) {
    return '';
  }

  let text = String(value);

  // Protect against commas, quotes and line breaks
  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    text = '"' +
      text.replace(/"/g, '""') +
      '"';
  }

  return text;
}


function exportCSVFiles() {

  const today =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );

  exportSheetToCSV_(
    'Products',
    `Shopify_Products_${today}.csv`
  );

  exportSheetToCSV_(
    'Customers',
    `Shopify_Customers_${today}.csv`
  );

  exportSheetToCSV_(
    'Inventory',
    `Shopify_Inventory_${today}.csv`
  );
  Logger.log(
    'Products and Customers and Inventory CSV files created successfully.'
  );
}
function backupLiveShopifyTheme() {

  const props = PropertiesService.getScriptProperties();

  const folderId = props.getProperty('DRIVE_FOLDER_ID');

  if (!folderId) {
    throw new Error('DRIVE_FOLDER_ID is missing.');
  }

  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );

  // Find the currently published/live theme
  const themeQuery = `
    query {
      themes(first: 1, roles: [MAIN]) {
        nodes {
          id
          name
          role
        }
      }
    }
  `;

  const themeData = shopifyGraphQL_(themeQuery, {});

  const themes = themeData.themes.nodes;

  if (!themes || themes.length === 0) {
    throw new Error('No MAIN/live Shopify theme was found.');
  }

  const theme = themes[0];

  Logger.log(
    `Live theme found: ${theme.name} (${theme.id})`
  );

  // Get all theme files
  const filesQuery = `
    query GetThemeFiles($themeId: ID!, $cursor: String) {

      theme(id: $themeId) {

        id
        name
        role

        files(first: 250, after: $cursor) {

          nodes {

            filename

            body {

              ... on OnlineStoreThemeFileBodyText {
                content
              }

              ... on OnlineStoreThemeFileBodyBase64 {
                contentBase64
              }

              ... on OnlineStoreThemeFileBodyUrl {
                url
              }

            }

          }

          pageInfo {
            hasNextPage
            endCursor
          }

        }

      }

    }
  `;

  let cursor = null;
  let blobs = [];
  let fileCount = 0;

  do {

    const data = shopifyGraphQL_(
      filesQuery,
      {
        themeId: theme.id,
        cursor: cursor
      }
    );

    if (!data.theme) {
      throw new Error('Could not retrieve live theme.');
    }

    const files = data.theme.files;

    files.nodes.forEach(file => {

      if (!file.filename || !file.body) {
        return;
      }

      let blob;

      // Text file
      if (
        file.body.content !== undefined &&
        file.body.content !== null
      ) {

        blob = Utilities.newBlob(
          file.body.content,
          'text/plain',
          file.filename
        );

      }

      // Base64 file
      else if (
        file.body.contentBase64 !== undefined &&
        file.body.contentBase64 !== null
      ) {

        const bytes = Utilities.base64Decode(
          file.body.contentBase64
        );

        blob = Utilities.newBlob(
          bytes,
          'application/octet-stream',
          file.filename
        );

      }

      // URL-based file
      else if (
        file.body.url !== undefined &&
        file.body.url !== null
      ) {

        const response = UrlFetchApp.fetch(
          file.body.url,
          {
            muteHttpExceptions: true
          }
        );

        const responseCode =
          response.getResponseCode();

        if (responseCode >= 200 && responseCode < 300) {

          blob = response.getBlob()
            .setName(file.filename);

        } else {

          Logger.log(
            `Could not download ${file.filename}. HTTP ${responseCode}`
          );

          return;
        }

      }

      if (blob) {
        blobs.push(blob);
        fileCount++;
      }

    });

    cursor = files.pageInfo.hasNextPage
      ? files.pageInfo.endCursor
      : null;

  } while (cursor);

  if (blobs.length === 0) {
    throw new Error(
      'No theme files were retrieved.'
    );
  }

  Logger.log(
    `Theme files retrieved: ${fileCount}`
  );

  // Create ZIP
  const zipName =
    `PetFriend_Theme_${today}.zip`;

  const zipBlob =
    Utilities.zip(
      blobs,
      zipName
    );

  // Save ZIP to Drive
  const folder =
    DriveApp.getFolderById(folderId);

  const file =
    folder.createFile(zipBlob);

  Logger.log(
    `Theme backup created: ${file.getName()}`
  );

  Logger.log(
    `Drive file ID: ${file.getId()}`
  );

  Logger.log(
    `Live theme: ${theme.name}`
  );
}
function exportShopifyInventory() {

  const props = PropertiesService.getScriptProperties();

  const spreadsheetId =
    props.getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is missing.');
  }

  // =====================================================
  // OPEN SPREADSHEET
  // =====================================================

  const ss =
    SpreadsheetApp.openById(spreadsheetId);

  let sheet =
    ss.getSheetByName('Inventory');

  if (!sheet) {
    sheet =
      ss.insertSheet('Inventory');
  }

  // Clear previous export
  sheet.clearContents();


  // =====================================================
  // HEADERS
  // =====================================================

  const headers = [

    'Handle',
    'Title',

    'Option1 Name',
    'Option1 Value',

    'Option2 Name',
    'Option2 Value',

    'Option3 Name',
    'Option3 Value',

    'SKU',

    'HS Code',
    'COO',

    'Location',
    'Bin name',

    'Incoming (not editable)',
    'Unavailable (not editable)',
    'Committed (not editable)',
    'Available (not editable)',

    'On hand (current)',
    'On hand (new)',

    'Variant Packed Length',
    'Variant Packed Width',
    'Variant Packed Height',
    'Variant Packed Dimension Unit'

  ];


  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([headers]);


  // =====================================================
  // QUERY
  // =====================================================
  //
  // IMPORTANT:
  // We deliberately use small pagination values.
  // This keeps GraphQL query cost below Shopify's
  // single-query maximum of 1000.
  //
  // =====================================================

  const query = `

    query getProducts($cursor: String) {

      products(
        first: 10,
        after: $cursor
      ) {

        pageInfo {

          hasNextPage
          endCursor

        }

        nodes {

          handle
          title

          options {

            name
            position

          }

          variants(
            first: 25
          ) {

            nodes {

              sku

              selectedOptions {

                name
                value

              }

              inventoryItem {

                inventoryLevels(
                  first: 20
                ) {

                  nodes {

                    location {

                      name

                    }

                    quantities(
                      names: [
                        "incoming"
                        "damaged"
                        "quality_control"
                        "reserved"
                        "safety_stock"
                        "committed"
                        "available"
                        "on_hand"
                      ]
                    ) {

                      name
                      quantity

                    }

                  }

                }

              }

            }

          }

        }

      }

    }

  `;


  // =====================================================
  // PAGINATION
  // =====================================================

  let cursor = null;

  let rows = [];

  let productCount = 0;

  let variantCount = 0;

  let locationCount = 0;


  // =====================================================
  // PROCESS PRODUCTS
  // =====================================================

  do {

    const data =
      shopifyGraphQL_(
        query,
        {
          cursor: cursor
        }
      );


    const products =
      data.products;


    // ===================================================
    // PRODUCTS
    // ===================================================

    products.nodes.forEach(product => {

      productCount++;


      // =================================================
      // OPTIONS
      // =================================================

      const options =
        product.options || [];


      const option1Name =
        options[0]
          ? options[0].name
          : '';


      const option2Name =
        options[1]
          ? options[1].name
          : '';


      const option3Name =
        options[2]
          ? options[2].name
          : '';


      // =================================================
      // VARIANTS
      // =================================================

      const variants =
        product.variants.nodes || [];


      variants.forEach(variant => {

        variantCount++;


        // ===============================================
        // OPTION VALUES
        // ===============================================

        let option1Value = '';

        let option2Value = '';

        let option3Value = '';


        (
          variant.selectedOptions || []
        ).forEach(option => {

          if (
            option.name === option1Name
          ) {

            option1Value =
              option.value;

          }


          if (
            option.name === option2Name
          ) {

            option2Value =
              option.value;

          }


          if (
            option.name === option3Name
          ) {

            option3Value =
              option.value;

          }

        });


        // ===============================================
        // INVENTORY LEVELS
        // ===============================================

        const inventoryLevels =

          variant.inventoryItem &&
          variant.inventoryItem.inventoryLevels &&
          variant.inventoryItem.inventoryLevels.nodes

            ? variant.inventoryItem.inventoryLevels.nodes

            : [];


        // ===============================================
        // NO INVENTORY LOCATION
        // ===============================================

        if (
          inventoryLevels.length === 0
        ) {

          rows.push([

            product.handle || '',
            product.title || '',

            option1Name,
            option1Value,

            option2Name,
            option2Value,

            option3Name,
            option3Value,

            variant.sku || '',

            '',
            '',
            '',
            '',

            0,
            0,
            0,
            0,

            0,
            '',

            '',
            '',
            '',
            ''

          ]);

          return;

        }


        // ===============================================
        // LOCATIONS
        // ===============================================

        inventoryLevels.forEach(level => {

          locationCount++;


          // =============================================
          // QUANTITIES
          // =============================================

          const quantities = {};


          (
            level.quantities || []
          ).forEach(quantity => {

            quantities[
              quantity.name
            ] =
              quantity.quantity;

          });


          // =============================================
          // VALUES
          // =============================================

          const incoming =
            quantities.incoming !== undefined
              ? quantities.incoming
              : 0;


          const unavailable =
            (quantities.damaged || 0) +
            (quantities.quality_control || 0) +
            (quantities.reserved || 0) +
            (quantities.safety_stock || 0);


          const committed =
            quantities.committed !== undefined
              ? quantities.committed
              : 0;


          const available =
            quantities.available !== undefined
              ? quantities.available
              : 0;


          const onHand =
            quantities.on_hand !== undefined
              ? quantities.on_hand
              : 0;


          // =============================================
          // LOCATION
          // =============================================

          const locationName =

            level.location
              ? level.location.name || ''
              : '';


          // =============================================
          // ROW
          // =============================================

          rows.push([

            product.handle || '',
            product.title || '',

            option1Name,
            option1Value,

            option2Name,
            option2Value,

            option3Name,
            option3Value,

            variant.sku || '',

            '', // HS Code
            '', // COO

            locationName,

            '', // Bin name

            incoming,
            unavailable,
            committed,
            available,

            onHand,

            '', // On hand new

            '', // Packed Length
            '', // Packed Width
            '', // Packed Height
            ''  // Packed Dimension Unit

          ]);

        });

      });

    });


    // ===================================================
    // NEXT PAGE
    // ===================================================

    cursor =

      products.pageInfo.hasNextPage

        ? products.pageInfo.endCursor

        : null;


  } while (cursor);


  // =====================================================
  // WRITE RESULTS
  // =====================================================

  if (rows.length > 0) {

    sheet
      .getRange(
        2,
        1,
        rows.length,
        headers.length
      )
      .setValues(rows);

  }


  // =====================================================
  // FORMAT
  // =====================================================

  sheet.setFrozenRows(1);


  sheet.autoResizeColumns(
    1,
    headers.length
  );


  // =====================================================
  // LOG
  // =====================================================

  Logger.log(
    '===================================='
  );

  Logger.log(
    `Products processed: ${productCount}`
  );

  Logger.log(
    `Variants processed: ${variantCount}`
  );

  Logger.log(
    `Inventory locations processed: ${locationCount}`
  );

  Logger.log(
    `Rows written: ${rows.length}`
  );

  Logger.log(
    `Columns written: ${headers.length}`
  );

  Logger.log(
    'Inventory export completed successfully.'
  );

  Logger.log(
    '===================================='
  );

}
function checkNewOrdersAndEmailPicklist() {

  const props = PropertiesService.getScriptProperties();

  const spreadsheetId = props.getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is missing.');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  let sheet = ss.getSheetByName('Picklist');

  if (!sheet) {
    sheet = ss.insertSheet('Picklist');
  }

  // =====================================================
  // LAST RUN
  // =====================================================

  let lastRun = props.getProperty('PICKLIST_LAST_RUN');

  if (!lastRun) {
    lastRun = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  }

  // =====================================================
  // EXPORTED ORDER HISTORY
  // =====================================================

  let exportedOrders = {};

  const exportedOrdersJson = props.getProperty('PICKLIST_EXPORTED_ORDERS');

  if (exportedOrdersJson) {
    try {
      exportedOrders = JSON.parse(exportedOrdersJson);
    } catch (error) {
      exportedOrders = {};
    }
  }

  // =====================================================
  // SHOPIFY QUERY
  // =====================================================

  const query = `

    query getUpdatedOrders(
      $cursor: String,
      $orderQuery: String
    ) {

      orders(
        first: 100,
        after: $cursor,
        query: $orderQuery,
        sortKey: UPDATED_AT,
        reverse: false
      ) {

        pageInfo {
          hasNextPage
          endCursor
        }

        nodes {

          id
          name
          cancelledAt
          displayFulfillmentStatus
          displayFinancialStatus
          tags

          lineItems(first: 100) {

            nodes {

              quantity
              title
              variantTitle

              variant {

                id
                sku
                title

                image {
                  url
                  altText
                }

                product {

                  id
                  title

                  featuredImage {
                    url
                    altText
                  }

                  metafield(
                    namespace: "custom",
                    key: "bin_location"
                  ) {
                    value
                  }

                }

                metafield(
                  namespace: "custom",
                  key: "bin_location"
                ) {
                  value
                }

              }

            }

          }

        }

      }

    }

  `;

  // =====================================================
  // SEARCH UPDATED ORDERS
  // =====================================================

  const orderQuery = `updated_at:>${lastRun}`;

  let cursor = null;

  const productsMap = {};

  let eligibleOrderCount = 0;
  let skippedAlreadyExported = 0;
  let skippedNotEligible = 0;

  const ordersToMarkAsExported = [];

  // =====================================================
  // GET ORDERS
  // =====================================================

  do {

    const data = shopifyGraphQL_(
      query,
      {
        cursor: cursor,
        orderQuery: orderQuery
      }
    );

    const orders = data.orders;

    orders.nodes.forEach(order => {

      // IGNORE CANCELLED ORDERS
      if (order.cancelledAt) {
        return;
      }

      // PREVENT DUPLICATE EXPORT
      if (exportedOrders[order.id]) {
        skippedAlreadyExported++;
        return;
      }

      // FULFILLMENT STATUS
      const fulfillmentStatus = order.displayFulfillmentStatus || '';

      if (fulfillmentStatus !== 'UNFULFILLED') {
        skippedNotEligible++;
        return;
      }

      // TAGS
      const tags = (order.tags || []).map(tag =>
        tag.toString().trim().toLowerCase()
      );

      const hasConfirmedTag = tags.includes('confirmed');
      const hasNotConfirmedTag = tags.includes('not confirmed yet');

      // FINANCIAL STATUS
      const financialStatus = order.displayFinancialStatus || '';
      const isPaid = financialStatus === 'PAID';

      // ELIGIBILITY RULE
      // 1) UNFULFILLED + confirmed AND NOT "not confirmed yet"
      // OR
      // 2) UNFULFILLED + PAID regardless of tags
      const confirmedOrder = hasConfirmedTag && !hasNotConfirmedTag;
      const paidOrder = isPaid;
      const eligible = confirmedOrder || paidOrder;

      if (!eligible) {
        skippedNotEligible++;
        return;
      }

      // THIS ORDER IS ELIGIBLE
      eligibleOrderCount++;

      const orderNumber = order.name || '';

      ordersToMarkAsExported.push(order.id);

      // LINE ITEMS
      (order.lineItems.nodes || []).forEach(lineItem => {

        const variant = lineItem.variant;

        if (!variant) {
          return;
        }

        const product = variant.product || {};

        // PRODUCT TITLE
        const productTitle =
          lineItem.title ||
          product.title ||
          variant.title ||
          'Unknown Product';

        // VARIANT NAME (hide "Default Title")
        const rawVariantName =
          lineItem.variantTitle ||
          variant.title ||
          '';

        const variantName =
          rawVariantName && rawVariantName !== 'Default Title'
            ? rawVariantName
            : '';

        // IMAGE: variant image first, then product featured image
        const imageUrl =
          (variant.image && variant.image.url) ||
          (product.featuredImage && product.featuredImage.url) ||
          '';

        // SKU
        const sku = variant.sku || '';

        // PRODUCT BIN
        const productMetafield = product.metafield || null;
        const productBin = productMetafield ? productMetafield.value || '' : '';

        // VARIANT BIN
        const variantMetafield = variant.metafield || null;
        const variantBin = variantMetafield ? variantMetafield.value || '' : '';

        // QUANTITY
        const quantity = Number(lineItem.quantity) || 0;

        // UNIQUE VARIANT
        const productKey = variant.id;

        if (!productsMap[productKey]) {

          productsMap[productKey] = {
            imageUrl: imageUrl,
            title: productTitle,
            variantName: variantName,
            sku: sku,
            quantity: quantity,
            productBin: productBin,
            variantBin: variantBin,
            orders: [orderNumber]
          };

        } else {

          const entry = productsMap[productKey];

          entry.quantity += quantity;

          if (!entry.orders.includes(orderNumber)) {
            entry.orders.push(orderNumber);
          }

          if (!entry.imageUrl && imageUrl) {
            entry.imageUrl = imageUrl;
          }

          if (!entry.productBin && productBin) {
            entry.productBin = productBin;
          }

          if (!entry.variantBin && variantBin) {
            entry.variantBin = variantBin;
          }

          if (!entry.variantName && variantName) {
            entry.variantName = variantName;
          }

        }

      });

    });

    cursor = orders.pageInfo.hasNextPage
      ? orders.pageInfo.endCursor
      : null;

  } while (cursor);

  // =====================================================
  // NO ELIGIBLE ORDERS
  // =====================================================

  if (eligibleOrderCount === 0) {

    Logger.log('No eligible new orders found.');
    Logger.log('Already exported: ' + skippedAlreadyExported);
    Logger.log('Not eligible: ' + skippedNotEligible);

    props.setProperty('PICKLIST_LAST_RUN', new Date().toISOString());

    return;

  }

  // =====================================================
  // CLEAR OLD PICKLIST
  // =====================================================

  sheet.clear();

  // TITLE
  sheet.getRange(1, 1, 1, 7).merge();
  sheet.getRange('A1').setValue('PetFriend Pick List');
  sheet.getRange('A1')
    .setFontSize(18)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  // GENERATED TIME
  sheet.getRange(2, 1, 1, 7).merge();
  sheet.getRange('A2').setValue(
    'Generated: ' +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm:ss'
    )
  );
  sheet.getRange('A2').setHorizontalAlignment('center');

  // HEADERS
  const headers = [
    'Image',
    'Product Title',
    'SKU',
    'Quantity',
    'Bin Location',
    'Variant Bin Location',
    'Order Numbers'
  ];

  sheet.getRange(4, 1, 1, headers.length).setValues([headers]);

  sheet.getRange(4, 1, 1, headers.length)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  // SORT BY BIN
  const products = Object.values(productsMap);

  products.sort((a, b) => {

    const binA = (a.variantBin || a.productBin || '').toString();
    const binB = (b.variantBin || b.productBin || '').toString();

    return binA.localeCompare(
      binB,
      undefined,
      { numeric: true, sensitivity: 'base' }
    );

  });

  // WRITE BASIC DATA
  const rows = products.map(product => [

    '',

    product.variantName
      ? product.title + ' - ' + product.variantName
      : product.title,

    product.sku,
    product.quantity,
    product.productBin,
    product.variantBin,
    product.orders.join(', ')

  ]);

  if (rows.length > 0) {
    sheet.getRange(5, 1, rows.length, headers.length).setValues(rows);
  }

  // INSERT IMAGES
  products.forEach((product, index) => {

    if (!product.imageUrl) {
      return;
    }

    try {

      const altText = product.variantName
        ? product.title + ' - ' + product.variantName
        : product.title;

      const image = SpreadsheetApp
        .newCellImage()
        .setSourceUrl(product.imageUrl)
        .setAltTextDescription(altText)
        .setAltTextTitle(altText)
        .build();

      sheet.getRange(index + 5, 1).setValue(image);

    } catch (error) {

      Logger.log(
        'Could not insert image for ' +
        product.title +
        ': ' +
        error.message
      );

    }

  });

  // ROW HEIGHT
  if (rows.length > 0) {
    sheet.setRowHeights(5, rows.length, 85);
  }

  // COLUMN WIDTHS
  sheet.setColumnWidth(1, 90);
  sheet.setColumnWidth(2, 300);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 180);
  sheet.setColumnWidth(7, 250);

  // FORMATTING
  sheet.setFrozenRows(4);

  const tableRange = sheet.getRange(4, 1, rows.length + 1, headers.length);

  tableRange.setBorder(true, true, true, true, true, true);
  tableRange.setVerticalAlignment('middle');
  tableRange.setWrap(true);

  // =====================================================
  // CREATE PDF
  // =====================================================

  SpreadsheetApp.flush();

  const pdfBlob = createPicklistPdf_(
    ss.getId(),
    sheet.getSheetId()
  );

  // =====================================================
  // SEND EMAIL
  // =====================================================

  MailApp.sendEmail({

    to: 'osamamaklad@gmail.com,kamaldweek0@gmail.com,samirvet84@gmail.com',

    subject: `PetFriend Pick List - ${eligibleOrderCount} New Order(s)`,

    body:
      `PetFriend Pick List

Eligible orders: ${eligibleOrderCount}
Products: ${products.length}

Generated automatically from Shopify.

Please find the Pick List PDF attached.`,

    attachments: [pdfBlob]

  });

  // =====================================================
  // MARK ORDERS AS EXPORTED
  // =====================================================

  ordersToMarkAsExported.forEach(orderId => {
    exportedOrders[orderId] = {
      exportedAt: new Date().toISOString()
    };
  });

  props.setProperty(
    'PICKLIST_EXPORTED_ORDERS',
    JSON.stringify(exportedOrders)
  );

  // SAVE LAST RUN
  props.setProperty('PICKLIST_LAST_RUN', new Date().toISOString());

  // LOG
  Logger.log('Picklist sent successfully.');
  Logger.log('Eligible orders: ' + eligibleOrderCount);
  Logger.log('Products: ' + products.length);
  Logger.log('Already exported: ' + skippedAlreadyExported);
  Logger.log('Not eligible: ' + skippedNotEligible);

}


// =====================================================
// CREATE PICKLIST PDF
// =====================================================

function createPicklistPdf_(spreadsheetId, sheetId) {

  const url =
    'https://docs.google.com/spreadsheets/d/' +
    spreadsheetId +
    '/export?' +
    'format=pdf' +
    '&gid=' + sheetId +
    '&size=A4' +
    '&portrait=true' +
    '&fitw=true' +
    '&sheetnames=false' +
    '&printtitle=false' +
    '&pagenumbers=true' +
    '&gridlines=false' +
    '&fzr=true';

  const token = ScriptApp.getOAuthToken();

  const response = UrlFetchApp.fetch(
    url,
    {
      headers: {
        Authorization: 'Bearer ' + token
      }
    }
  );

  if (response.getResponseCode() !== 200) {
    throw new Error(
      'Could not create Picklist PDF. HTTP ' +
      response.getResponseCode()
    );
  }

  return response
    .getBlob()
    .setName('PetFriend Pick List.pdf');

}


function createPicklistTrigger() {

  ScriptApp.getProjectTriggers().forEach(t => {

    if (
      t.getHandlerFunction() === 'scheduledPicklistCheck' ||
      t.getHandlerFunction() === 'checkNewOrdersAndEmailPicklist'
    ) {
      ScriptApp.deleteTrigger(t);
    }

  });

  ScriptApp.newTrigger('scheduledPicklistCheck')
    .timeBased()
    .everyMinutes(10)
    .create();

}


// ISO day: Monday = 1 ... Friday = 5 ... Sunday = 7
function scheduledPicklistCheck() {

  const now = new Date();
  const tz = Session.getScriptTimeZone();

  const day = Number(Utilities.formatDate(now, tz, 'u'));
  const hour = Number(Utilities.formatDate(now, tz, 'H'));

  // Friday: disabled
  if (day === 5) {
    Logger.log('Friday - Picklist is disabled.');
    return;
  }

  // Working window: 10:00 AM to before 2:00 PM
  if (hour < 10 || hour >= 14) {
    Logger.log('Outside Picklist working hours.');
    return;
  }

  checkNewOrdersAndEmailPicklist();

}