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

/* eslint-disable class-methods-use-this, no-unused-vars */

/**
 * @typedef {{
 *   type: string;
 *   [key: string]: unknown;
 * }} PlatformConfig
 */

/**
 * @param {Context} ctx
 * @returns {Promise<PlatformConfig|null>}
 */
async function getPlatformConfig(ctx) {
  // TODO: implement
  // get encrypted config for site(/store/view)
  return null;
}

export default class Platform {
  /**
   * @type {string}
   */
  type;

  /**
   * @param {Context} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.type = 'none';
  }

  /**
   * @param {Context} ctx
   */
  static async fromContext(ctx) {
    if (ctx.attributes.paymentPlatform) {
      return ctx.attributes.paymentPlatform;
    }
    const { type, ...opts } = await getPlatformConfig(ctx) ?? {};
    switch (type) {
      case 'square': {
        // eslint-disable-next-line import/no-cycle
        const Impl = (await import('./Square.js')).default;
        // @ts-ignore
        ctx.attributes.paymentPlatform = new Impl(ctx, opts);
        break;
      }
      default: {
        ctx.attributes.paymentPlatform = new Platform(ctx);
        break;
      }
    }

    return ctx.attributes.paymentPlatform;
  }

  /**
   * @param {string} path
   * @param {string} message
   * @param {string | Record<string, unknown>} [details]
   * @returns {import('../../../utils/validation.js').ValidationError}
   */
  validationError(path, message, details) {
    return {
      path,
      message,
      details,
    };
  }

  /**
   * @param {Order} order
   * @returns {void}
   * @throws {import('../../../utils/http.js').ResponseError}
   */
  assertValidOrder(order) {}

  /**
   * @param {OrderItem[]} items
   * @returns {Promise<void>}
   * @throws {import('../../../utils/http.js').ResponseError}
   */
  // eslint-disable-next-line no-empty-function
  async validateLineItems(items) {}

  /**
   * @param {Order} order
   * @returns {Promise<PaymentLink>}
   */
  async createPaymentLink(order) {
    throw new Error('Not implemented');
  }
}
