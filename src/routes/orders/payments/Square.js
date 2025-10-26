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

import OrderSchema, { OrderItem as OrderItemSchema } from '../../../schemas/Order.js';
import { errorWithResponse } from '../../../utils/http.js';
import { validate } from '../../../utils/validation.js';
// eslint-disable-next-line import/no-cycle
import Platform from './Platform.js';

/**
 * @typedef {import('./SquareAPI.d.ts').Responses} SquareResponses
 * @typedef {{
 *   squareVariationId: string;
 *   squareItemId: string;
 * } & OrderItem} SquareOrderItem
 * @typedef {{
 *   locationId: string;
 *   squareOrderId: string;
 *   items: SquareOrderItem[];
 * } & Order} SquareOrder
 */

/**
 * @typedef {{
 *   token: string;
 *   validateStock?: boolean;
 * }} Options
 */

const PROD_BASE_URL = 'https://connect.squareup.com/v2';
const SANDBOX_BASE_URL = 'https://connect.squareupsandbox.com/v2';

/**
 * Parse price to a number in cents
 * @param {string|number} price either number in cents, or decimal string
 * @returns {number}
 */
const parsePrice = (price) => (typeof price === 'string' ? Math.round(parseFloat(price) * 100) : price);

export default class SquarePlatform extends Platform {
  /** @type {Context} */
  ctx;

  /** @type {string} */
  token;

  /** @type {string} */
  baseUrl;

  /** @type {Record<string, string>} */
  headers;

  /** @type {boolean} */
  validateStock = true;

  /** @type {import('../../../utils/validation.js').ObjectSchema} */
  #schema;

  /**
   * @param {Context} ctx
   * @param {Options} opts
   */
  constructor(ctx, opts) {
    super(ctx);
    this.type = 'square';
    const { token, validateStock } = opts || {};
    if (!token) {
      throw new Error('token is required');
    }
    if (validateStock !== undefined) {
      this.validateStock = validateStock;
    }
    const { env } = ctx;
    this.ctx = ctx;
    this.token = token;
    this.baseUrl = env.ENVIRONMENT === 'production'
      ? PROD_BASE_URL
      : SANDBOX_BASE_URL;
    this.headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': '2025-10-16',
    };

    // add additional properties to the schema
    this.#schema = {
      ...OrderSchema,
      properties: {
        ...OrderSchema.properties,
        locationId: { type: 'string' },
        items: {
          type: 'array',
          items: {
            ...OrderItemSchema,
            properties: {
              ...OrderItemSchema.properties,
              squareVariationId: { type: 'string' },
              squareItemId: { type: 'string' },
            },
            required: [...OrderItemSchema.required, 'squareVariationId', 'squareItemId'],
          },
        },
      },
      required: [...OrderSchema.required, 'squareLocationId'],
    };
  }

  get log() {
    return this.ctx.log;
  }

  /**
   * Assert that the body is a valid Square cart.
   * @param {Object} body
   * @returns {asserts body is SquareCart}
   */
  assertValidPayload(body) {
    const errors = validate(body, this.#schema);
    if (errors) {
      throw errorWithResponse(400, 'invalid payload', { errors });
    }
  }

  /**
   * List all catalog items
   */
  async listCatalogItems() {
    try {
      this.log.log('Fetching catalog objects from Square...');
      const response = await fetch(`${this.baseUrl}/catalog/list?types=ITEM`, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.log.error('failed to list catalog items: ', response.status, errorData);
        throw errorWithResponse(response.status, 'failed to list catalog items');
      }

      /** @type {SquareResponses['ListCatalogObjects']} */
      const data = await response.json();
      return data.objects || [];
    } catch (error) {
      if (!error.response) {
        this.log.error('error fetching catalog objects:', error.message);
      }
      throw error;
    }
  }

  /**
   * Get catalog items by their IDs
   * @param {string[]} itemIds
   */
  async getCatalogItems(itemIds) {
    try {
      this.log.debug('fetching catalog items');
      const response = await fetch(`${this.baseUrl}/catalog/batch-retrieve`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          object_ids: itemIds,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.log.error('failed to fetch catalog items: ', response.status, errorData);
        throw errorWithResponse(response.status, 'failed to fetch catalog items');
      }
      /** @type {SquareResponses['BatchRetrieveCatalogObjects']} */
      const data = await response.json();
      return data.objects || [];
    } catch (error) {
      if (!error.response) {
        this.log.error('error fetching catalog items: ', error.message);
      }
      throw error;
    }
  }

  /**
   * Validate cart items:
   *   1. exist
   *   2. are sellable
   *   3. have correct price
   *   4. have available inventory (if enabled)
   * @param {SquareOrderItem[]} items
   * @param {string} locationId
   */
  async validateCartItems(items, locationId) {
    try {
      this.log.debug('validating cart items');

      // fetch catalog items
      const itemIds = items.map((item) => item.squareVariationId);
      const catalogItems = await this.getCatalogItems(itemIds);

      // items to confirm inventory is available
      // only check if the catalog item is marked as `track_inventory`
      /** @type {SquareOrderItem[]} */
      const stockCheckItems = [];

      const errors = [];
      items.forEach((item, index) => {
        const catalogItem = catalogItems.find((ci) => ci.id === item.squareVariationId);

        // exists in catalog
        if (!catalogItem) {
          errors.push(this.validationError(`$.items[${index}]`, 'not found in catalog'));
        }

        // correct price currency
        const expectedCurrency = catalogItem.item_variation_data.price_money.currency;
        if (expectedCurrency !== item.price.currency) {
          errors.push(
            this.validationError(
              `$.items[${index}]`,
              'incorrect price currency',
              { expected: expectedCurrency },
            ),
          );
        }

        // correct price amount
        const expectedPrice = catalogItem.item_variation_data.price_money.amount;
        const parsedPrice = typeof item.price === 'string' ? Math.round(parseFloat(item.price) * 100) : item.price;
        if (expectedPrice !== parsedPrice) {
          errors.push(
            this.validationError(
              `$.items[${index}]`,
              'incorrect price',
              {
                expected: typeof item.price === 'string'
                  ? (expectedPrice / 100).toFixed(2)
                  : expectedPrice,
              },
            ),
          );
        }

        // sellable
        if (!catalogItem.item_variation_data.sellable) {
          errors.push(this.validationError(`$.items[${index}]`, 'not sellable'));
        }

        // if item is marked as track_inventory, check inventory
        if (catalogItem.item_variation_data.track_inventory) {
          stockCheckItems.push(item);
        }
      });

      if (this.validateStock && errors.length === 0) {
        const stockCheckItemIds = stockCheckItems.map((item) => item.squareVariationId);
        const inventoryCounts = await this.getInventoryCounts(stockCheckItemIds, locationId);

        stockCheckItems.forEach((item, index) => {
          const availableStock = inventoryCounts[item.squareVariationId];
          if (availableStock !== undefined && Number(availableStock) < item.quantity) {
            errors.push(this.validationError(`$.items[${index}]`, 'insufficient stock', {
              available: Number(availableStock),
              expected: item.quantity,
            }));
          }
        });
      }

      if (errors.length > 0) {
        throw errorWithResponse(400, 'invalid cart items', { errors });
      }
    } catch (error) {
      if (!error.response) {
        this.log.error('error validating cart:', error.message);
        throw errorWithResponse(502, 'error validating cart');
      }
      throw error;
    }
  }

  /**
   * @param {string[]} catalogObjectIds
   * @param {string} [locationId]
   */
  async getInventoryCounts(catalogObjectIds, locationId) {
    try {
      this.log.debug('fetching inventory counts');

      const response = await fetch(
        `${this.baseUrl}/inventory/batch-retrieve-counts`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            catalog_object_ids: catalogObjectIds,
            location_ids: locationId ? [locationId] : undefined,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.log.error('failed to fetch inventory counts: ', response.status, errorData);
        throw errorWithResponse(response.status, 'failed to fetch inventory counts');
      }

      /** @type {SquareResponses['BatchRetrieveCounts']} */
      const data = await response.json();
      return (data.counts || []).reduce((acc, entry) => {
        // combine counts for all locations if no locationId is provided
        acc[entry.catalog_object_id] = !locationId
          ? (acc[entry.catalog_object_id] || 0) + entry.quantity
          : entry.quantity;
        return acc;
      }, {});
    } catch (error) {
      if (!error.response) {
        this.log.error('error fetching inventory counts: ', error.message);
        throw errorWithResponse(502, 'error fetching inventory counts');
      }
      throw error;
    }
  }

  /**
   * Create a payment link for an order
   * @param {SquareOrder} order
   */
  async createPaymentLink(order) {
    try {
      this.log.debug('creating payment link');
      const { id: orderId, locationId, items } = order;

      const lineItems = items.map((item) => ({
        name: item.name,
        quantity: String(item.quantity),
        catalog_object_id: item.squareVariationId,
        note: item.note,
        base_price_money: {
          amount: parsePrice(item.price.final),
          currency: item.price.currency,
        },
      }));

      const response = await fetch(`${this.baseUrl}/online-checkout/payment-links`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          order: {
            location_id: locationId,
            line_items: lineItems,
          },
          checkout_options: {
            redirect_url: `${this.ctx.url.origin}/checkout/success`,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.log.error('failed to create payment link: ', response.status, errorData);
        throw errorWithResponse(response.status, 'failed to create payment link');
      }

      /** @type {SquareResponses['CreatePaymentLink']} */
      const data = await response.json();
      this.log.debug('payment link created: ', data);
      const { payment_link: link } = data;
      return {
        id: link.id,
        url: link.url,
        createdAt: link.created_at,
        squareOrderId: link.order_id,
        orderId,
      };
    } catch (error) {
      if (!error.response) {
        this.log.error('error creating payment link: ', error.message);
        throw errorWithResponse(502, 'error creating payment link');
      }
      throw error;
    }
  }
}
