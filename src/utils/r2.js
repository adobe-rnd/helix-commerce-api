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

import { errorWithResponse } from './http.js';

/* eslint-disable no-await-in-loop */

/**
 * Load product by SKU
 * @param {Context} ctx - The context object.
 * @param {Config} config - The config object.
 * @param {string} sku - The SKU of the product.
 * @returns {Promise<Product>} - A promise that resolves to the product.
 */
export async function fetchProduct(ctx, config, sku) {
  const key = `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/products/${sku}.json`;
  const object = await ctx.env.CATALOG_BUCKET.get(key);

  if (!object) {
    // Product not found in R2
    throw errorWithResponse(404, 'Product not found');
  }

  // Convert the object to JSON and return
  const productData = await object.text();

  // Return the product as a parsed object
  return JSON.parse(productData);
}

/**
 * Save products
 * @param {Context} ctx - The context object.
 * @param {Config} config - The config object.
 * @param {Product[]} products - The products to save.
 * @returns {Promise<void>} - A promise that resolves when the products are saved.
 */
export async function saveProducts(ctx, config, products) {
  const { log } = ctx;
  const BATCH_SIZE = 50;

  const storeProductsBatch = async (batch) => {
    const storePromises = batch.map(async (product) => {
      try {
        const { name, urlKey } = product;
        const { sku } = config;
        const key = `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/products/${sku}.json`;
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

/**
 * Resolve SKU from a URL key
 * @param {Context} ctx - The context object.
 * @param {Config} config - The config object.
 * @param {string} urlKey - The URL key.
 * @returns {Promise<string>} - A promise that resolves to the SKU.
 */
export async function lookupSku(ctx, config, urlKey) {
  // Make a HEAD request to retrieve the SKU from metadata based on the URL key
  const urlKeyPath = `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/urlkeys/${urlKey}`;
  const headResponse = await ctx.env.CATALOG_BUCKET.head(urlKeyPath);

  if (!headResponse || !headResponse.customMetadata?.sku) {
    // SKU not found for the provided URL key
    throw errorWithResponse(404, 'Product not found');
  }
  // Return the resolved SKU
  return headResponse.customMetadata.sku;
}

/**
 * List all products from R2
 * @param {Context} ctx - The context object.
 * @param {Config} config - The config object.
 * @returns {Promise<Product[]>} - A promise that resolves to the products.
 */
export async function listAllProducts(ctx, config) {
  const bucket = ctx.env.CATALOG_BUCKET;

  const listResponse = await bucket.list({ prefix: `${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/products/` });
  const files = listResponse.objects;

  const batchSize = 50; // Define the batch size
  const customMetadataArray = [];

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
      chunk.map(async (file) => {
        const objectKey = file.key;

        // Fetch the head response for each file
        const headResponse = await bucket.head(objectKey);

        if (headResponse) {
          const { customMetadata } = headResponse;
          const { sku } = customMetadata;
          return {
            ...customMetadata,
            links: {
              product: `${ctx.url.origin}/${config.org}/${config.site}/${config.env}/catalog/${config.storeCode}/${config.storeViewCode}/product/${sku}`,
            },
          };
        } else {
          return {
            fileName: objectKey,
          };
        }
      }),
    );

    // Append the results of this chunk to the overall results array
    customMetadataArray.push(...chunkResults);
  }

  return customMetadataArray;
}
