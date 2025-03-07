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

import { JSONTemplate } from '../JSONTemplate.js';

/**
 * @typedef {import('../../../types.d.ts').Product} Product
 * @typedef {import('../../../types.d.ts').Variant} Variant
 */

export default class extends JSONTemplate {
  /**
   * @param {Variant} [variant]
   * @param {Pick<Product, 'sku'|'urlKey'>} [pproduct]
   * @returns {string}
   */
  constructProductURL(variant, pproduct) {
    const product = pproduct || this.product;
    const { ctx: { config } } = this;
    const { host, matchedPatterns } = config;

    const productPath = matchedPatterns[0]
      .replace('{{urlkey}}', product.urlKey)
      .replace('{{sku}}', encodeURIComponent(product.sku.toLowerCase()));

    const productUrl = `${host}${productPath}`;
    if (!variant) {
      return productUrl;
    }

    const options = variant.selections.map((selection) => atob(selection)).join(',').replace(/configurable\//g, '').replace(/\//g, '-');
    return `${productUrl}?pid=${variant.externalId}&o=${btoa(options)}`;
  }

  // eslint-disable-next-line class-methods-use-this
  renderBrand() {
    return {
      brand: {
        '@type': 'Brand',
        name: 'Bulk',
      },
    };
  }

  renderOffers() {
    const baseOffers = super.renderOffers();
    return baseOffers.map((o) => ({
      ...o,
      itemCondition: 'http://schema.org/NewCondition',
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'UK',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
      },
    }));
  }
}
