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

import { HTMLTemplate } from '../HTMLTemplate.js';

/**
 * @typedef {import('../../../types.d.ts').Product} Product
 * @typedef {import('../../../types.d.ts').Variant} Variant
 */

export default class extends HTMLTemplate {
  /**
   * @param {Context} ctx
   * @param {Product} product
   * @param {Variant[]} variants
   */
  constructor(ctx, product, variants) {
    super(ctx, product, variants);
    // use shortDescription field for meta description, if not explicitly set
    this.product.metaDescription = this.product.metaDescription || this.product.shortDescription;
  }

  /**
   * Create the document meta tags
   * @returns {string}
   */
  renderDocumentMetaTags() {
    const { product } = this;
    return /* html */ `\
<meta charset="UTF-8">
<title>${product.metaTitle || product.name} | Wilson Sporting Goods</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${HTMLTemplate.metaProperty('description', product.metaDescription)}
${HTMLTemplate.metaName('keywords', product.metaKeyword)}`;
  }
}
