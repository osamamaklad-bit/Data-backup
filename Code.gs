function testShopifyConnection() {

  const data = shopifyGraphQL_(`
    query {
      shop {
        name
        myshopifyDomain
      }
    }
  `, {});

  Logger.log(
    'SUCCESS! Connected to Shopify store: ' +
    data.shop.name + ' (' + data.shop.myshopifyDomain + ')'
  );
}

function getShopifyAccessToken_() {

  // Option A: a fixed Admin API access token (shpat_...) from a custom app.
  // If this Script Property is set, it is used directly and the
  // client-credentials login below is skipped.
  const fixedToken = (
    PropertiesService.getScriptProperties().getProperty('SHOPIFY_ACCESS_TOKEN') || ''
  ).trim();

  // Only real Admin API tokens start with shpat_ (ignore anything else,
  // e.g. a client secret saved here by mistake).
  if (fixedToken.indexOf('shpat_') === 0) {
    return fixedToken;
  }

  // Option B: client-credentials login (Dev Dashboard app).
  const cache = CacheService.getScriptCache();
  const cached = cache.get('SHOPIFY_ACCESS_TOKEN');

  if (cached) {
    return cached;
  }

  const props = PropertiesService.getScriptProperties();

  const store = (props.getProperty('SHOPIFY_STORE') || '').trim();
  const clientId = (props.getProperty('SHOPIFY_CLIENT_ID') || '').trim();
  // A secret delivered by the GitHub deploy (Secrets.gs, generated from the
  // repository secret SHOPIFY_CLIENT_SECRET) takes priority over the
  // Script Property, so the secret can be updated from GitHub.
  const clientSecret = (
    (typeof DEPLOY_SHOPIFY_CLIENT_SECRET !== 'undefined' && DEPLOY_SHOPIFY_CLIENT_SECRET) ||
    props.getProperty('SHOPIFY_CLIENT_SECRET') ||
    ''
  ).trim();

  if (!store || !clientId || !clientSecret) {
    throw new Error(
      'Missing SHOPIFY_STORE, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET ' +
      '(or set SHOPIFY_ACCESS_TOKEN instead)'
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
    // Shopify returns an HTML page; keep only the readable reason
    const reason =
      (body.match(/What happened\?<\/h3>\s*<div[^>]*>([^<]*)/) || [])[1] ||
      body.slice(0, 300);

    throw new Error(
      `Could not obtain Shopify access token. HTTP ${code}: ${reason.trim()}`
    );
  }

  const data = JSON.parse(body);

  if (!data.access_token) {
    throw new Error(
      'Shopify did not return an access token.'
    );
  }

  // Reuse the token instead of requesting a new one on every API call.
  // Cache for 50 minutes (or less if Shopify says it expires sooner).
  const expiresIn = Number(data.expires_in) || 3600;
  const ttl = Math.max(60, Math.min(3000, expiresIn - 300));
  cache.put('SHOPIFY_ACCESS_TOKEN', data.access_token, ttl);

  return data.access_token;
}

function shopifyGraphQL_(query, variables) {

  const props = PropertiesService.getScriptProperties();
  const store = (props.getProperty('SHOPIFY_STORE') || '').trim();

  if (!store) {
    throw new Error('SHOPIFY_STORE is missing.');
  }

  const url =
    `https://${store}/admin/api/2026-10/graphql.json`;

  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    const accessToken = getShopifyAccessToken_();

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

    // Expired / revoked token: drop the cached one and try again
    if (code === 401 && attempt < maxAttempts) {
      CacheService.getScriptCache().remove('SHOPIFY_ACCESS_TOKEN');
      continue;
    }

    // Rate limited or temporary Shopify error: wait and retry
    if ((code === 429 || code >= 500) && attempt < maxAttempts) {
      Utilities.sleep(2000 * attempt);
      continue;
    }

    if (code !== 200) {
      throw new Error(
        `Shopify GraphQL HTTP ${code}: ${body}`
      );
    }

    const data = JSON.parse(body);

    if (data.errors) {

      const throttled = data.errors.some(e =>
        e.extensions && e.extensions.code === 'THROTTLED'
      );

      if (throttled && attempt < maxAttempts) {
        Utilities.sleep(2000 * attempt);
        continue;
      }

      throw new Error(
        'Shopify GraphQL error:\n' +
        JSON.stringify(data.errors, null, 2)
      );
    }

    // Stay ahead of the rate limit: if the bucket is nearly empty, pause
    const cost = data.extensions && data.extensions.cost;

    if (cost && cost.throttleStatus) {

      const status = cost.throttleStatus;
      const needed = cost.requestedQueryCost || 0;

      if (status.currentlyAvailable < needed * 2 && status.restoreRate) {
        const waitMs = Math.ceil(
          (needed * 2 - status.currentlyAvailable) / status.restoreRate
        ) * 1000;
        Utilities.sleep(Math.min(waitMs, 10000));
      }

    }

    return data.data;
  }

  throw new Error('Shopify GraphQL request failed after retries.');
}
const PRODUCT_EXPORT_VARIANT_FRAGMENT_ = `
  fragment ExportVariantFields on ProductVariant {

  sku

  barcodes(first: 20) {
    nodes {
      value
    }
  }

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
`;

/**
 * Products with more than 100 variants: fetch the remaining
 * variants page by page so nothing is skipped.
 */
function getRemainingProductVariants_(productId, cursor) {

  const query = `
    query getMoreVariants($id: ID!, $cursor: String) {
      product(id: $id) {
        variants(first: 100, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ...ExportVariantFields
          }
        }
      }
    }
  ` + PRODUCT_EXPORT_VARIANT_FRAGMENT_;

  const result = [];

  while (cursor) {

    const data = shopifyGraphQL_(query, { id: productId, cursor: cursor });

    const variants = data.product.variants;

    result.push.apply(result, variants.nodes || []);

    cursor = variants.pageInfo.hasNextPage
      ? variants.pageInfo.endCursor
      : null;
  }

  return result;
}

/**
 * Google Sheets turns text like "+2012..." or "00123" or ISO dates
 * into numbers/dates when written. Mark these columns as plain text
 * first so phone numbers, SKUs, barcodes and IDs are kept exactly.
 */
function setTextColumns_(sheet, headers, columnNames, rowCount) {

  if (rowCount < 1) {
    return;
  }

  columnNames.forEach(name => {

    const index = headers.indexOf(name);

    if (index !== -1) {
      sheet
        .getRange(2, index + 1, rowCount, 1)
        .setNumberFormat('@');
    }

  });
}

/**
 * Products with more than 10 images: fetch the rest.
 */
function getRemainingProductMedia_(productId, cursor) {

  const query = `
    query getMoreMedia($id: ID!, $cursor: String) {
      product(id: $id) {
        media(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on MediaImage {
              image {
                url
                altText
              }
            }
          }
        }
      }
    }
  `;

  const result = [];

  while (cursor) {

    const data = shopifyGraphQL_(query, { id: productId, cursor: cursor });

    const media = data.product.media;

    result.push.apply(result, media.nodes || []);

    cursor = media.pageInfo.hasNextPage
      ? media.pageInfo.endCursor
      : null;
  }

  return result;
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
        first: 25,
        after: $cursor
      ) {

        pageInfo {
          hasNextPage
          endCursor
        }

        nodes {

          id
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

            pageInfo {
              hasNextPage
              endCursor
            }

            nodes {

              ... on MediaImage {

                image {
                  url
                  altText
                }

              }

            }

          }

          metafields(first: 100) {

            nodes {
              namespace
              key
              value
            }

          }

          variants(first: 100) {

            pageInfo {
              hasNextPage
              endCursor
            }

            nodes {
              ...ExportVariantFields
            }

          }

        }

      }

    }

  ` + PRODUCT_EXPORT_VARIANT_FRAGMENT_;

  // =====================================================
  // PAGINATION
  // =====================================================

  let cursor = null;

  let rows = [];

  let productCount = 0;
  let variantCount = 0;
  let imageRowCount = 0;

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

      const mediaNodes = (product.media.nodes || []).slice();

      if (product.media.pageInfo.hasNextPage) {
        mediaNodes.push.apply(
          mediaNodes,
          getRemainingProductMedia_(
            product.id,
            product.media.pageInfo.endCursor
          )
        );
      }

      mediaNodes.forEach(media => {

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
        (product.variants.nodes || []).slice();

      if (product.variants.pageInfo.hasNextPage) {
        variants.push.apply(
          variants,
          getRemainingProductVariants_(
            product.id,
            product.variants.pageInfo.endCursor
          )
        );
      }

      variants.forEach((variant, variantIndex) => {

        variantCount++;

        // Image 1 goes on the first variant row only
        const firstImage =
          variantIndex === 0 && images.length > 0
            ? images[0]
            : null;

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

          weightUnit = {
            GRAMS: 'g',
            KILOGRAMS: 'kg',
            POUNDS: 'lb',
            OUNCES: 'oz'
          }[weight.unit] || '';

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

          variant.inventoryPolicy
            ? variant.inventoryPolicy.toLowerCase()
            : '',

          'manual',

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

          variant.barcodes && variant.barcodes.nodes
            ? variant.barcodes.nodes.map(b => b.value).join(', ')
            : '',

          firstImage ? firstImage.url : '',

          firstImage ? 1 : '',

          firstImage ? firstImage.alt : '',

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

      // =================================================
      // EXTRA IMAGES (Shopify CSV format)
      // Image 1 is on the first variant row; every other
      // image gets its own row with only Handle + image
      // columns filled in.
      // =================================================

      images.slice(1).forEach((image, index) => {

        const imageRow = new Array(headers.length).fill('');

        imageRow[headers.indexOf('Handle')] = product.handle || '';
        imageRow[headers.indexOf('Image Src')] = image.url;
        imageRow[headers.indexOf('Image Position')] = index + 2;
        imageRow[headers.indexOf('Image Alt Text')] = image.alt;

        rows.push(imageRow);
        imageRowCount++;

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

    setTextColumns_(
      sheet,
      headers,
      [
        'Handle',
        'Option1 Value',
        'Option2 Value',
        'Option3 Value',
        'Variant SKU',
        'Variant Barcodes',
        'Tags'
      ],
      rows.length
    );

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
    `Extra image rows: ${imageRowCount}`
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

          defaultEmailAddress {
            emailAddress
          }

          defaultPhoneNumber {
            phoneNumber
          }

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
        customer.defaultEmailAddress
          ? customer.defaultEmailAddress.emailAddress || ''
          : '',
        customer.defaultPhoneNumber
          ? customer.defaultPhoneNumber.phoneNumber || ''
          : '',
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

    setTextColumns_(
      sheet,
      headers,
      ['Customer ID', 'Phone', 'Tags', 'Created At', 'Updated At'],
      rows.length
    );

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
    MimeType.CSV
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
const INVENTORY_VARIANT_FRAGMENT_ = `
  fragment InventoryVariantFields on ProductVariant {

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
`;

function getRemainingInventoryVariants_(productId, cursor) {

  const query = `
    query getMoreInventoryVariants($id: ID!, $cursor: String) {
      product(id: $id) {
        variants(first: 25, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ...InventoryVariantFields
          }
        }
      }
    }
  ` + INVENTORY_VARIANT_FRAGMENT_;

  const result = [];

  while (cursor) {

    const data = shopifyGraphQL_(query, { id: productId, cursor: cursor });

    const variants = data.product.variants;

    result.push.apply(result, variants.nodes || []);

    cursor = variants.pageInfo.hasNextPage
      ? variants.pageInfo.endCursor
      : null;
  }

  return result;
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

          id

          variants(
            first: 25
          ) {

            pageInfo {
              hasNextPage
              endCursor
            }

            nodes {
              ...InventoryVariantFields
            }

          }

        }

      }

    }

  ` + INVENTORY_VARIANT_FRAGMENT_;

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
        (product.variants.nodes || []).slice();

      if (product.variants.pageInfo.hasNextPage) {
        variants.push.apply(
          variants,
          getRemainingInventoryVariants_(
            product.id,
            product.variants.pageInfo.endCursor
          )
        );
      }

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

    setTextColumns_(
      sheet,
      headers,
      ['Handle', 'Option1 Value', 'Option2 Value', 'Option3 Value', 'SKU'],
      rows.length
    );

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

/**
 * ONE-TIME CLEANUP for the removed Picklist feature.
 * Run once from the editor: deletes the old 10-minute picklist trigger
 * (otherwise it keeps failing with "Script function not found") and
 * the PICKLIST_* Script Properties. Safe to run more than once.
 */
function removeOldPicklistSetup() {

  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(trigger => {

    const handler = trigger.getHandlerFunction();

    if (
      handler === 'scheduledPicklistCheck' ||
      handler === 'checkNewOrdersAndEmailPicklist'
    ) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }

  });

  const props = PropertiesService.getScriptProperties();

  props.deleteProperty('PICKLIST_LAST_RUN');
  props.deleteProperty('PICKLIST_EXPORTED_ORDERS');

  Logger.log(`Picklist triggers removed: ${removed}`);
  Logger.log('PICKLIST_* properties removed.');
}
