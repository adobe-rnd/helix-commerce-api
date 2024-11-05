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

import { findProductImage, pruneUndefined } from '../../utils/product.js';

export class JSONTemplate {
  /** @type {Context} */
  ctx = undefined;

  /** @type {Product} */
  product = undefined;

  /** @type {Variant[]} */
  variants = undefined;

  /**
   * @param {Context} ctx
   * @param {Product} product
   * @param {Variant[]} variants
   */
  constructor(ctx, product, variants) {
    this.ctx = ctx;
    this.product = product;
    this.variants = variants;
  }

  /**
   * @param {Variant} [variant]
   * @returns
   */
  constructProductURL(variant) {
    const {
      product,
      ctx: { config },
    } = this;
    const { host, matchedPatterns, confMap } = config;
    const matchedPathConfig = confMap?.[matchedPatterns[0]];

    const productPath = matchedPatterns[0]
      .replace('{{urlkey}}', product.urlKey)
      .replace('{{sku}}', encodeURIComponent(product.sku.toLowerCase()));

    const productUrl = `${host}${productPath}`;

    if (variant) {
      const offerVariantURLTemplate = matchedPathConfig?.offerVariantURLTemplate;
      if (!offerVariantURLTemplate) {
        return `${productUrl}/?optionsUIDs=${encodeURIComponent(variant.selections.join(','))}`;
      }

      const variantPath = offerVariantURLTemplate
        .replace('{{urlkey}}', product.urlKey)
        .replace('{{sku}}', encodeURIComponent(variant.sku));
      return `${host}${variantPath}`;
    }

    return productUrl;
  }

  renderBrand() {
    const { attributes } = this.product;
    const brandName = attributes?.find((attr) => attr.name === 'brand')?.value;
    if (!brandName) {
      return undefined;
    }
    return {
      brand: {
        '@type': 'Brand',
        name: brandName,
      },
    };
  }

  render() {
    const {
      sku,
      name,
      metaDescription,
      images,
      reviewCount,
      ratingValue,
      inStock,
      prices,
    } = this.product;

    const productUrl = this.constructProductURL();
    const image = images?.[0]?.url ?? findProductImage(this.product, this.variants)?.url;
    return JSON.stringify(pruneUndefined({
      '@context': 'http://schema.org',
      '@type': 'Product',
      '@id': productUrl,
      name,
      sku,
      description: metaDescription,
      image,
      productID: sku,
      offers: [
        prices ? ({
          '@type': 'Offer',
          sku,
          url: productUrl,
          image,
          availability: inStock ? 'InStock' : 'OutOfStock',
          price: prices?.final?.amount,
          priceCurrency: prices?.final?.currency,
        }) : undefined,
        ...this.variants.map((v) => {
          const offerUrl = this.constructProductURL(v);
          const offer = {
            '@type': 'Offer',
            sku: v.sku,
            url: offerUrl,
            image: v.images?.[0]?.url ?? image,
            availability: v.inStock ? 'InStock' : 'OutOfStock',
            price: v.prices?.final?.amount,
            priceCurrency: v.prices?.final?.currency,
          };

          if (v.gtin) {
            offer.gtin = v.gtin;
          }

          return offer;
        }).filter(Boolean),
      ],
      ...(this.renderBrand() ?? {}),
      ...(typeof reviewCount === 'number'
     && typeof ratingValue === 'number'
     && reviewCount > 0
        ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue,
            reviewCount,
          },
        }
        : {}),
    }));
  }
}
