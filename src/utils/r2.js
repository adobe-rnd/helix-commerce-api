/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable no-await-in-loop */

export async function setSyncTimestamp(ctx, config) {
  const { log } = ctx;
  const timestampKey = `${config.tenant}/${config.store}/.helix/last-sync.json`;
  const timestampData = {
    lastSyncDate: new Date().toISOString(),
  };

  await ctx.env.CATALOG_BUCKET.put(timestampKey, JSON.stringify(timestampData), {
    httpMetadata: {
      contentType: 'application/json',
    },
  });

  log.debug('Set last sync timestamp', timestampData);
  log.debug(`${config.tenant}/${config.store}/.helix/last-sync.json`);
}

export async function getSyncTimestamp(ctx, config) {
  const timestampKey = `${config.tenant}/${config.store}/.helix/last-sync.json`;
  const object = await ctx.env.CATALOG_BUCKET.get(timestampKey);

  if (!object) {
    return new Date(0);
  }

  const timestampData = await object.json();
  return new Date(timestampData.lastSyncDate);
}

// Helper function to load product from R2 using SKU
export async function loadProductFromR2(ctx, config, sku) {
  const key = `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/${sku}.json`;
  const object = await ctx.env.CATALOG_BUCKET.get(key);

  if (!object) {
    // Product not found in R2
    return null;
  }

  // Convert the object to JSON and return
  const productData = await object.text();

  // Return the product as a parsed object
  return JSON.parse(productData);
}

export async function saveProductsToR2(ctx, config, products) {
  const { log } = ctx;
  const BATCH_SIZE = 50;

  const storeProductsBatch = async (batch) => {
    const storePromises = batch.map(async (product) => {
      try {
        const { sku, name, urlKey } = product;
        const key = `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/${sku}.json`;
        const body = JSON.stringify(product);
        const customMetadata = { sku, name, urlKey };

        const productPromise = ctx.env.CATALOG_BUCKET.put(key, body, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata,
        });

        if (urlKey) {
          const metadataKey = `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/urlkeys/${urlKey}`;
          const metadataPromise = ctx.env.CATALOG_BUCKET.put(metadataKey, '', {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata,
          });
          return Promise.all([productPromise, metadataPromise]);
        } else {
          return productPromise;
        }
      } catch (error) {
        log.error(`Error storing product ${JSON.stringify(product)}:`, error);
        return Promise.resolve();
      }
    });

    return Promise.all(storePromises);
  };

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    await storeProductsBatch(batch);
  }
}

export async function listAllProducts(ctx, config) {
  const bucket = ctx.env.CATALOG_BUCKET;

  console.log(`${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/`);
  const listResponse = await bucket.list({ prefix: `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/` });
  const files = listResponse.objects;

  const batchSize = 50; // Define the batch size
  const customMetadataArray = [];

  const excludeDirectory = `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/ urlkeys/`;

  // Helper function to split the array into chunks of a specific size
  function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  // Split the files array into chunks of 50
  const fileChunks = chunkArray(files, batchSize);

  // Process each chunk sequentially
  for (const chunk of fileChunks) {
    // Run the requests for this chunk in parallel
    const chunkResults = await Promise.all(
      chunk
        .filter((file) => !file.key.includes('last-sync.json') && !file.key.startsWith(excludeDirectory))
        .map(async (file) => {
          const objectKey = file.key;

          // Fetch the head response for each file
          const headResponse = await bucket.head(objectKey);

          if (headResponse) {
            const { customMetadata } = headResponse;

            return {
              fileName: objectKey,
              customMetadata: customMetadata || {},
            };
          } else {
            return {
              fileName: objectKey,
              customMetadata: {},
            };
          }
        }),
    );

    // Append the results of this chunk to the overall results array
    customMetadataArray.push(...chunkResults);
  }

  return customMetadataArray;
}
