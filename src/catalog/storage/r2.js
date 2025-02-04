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

import { callPreviewPublish } from '../../utils/admin.js';
import { BatchProcessor } from '../../utils/batch.js';
import { errorWithResponse } from '../../utils/http.js';

/* eslint-disable no-await-in-loop, max-len */

export default class StorageClient {
  /**
   * Constructs a new StorageClient instance.
   * @param {Context} ctx - The context object
   * @param {Config} config - The configuration object.
   */
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }

  /**
   * Load product by SKU.
   * @param {string} sku - The SKU of the product.
   * @returns {Promise<Product>} - A promise that resolves to the product.
   */
  async fetchProduct(sku) {
    const { log } = this.ctx;
    const key = `${this.config.org}/${this.config.site}/${this.config.storeCode}/${this.config.storeViewCode}/products/${sku}.json`;
    log.debug('Fetching product from R2:', key);

    const object = await this.ctx.env.CATALOG_BUCKET.get(key);
    if (!object) {
      // Product not found in R2
      throw errorWithResponse(404, 'Product not found');
    }

    const productData = await object.json();
    productData.attributeMap = Object.fromEntries((productData.attributes ?? [])
      .map(({ name, value }) => [name, value]));
    (productData.variants ?? []).forEach((variant) => {
      variant.attributeMap = Object.fromEntries((variant.attributes ?? [])
        .map(({ name, value }) => [name, value]));
    });

    return productData;
  }

  /**
   * Save products in batches
   * @param {Product[]} products - The products to save.
   * @returns {Promise<Partial<BatchResult>[]>} - Resolves with an array of save results.
   */
  async saveProducts(products) {
    const processor = new BatchProcessor(this.ctx, (batch) => this.storeProductsBatch(batch));
    const saveResults = await processor.process(products);

    this.ctx.log.info(`Completed saving ${products.length} products.`);

    return saveResults;
  }

  /**
   * Handler function to process a batch of products.
   * @param {Product[]} batch - An array of products to save.
   * @returns {Promise<Partial<BatchResult>[]>} - Resolves with an array of save results.
   */
  async storeProductsBatch(batch) {
    const storePromises = batch.map(async (product) => {
      const { sku, name } = product;
      const key = `${this.config.org}/${this.config.site}/${this.config.storeCode}/${this.config.storeViewCode}/products/${sku}.json`;
      const body = JSON.stringify(product);

      try {
        const customMetadata = { sku, name };

        const { urlKey } = product;
        if (urlKey) {
          customMetadata.urlKey = urlKey;
        }

        // Attempt to save the product
        const putResponse = await this.ctx.env.CATALOG_BUCKET.put(key, body, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata,
        });

        // If urlKey exists, save the urlKey metadata
        if (urlKey) {
          const metadataKey = `${this.config.org}/${this.config.site}/${this.config.storeCode}/${this.config.storeViewCode}/urlkeys/${urlKey}`;
          await this.ctx.env.CATALOG_BUCKET.put(metadataKey, '', {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata,
          });
        }

        const adminResponse = await callPreviewPublish(this.config, 'POST', sku, urlKey);

        /**
         * @type {Partial<BatchResult>}
         */
        const result = {
          sku,
          status: putResponse.status,
          message: 'Product saved successfully.',
          ...adminResponse.paths,
        };

        return result;
      } catch (error) {
        this.ctx.log.error(`Error storing product SKU: ${sku}:`, error);
        return {
          sku,
          status: error.code || 500,
          message: `Error: ${error.message}`,
        };
      }
    });

    const batchResults = await Promise.all(storePromises);
    return batchResults;
  }

  /**
   * Deletes multiple products by their SKUs in batches while tracking each deletion's response.
   * @param {string[]} skus - An array of SKUs of the products to delete.
   * @returns {Promise<Partial<BatchResult>[]>} - Resolves with an array of deletion results.
   * @throws {Error} - Throws an error if the input parameters are invalid.
   */
  async deleteProducts(skus) {
    const { log } = this.ctx;

    const processor = new BatchProcessor(this.ctx, (batch) => this.deleteProductsBatch(batch));
    const deleteResults = await processor.process(skus);

    log.info(`Completed deletion of ${skus.length} products.`);

    return deleteResults;
  }

  /**
   * Handler function to process a batch of SKUs for deletion.
   * @param {string[]} batch - An array of SKUs to delete.
   * @returns {Promise<Partial<BatchResult>[]>} - Resolves with an array of deletion results.
   */
  async deleteProductsBatch(batch) {
    const { log, env } = this.ctx;
    const {
      org, site, storeCode, storeViewCode,
    } = this.config;

    const deletionPromises = batch.map(async (sku) => {
      try {
        const productKey = `${org}/${site}/${storeCode}/${storeViewCode}/products/${sku}.json`;
        const productHead = await env.CATALOG_BUCKET.head(productKey);
        if (!productHead) {
          log.warn(`Product with SKU: ${sku} not found. Skipping deletion.`);
          return {
            sku,
            statusCode: 404,
            message: 'Product not found.',
          };
        }
        const { customMetadata } = productHead;
        const deleteProductResponse = await env.CATALOG_BUCKET.delete(productKey);

        const { urlKey } = customMetadata;
        if (urlKey) {
          const urlKeyPath = `${org}/${site}/${storeCode}/${storeViewCode}/urlkeys/${urlKey}`;
          await env.CATALOG_BUCKET.delete(urlKeyPath);
        }

        const adminResponse = await callPreviewPublish(this.config, 'DELETE', sku, urlKey);
        /**
         * @type {Partial<BatchResult>}
         */
        const result = {
          sku,
          status: deleteProductResponse?.status,
          message: 'Product deleted successfully.',
          ...adminResponse.paths,
        };
        return result;
      } catch (error) {
        log.error(`Failed to delete product with SKU: ${sku}. Error: ${error.message}`);
        return {
          sku,
          status: error.code || 500,
          message: `Error: ${error.message}`,
        };
      }
    });

    const batchResults = await Promise.all(deletionPromises);
    return batchResults;
  }

  /**
   * Resolve SKU from a URL key.
   * @param {string} urlKey - The URL key.
   * @returns {Promise<string>} - A promise that resolves to the SKU.
   */
  async lookupSku(urlKey) {
    // Make a HEAD request to retrieve the SKU from metadata based on the URL key
    const urlKeyPath = `${this.config.org}/${this.config.site}/${this.config.storeCode}/${this.config.storeViewCode}/urlkeys/${urlKey}`;
    const headResponse = await this.ctx.env.CATALOG_BUCKET.head(urlKeyPath);

    if (!headResponse || !headResponse.customMetadata?.sku) {
      // SKU not found for the provided URL key
      throw errorWithResponse(404, 'Product not found');
    }
    // Return the resolved SKU
    return headResponse.customMetadata.sku;
  }

  /**
   * Resolve URL key from a SKU.
   * @param {string} sku - The SKU of the product.
   * @returns {Promise<string | undefined>} - A promise that resolves to the URL key or undefined.
   */
  async lookupUrlKey(sku) {
    // Construct the path to the product JSON file
    const productKey = `${this.config.org}/${this.config.site}/${this.config.storeCode}/${this.config.storeViewCode}/products/${sku}.json`;

    const headResponse = await this.ctx.env.CATALOG_BUCKET.head(productKey);
    if (!headResponse || !headResponse.customMetadata) {
      return undefined;
    }
    const { urlKey } = headResponse.customMetadata;

    if (!urlKey) {
      return undefined;
    }

    return urlKey;
  }

  /**
   * List all products from R2.
   * TODO: Setup pagination
   * @returns {Promise<Product[]>} - A promise that resolves to the products.
   */
  async listAllProducts() {
    const bucket = this.ctx.env.CATALOG_BUCKET;
    const listResponse = await bucket.list({
      prefix: `${this.config.org}/${this.config.site}/${this.config.storeCode}/${this.config.storeViewCode}/products/`,
    });
    const files = listResponse.objects;

    const batchSize = 50;
    const customMetadataArray = [];

    // Helper function to split the array into chunks of a specific size
    function chunkArray(array, size) {
      const result = [];
      for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
      }
      return result;
    }

    const fileChunks = chunkArray(files, batchSize);

    // Process each chunk sequentially
    for (const chunk of fileChunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (file) => {
          const objectKey = file.key;

          const headResponse = await bucket.head(objectKey);
          if (headResponse) {
            const { customMetadata } = headResponse;
            const { sku } = customMetadata;
            return {
              ...customMetadata,
              links: {
                product: `${this.ctx.url.origin}/${this.config.org}/${this.config.site}/catalog/${this.config.storeCode}/${this.config.storeViewCode}/product/${sku}`,
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
}
