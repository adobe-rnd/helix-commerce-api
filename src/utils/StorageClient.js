/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { slugger, StorageClient as SharedStorageClient } from '@dylandepass/helix-product-shared';
import { BatchProcessor } from './batch.js';
import { errorWithResponse } from './http.js';
import { extractAndReplaceImages } from './media.js';

export default class StorageClient extends SharedStorageClient {
  /**
   * @param {Context} ctx
   * @returns {StorageClient}
   */
  static fromContext(ctx) {
    if (!ctx.attributes.storageClient) {
      ctx.attributes.storageClient = new StorageClient(ctx);
    }
    return ctx.attributes.storageClient;
  }

  /**
   * @param {Context} ctx
   */
  constructor(ctx) {
    super(ctx);
    this.ctx = ctx;
  }

  /** @type {Config} */
  get config() {
    return this.ctx.config;
  }

  get catalogKey() {
    const {
      config: {
        org,
        site,
        storeCode,
        storeViewCode,
      },
    } = this.ctx;
    return `${org}/${site}/${storeCode}/${storeViewCode}`;
  }

  /**
   * Load product by SKU.
   * @param {string} sku - The SKU of the product.
   * @returns {Promise<SharedTypes.ProductBusEntry>} - A promise that resolves to the product.
   */
  async getProduct(sku) {
    const data = await this.fetchProduct(this.catalogKey, sku);
    if (!data) {
      throw errorWithResponse(404, 'Product not found');
    }
    return data;
  }

  /**
   * Save products in batches
   *
   * @param {SharedTypes.ProductBusEntry[]} products - The products to save.
   * @param {boolean} [asyncImages=true] - Whether images should be fetched asynchronously.
   * @returns {Promise<Partial<BatchResult>[]>}
   */
  async saveProducts(products, asyncImages = true) {
    const processor = new BatchProcessor(
      this.ctx,
      async (batch) => this.storeProductsBatch(batch, asyncImages),
    );
    const saveResults = await processor.process(products);

    this.ctx.log.info(`Completed saving ${products.length} products.`);

    return saveResults;
  }

  /**
   * Handler function to process a batch of products.
   * @param {SharedTypes.ProductBusEntry[]} batch - An array of products to save.
   * @param {boolean} [asyncImages=true] - Whether images should be fetched asynchronously.
   * @returns {Promise<Partial<BatchResult>[]>}
   */
  async storeProductsBatch(batch, asyncImages = true) {
    const {
      env,
      log,
      config: {
        org,
        site,
        storeCode,
        storeViewCode,
      },
    } = this.ctx;

    const storePromises = batch.map(async (product) => {
      if (!asyncImages) {
        product = await extractAndReplaceImages(this.ctx, org, site, product);
      }

      const { sku, name, urlKey } = product;
      const sluggedSku = slugger(sku);
      const key = `${org}/${site}/${storeCode}/${storeViewCode}/products/${sluggedSku}.json`;
      const body = JSON.stringify(product);

      try {
        const t0 = Date.now();
        const customMetadata = { sku, name };
        if (urlKey) {
          customMetadata.urlKey = urlKey;
        }

        // Attempt to save the product
        await env.CATALOG_BUCKET.put(key, body, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata,
        });
        const dt = Date.now() - t0;
        this.ctx.metrics?.productUploadsMs?.push(dt);

        // If urlKey exists, save the urlKey metadata
        if (urlKey) {
          const metadataKey = `${org}/${site}/${storeCode}/${storeViewCode}/urlkeys/${urlKey}`;
          await env.CATALOG_BUCKET.put(metadataKey, '', {
            httpMetadata: { contentType: 'text/plain' },
            customMetadata,
          });
        }

        /**
         * @type {Partial<BatchResult>}
         */
        const result = {
          sku,
          sluggedSku,
          message: 'Product saved successfully.',
          status: 200,
        };

        return result;
      } catch (error) {
        log.error(`Error storing product SKU: ${sku}:`, error);
        return {
          sku,
          sluggedSku,
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
    const {
      log,
      env,
      config: {
        org,
        site,
        storeCode,
        storeViewCode,
      },
    } = this.ctx;

    const deletionPromises = batch.map(async (sku) => {
      const sluggedSku = slugger(sku);

      try {
        const productKey = `${org}/${site}/${storeCode}/${storeViewCode}/products/${sluggedSku}.json`;
        const productHead = await env.CATALOG_BUCKET.head(productKey);
        if (!productHead) {
          log.warn(`Product with SKU: ${sku} not found. Skipping deletion.`);
          return {
            sku,
            sluggedSku,
            statusCode: 404,
            message: 'Product not found.',
          };
        }
        const { customMetadata } = productHead;
        await env.CATALOG_BUCKET.delete(productKey);

        const { urlKey } = customMetadata;
        if (urlKey) {
          const urlKeyPath = `${org}/${site}/${storeCode}/${storeViewCode}/urlkeys/${urlKey}`;
          await env.CATALOG_BUCKET.delete(urlKeyPath);
        }

        /**
         * @type {Partial<BatchResult>}
         */
        const result = {
          sku,
          sluggedSku,
          status: 200,
          message: 'Product deleted successfully.',
        };
        return result;
      } catch (error) {
        log.error(`Failed to delete product with SKU: ${sku}. Error: ${error.message}`);
        return {
          sku,
          sluggedSku,
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
    const {
      env,
      config: {
        org,
        site,
        storeCode,
        storeViewCode,
      },
    } = this.ctx;

    // Make a HEAD request to retrieve the SKU from metadata based on the URL key
    const urlKeyPath = `${org}/${site}/${storeCode}/${storeViewCode}/urlkeys/${urlKey}`;
    const headResponse = await env.CATALOG_BUCKET.head(urlKeyPath);

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
    const {
      env,
      config: {
        org,
        site,
        storeCode,
        storeViewCode,
      },
    } = this.ctx;

    // Construct the path to the product JSON file
    const sluggedSku = slugger(sku);
    const productKey = `${org}/${site}/${storeCode}/${storeViewCode}/products/${sluggedSku}.json`;

    const headResponse = await env.CATALOG_BUCKET.head(productKey);
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
   * @returns {Promise<SharedTypes.ProductBusEntry[]>} - A promise that resolves to the products.
   */
  async listAllProducts() {
    const {
      env,
      config: {
        org,
        site,
        storeCode,
        storeViewCode,
      },
    } = this.ctx;

    const { skusOnly } = this.ctx.data;

    const listResponse = await env.CATALOG_BUCKET.list({
      prefix: `${org}/${site}/${storeCode}/${storeViewCode}/products/`,
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
      // eslint-disable-next-line no-await-in-loop
      const chunkResults = await Promise.all(
        chunk.map(async (file) => {
          const objectKey = file.key;
          const sku = objectKey.split('/').pop().replace('.json', '');
          const links = {
            product: `${this.ctx.url.origin}/${org}/${site}/catalog/${storeCode}/${storeViewCode}/products/${sku}.json`,
          };

          if (skusOnly) {
            return {
              sku,
              links,
            };
          }

          const headResponse = await env.CATALOG_BUCKET.head(objectKey);
          if (headResponse) {
            const { customMetadata } = headResponse;
            return {
              ...customMetadata,
              links,
            };
          } else {
            return {
              sku,
              links,
            };
          }
        }),
      );

      // Append the results of this chunk to the overall results array
      customMetadataArray.push(...chunkResults);
    }

    return customMetadataArray;
  }

  /**
   * @param {Order} data
   * @param {string} platformType
   * @returns {Promise<Order>}
   */
  async createOrder(data, platformType) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;

    const now = new Date().toISOString();
    const id = `${now}-${crypto.randomUUID().split('-')[0]}`;
    const order = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      /** @type {'pending'} */
      state: 'pending',
    };

    const key = `${org}/${site}/orders/${id}.json`;
    await this.putTo(env.ORDERS_BUCKET, key, JSON.stringify(order), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        id,
        storeCode: data.storeCode,
        storeViewCode: data.storeViewCode,
        createdAt: now,
        updatedAt: now,
        platformType,
      },
    });
    return order;
  }

  /**
   * @param {string} email
   * @returns {Promise<Customer | undefined>}
   */
  async getCustomer(email) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;

    const key = `${org}/${site}/customers/${email}/.info.json`;
    const resp = await env.ORDERS_BUCKET.get(key);
    if (!resp) {
      return undefined;
    }
    return resp.json();
  }

  /**
   * @param {string} email
   * @returns {Promise<boolean>}
   */
  async customerExists(email) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;
    const customer = await env.ORDERS_BUCKET.head(`${org}/${site}/customers/${email}/.info.json`);
    return customer !== null;
  }

  /**
   * @param {Customer} customer
   * @returns {Promise<Customer>}
   */
  async saveCustomer(customer) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;
    const { email } = customer;
    const key = `${org}/${site}/customers/${email}/.info.json`;
    await this.putTo(env.ORDERS_BUCKET, key, JSON.stringify(customer), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        email: customer.email,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
    });
    return customer;
  }

  async listCustomers() {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;
    const prefix = `${org}/${site}/customers/`;
    const res = await env.ORDERS_BUCKET.list({
      prefix,
      limit: 100,
      cursor: this.ctx.data.cursor,
      // @ts-ignore not defined in types for some reason
      include: ['customMetadata'],
    });
    return res.objects.map((obj) => {
      const email = obj.key.substring(prefix.length);
      return {
        email,
        ...obj.customMetadata,
      };
    });
  }

  /**
   * @param {string} email
   * @param {boolean} rmAddresses - whether to remove associated addresses
   * @param {boolean} rmOrders - Whether to delete the customer's orders.
   */
  async deleteCustomer(email, rmAddresses = true, rmOrders = true) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;
    const key = `${org}/${site}/customers/${email}/.info.json`;
    await env.ORDERS_BUCKET.delete(key);

    const rmPrefixes = [];
    if (rmOrders) {
      rmPrefixes.push(`${org}/${site}/customers/${email}/orders/`);
    }
    if (rmAddresses) {
      rmPrefixes.push(`${org}/${site}/customers/${email}/addresses/`);
    }
    await Promise.all(rmPrefixes.map(async (prefix) => {
      let truncated;
      let cursor = '';
      while (truncated !== false) {
        // eslint-disable-next-line no-await-in-loop
        const resp = await env.ORDERS_BUCKET.list({
          prefix,
          limit: 1000,
          cursor,
        });
        // eslint-disable-next-line no-await-in-loop
        await env.ORDERS_BUCKET.delete(resp.objects.map((obj) => obj.key));

        truncated = resp.truncated;
        if (resp.truncated) {
          cursor = resp.cursor;
        }
      }
    }));
  }

  /**
   * @param {string} id
   * @param {string} email
   * @param {Address} address
   * @returns {Promise<Address>}
   */
  async saveAddress(id, email, address) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;
    const key = `${org}/${site}/customers/${email}/addresses/${id}.json`;
    await this.putTo(env.ORDERS_BUCKET, key, JSON.stringify(address), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        email,
        id,
      },
    });
    return {
      ...address,
      id,
    };
  }

  /**
   * @param {string} email
   * @param {string} orderId
   * @param {Order} order
   * @returns {Promise<boolean>}
   */
  async linkOrderToCustomer(email, orderId, order) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;
    const key = `${org}/${site}/customers/${email}/orders/${orderId}`;
    const existed = await this.putTo(env.ORDERS_BUCKET, key, '', {
      customMetadata: {
        id: order.id,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        storeCode: order.storeCode,
        storeViewCode: order.storeViewCode,
        state: order.state,
      },
      onlyIf: {
        etagDoesNotMatch: '*',
      },
    });
    if (existed) {
      // order link already exists
      throw errorWithResponse(400, 'Order link already exists');
    }
    return true;
  }

  /**
   * @param {string} email
   * @param {string} orderId
   * @param {Partial<OrderMetadata>} metadata
   * @returns {Promise<boolean>}
   */
  async updateOrderLink(email, orderId, metadata) {
    const {
      env,
      log,
      config: {
        org,
        site,
      },
    } = this.ctx;
    const key = `${org}/${site}/customers/${email}/orders/${orderId}`;
    const existing = await env.ORDERS_BUCKET.head(key);
    if (!existing) {
      log.warn(`Order link not found: ${email}/${orderId}`);
      return false;
    }

    const merged = {
      ...existing.customMetadata,
      ...metadata,
      createdAt: existing.customMetadata.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.putTo(env.ORDERS_BUCKET, key, '', {
      customMetadata: merged,
    });
    return true;
  }

  /**
   * @param {string} orderId
   * @returns {Promise<Order | null>}
   */
  async getOrder(orderId) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;

    // get the actual order data
    const key = `${org}/${site}/orders/${orderId}.json`;
    const resp = await env.ORDERS_BUCKET.get(key);
    if (!resp) {
      return null;
    }

    /** @type {Order} */
    const order = await resp.json();
    return order;
  }

  /**
   * List orders, optionally filtered by email
   * @param {string} [email]
   * @returns {Promise<OrderMetadata[]>}
   */
  async listOrders(email) {
    const {
      env,
      config: {
        org,
        site,
      },
    } = this.ctx;
    const prefix = email
      ? `${org}/${site}/customers/${email}/orders/`
      : `${org}/${site}/orders/`;
    const res = await env.ORDERS_BUCKET.list({
      prefix,
      limit: 100,
      cursor: this.ctx.data.cursor,
      // @ts-ignore not defined in types for some reason
      include: ['customMetadata'],
    });
    return res.objects.map((obj) => {
      const id = obj.key.substring(prefix.length).replace(/\.json$/, '');
      /** @type {OrderMetadata} */
      // @ts-ignore
      const order = {
        id,
        ...obj.customMetadata,
      };
      return order;
    });
  }
}
