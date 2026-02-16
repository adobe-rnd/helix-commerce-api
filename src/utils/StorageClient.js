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

import {
  StorageClient as SharedStorageClient,
  extractAndReplaceImages,
} from '@dylandepass/helix-product-shared';
import { BatchProcessor } from './batch.js';
import { errorWithResponse } from './http.js';
import { purgeBatch } from '../routes/cache/purge.js';

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

  get catalogKey() {
    const { org, site } = this.ctx.requestInfo;
    return `${org}/${site}`;
  }

  /**
   * Load product by path.
   * @param {string} path - The path to the product
   * @returns {Promise<SharedTypes.ProductBusEntry>} - A promise that resolves to the product.
   */
  async getProductByPath(path) {
    const {
      env,
      requestInfo: { org, site },
    } = this.ctx;

    // Require .json extension
    if (!path.endsWith('.json')) {
      throw errorWithResponse(400, 'path must end with .json');
    }

    const key = `${org}/${site}/catalog${path}`;
    const obj = await env.CATALOG_BUCKET.get(key);
    if (!obj) {
      throw errorWithResponse(404, 'Product not found');
    }

    const data = await obj.json();
    return data;
  }

  /**
   * Save products by path in batches.
   *
   * @param {SharedTypes.ProductBusEntry[]} products - The products to save (with path field).
   * @param {boolean} [asyncImages=true] - Whether images should be fetched asynchronously.
   * @returns {Promise<Partial<BatchResult>[]>}
   */
  async saveProductsByPath(products, asyncImages = true) {
    const processor = new BatchProcessor(
      this.ctx,
      async (batch) => this.storeProductsBatchByPath(batch, asyncImages),
    );
    const saveResults = await processor.process(products);

    this.ctx.log.info(`Completed saving ${products.length} products.`);

    return saveResults;
  }

  /**
   * Handler function to process a batch of products using paths.
   * @param {SharedTypes.ProductBusEntry[]} batch - An array of products to save (with path field).
   * @param {boolean} [asyncImages=true] - Whether images should be fetched asynchronously.
   * @returns {Promise<Partial<BatchResult>[]>}
   */
  async storeProductsBatchByPath(batch, asyncImages = true) {
    const {
      env,
      log,
      requestInfo: { org, site },
    } = this.ctx;

    // Track successfully saved products for batch cache purging
    const successfullySavedProducts = [];

    const storePromises = batch.map(async (product) => {
      if (!asyncImages) {
        // Fetch existing product with internal data if not already set
        if (!product.internal) {
          const existing = await this.fetchProductByPath(org, site, product.path, true);
          if (existing?.internal) {
            product.internal = existing.internal;
          }
        }

        // Process images (mutates product and updates product.internal)
        product = await extractAndReplaceImages(this.ctx, org, site, product);
      }

      const { sku, name, path } = product;
      if (!path) {
        return {
          sku,
          path: undefined,
          status: 400,
          message: 'Product path is required',
        };
      }

      // Path should have .json extension, but for now we accept either way
      // TODO: return this error
      // if (!path.endsWith('.json')) {
      // return {
      //   sku,
      //   path,
      //   status: 400,
      //   message: 'path must include .json extension',
      // };
      // }

      const key = `${org}/${site}/catalog${path}${path.endsWith('.json') ? '' : '.json'}`;

      // Create a copy of the product for storage (includes internal property)
      const productToStore = JSON.parse(JSON.stringify(product));
      const body = JSON.stringify(productToStore);

      try {
        const t0 = Date.now();
        const customMetadata = {
          sku,
          name,
          path,
        };

        // Save the product at its path location
        await env.CATALOG_BUCKET.put(key, body, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata,
        });
        const dt = Date.now() - t0;
        this.ctx.metrics?.productUploadsMs?.push(dt);

        // Track this product for batch cache purging
        successfullySavedProducts.push({
          sku,
          path,
        });

        /**
         * @type {Partial<BatchResult>}
         */
        const result = {
          sku,
          path,
          message: 'Product saved successfully.',
          status: 200,
        };

        return result;
      } catch (error) {
        log.error(`Error storing product SKU: ${sku} at path: ${path}:`, error);
        return {
          sku,
          path,
          status: error.code || 500,
          message: `Error: ${error.message}`,
        };
      }
    });

    const batchResults = await Promise.all(storePromises);

    // Purge cache for all successfully saved products in a single batch
    if (successfullySavedProducts.length > 0) {
      try {
        await purgeBatch(this.ctx, this.ctx.requestInfo, successfullySavedProducts);
        log.info(`Cache purged for ${successfullySavedProducts.length} successfully saved products`);
      } catch (purgeError) {
        // Log but don't fail the entire operation if purge fails
        // The products are already saved successfully
        log.error(`Failed to purge cache for saved products: ${purgeError.message}`);
      }
    }

    return batchResults;
  }

  /**
   * Deletes multiple products by their paths in batches while tracking each deletion's response.
   * @param {string[]} paths - An array of paths of the products to delete.
   * @returns {Promise<Partial<BatchResult>[]>} - Resolves with an array of deletion results.
   */
  async deleteProductsByPath(paths) {
    const { log } = this.ctx;

    const processor = new BatchProcessor(
      this.ctx,
      (batch) => this.deleteProductsBatchByPath(batch),
    );
    const deleteResults = await processor.process(paths);

    log.info(`Completed deletion of ${paths.length} products.`);

    return deleteResults;
  }

  /**
   * Handler function to process a batch of paths for deletion.
   * @param {string[]} batch - An array of paths to delete.
   * @returns {Promise<Partial<BatchResult>[]>} - Resolves with an array of deletion results.
   */
  async deleteProductsBatchByPath(batch) {
    const {
      log,
      env,
      requestInfo: { org, site },
    } = this.ctx;

    const deletionPromises = batch.map(async (path) => {
      try {
        // Path should NOT have .json extension (we add it)
        if (!path.endsWith('.json')) {
          return {
            path,
            status: 400,
            message: 'path must end with .json',
          };
        }

        const key = `${org}/${site}/catalog${path}`;

        const productHead = await env.CATALOG_BUCKET.head(key);
        if (!productHead) {
          log.warn(`Product at path: ${path} not found. Skipping deletion.`);
          return {
            path,
            status: 404,
            message: 'Product not found.',
          };
        }

        const { customMetadata } = productHead;
        await env.CATALOG_BUCKET.delete(key);

        /**
         * @type {Partial<BatchResult>}
         */
        const result = {
          sku: customMetadata?.sku,
          path,
          status: 200,
          message: 'Product deleted successfully.',
        };
        return result;
      } catch (error) {
        log.error(`Failed to delete product at path: ${path}. Error: ${error.message}`);
        return {
          path,
          status: error.code || 500,
          message: `Error: ${error.message}`,
        };
      }
    });

    const batchResults = await Promise.all(deletionPromises);
    return batchResults;
  }

  /**
   * @param {Order} data
   * @param {string} [platformType]
   * @returns {Promise<Order>}
   */
  async createOrder(data, platformType) {
    const {
      env,
      requestInfo: {
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
      requestInfo: {
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
      requestInfo: {
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
      requestInfo: {
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
      requestInfo: {
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
      requestInfo: {
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
   * Get hash table for a customer's address hash -> id lookup
   * @param {string} email
   * @returns {Promise<Record<string, string>>} { hash: id }
   */
  async getAddressHashTable(email) {
    const {
      env,
      requestInfo: {
        org,
        site,
      },
    } = this.ctx;
    const key = `${org}/${site}/customers/${email}/addresses/.hashtable.json`;
    const resp = await env.ORDERS_BUCKET.get(key);
    if (!resp) {
      return {};
    }
    return resp.json();
  }

  /**
   * Save hash table for a customer's address hash -> id lookup
   * @param {string} email
   * @param {Record<string, string>} hashTable { hash: id }
   * @returns {Promise<void>}
   */
  async saveAddressHashTable(email, hashTable) {
    const {
      env,
      requestInfo: {
        org,
        site,
      },
    } = this.ctx;
    const key = `${org}/${site}/customers/${email}/addresses/.hashtable.json`;
    await this.putTo(env.ORDERS_BUCKET, key, JSON.stringify(hashTable), {
      httpMetadata: { contentType: 'application/json' },
    });
  }

  /**
   * @param {string} hash
   * @param {string} email
   * @param {Address} address
   * @returns {Promise<Address>}
   */
  async saveAddress(hash, email, address) {
    const {
      env,
      requestInfo: {
        org,
        site,
      },
    } = this.ctx;
    const hashTable = await this.getAddressHashTable(email);
    if (hashTable[hash]) {
      // address hash already exists, return it as the address
      // NOTE: that this does not handle address updates by ID, yet
      const id = hashTable[hash];
      return {
        ...address,
        id,
      };
    }

    const id = crypto.randomUUID();
    const key = `${org}/${site}/customers/${email}/addresses/${id}.json`;
    await this.putTo(env.ORDERS_BUCKET, key, JSON.stringify(address), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        email,
        id,
      },
    });

    // persist hash table with new hash -> id
    hashTable[hash] = id;
    await this.saveAddressHashTable(email, hashTable);
    return {
      ...address,
      id,
    };
  }

  /**
   * @param {string} email
   * @param {string} addressId
   * @returns {Promise<Address | null>}
   */
  async getAddress(email, addressId) {
    const {
      env,
      requestInfo: {
        org,
        site,
      },
    } = this.ctx;
    const key = `${org}/${site}/customers/${email}/addresses/${addressId}.json`;
    const resp = await env.ORDERS_BUCKET.get(key);
    if (!resp) {
      return null;
    }
    return resp.json();
  }

  /**
   * List all addresses for a customer.
   * @param {string} email
   * @returns {Promise<Address[]>}
   */
  async listAddresses(email) {
    const {
      env,
      requestInfo: {
        org,
        site,
      },
    } = this.ctx;
    const prefix = `${org}/${site}/customers/${email}/addresses/`;
    const res = await env.ORDERS_BUCKET.list({
      prefix,
      limit: 100,
      // @ts-ignore not defined in types for some reason
      include: ['customMetadata'],
    });
    const objects = res.objects
      .filter((obj) => !obj.key.endsWith('.hashtable.json'))
      .map((obj) => {
        const id = obj.key.substring(prefix.length).replace(/\.json$/, '');
        return {
          id,
          ...obj.customMetadata,
        };
      });
    return /** @type {Address[]} */ (objects);
  }

  /**
   * Delete an address and update the hash table.
   * @param {string} email
   * @param {string} addressId
   * @returns {Promise<boolean>} true if deleted, false if not found
   */
  async deleteAddress(email, addressId) {
    const {
      env,
      requestInfo: {
        org,
        site,
      },
    } = this.ctx;
    const key = `${org}/${site}/customers/${email}/addresses/${addressId}.json`;
    const existing = await env.ORDERS_BUCKET.head(key);
    if (!existing) {
      return false;
    }

    await env.ORDERS_BUCKET.delete(key);

    // Remove from hash table
    const hashTable = await this.getAddressHashTable(email);
    /** @type {Record<string, string>} */
    const updated = {};
    for (const [hash, id] of Object.entries(hashTable)) {
      if (id !== addressId) {
        updated[hash] = id;
      }
    }
    await this.saveAddressHashTable(email, updated);

    return true;
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
      requestInfo: {
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
      requestInfo: {
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
      requestInfo: {
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
      requestInfo: {
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
