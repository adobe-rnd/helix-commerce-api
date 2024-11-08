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

/* eslint-disable class-methods-use-this */

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

  /**
   * @param {Variant} [variant]
   */
  constructMPN(variant) {
    return variant
      ? variant.attributes.find((attr) => attr.name.toLowerCase() === 'mpn')?.value ?? this.constructMPN()
      : this.product.attributes.find((attr) => attr.name.toLowerCase() === 'mpn')?.value ?? undefined;
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

  /**
   * @param {Variant} [variant]
   */
  renderRating(variant) {
    const { rating } = variant || this.product;
    if (!rating) {
      return undefined;
    }

    const {
      count,
      reviews,
      value,
      best,
      worst,
    } = rating;
    return pruneUndefined({
      '@type': 'AggregateRating',
      ratingValue: value,
      ratingCount: count,
      reviewCount: reviews,
      bestRating: best,
      worstRating: worst,
    });
  }

  renderOffers() {
    const image = this.product.images?.[0]?.url
      ?? findProductImage(this.product, this.variants)?.url;
    const configurableProduct = this.variants?.length > 0;
    const offers = configurableProduct ? this.variants : [this.product];
    return {
      offers: [
        ...offers.map((v) => {
          const { prices: variantPrices } = v;
          const offerUrl = this.constructProductURL(configurableProduct ? v : undefined);
          const mpn = this.constructMPN(configurableProduct ? v : undefined);
          const finalPrice = variantPrices?.final?.amount;
          const regularPrice = variantPrices?.regular?.amount;

          const offer = {
            '@type': 'Offer',
            sku: v.sku,
            mpn,
            url: offerUrl,
            image: v.images?.[0]?.url ?? image,
            availability: v.inStock ? 'InStock' : 'OutOfStock',
            price: finalPrice,
            priceCurrency: variantPrices.final?.currency,
            gtin: v.gtin,
            priceValidUntil: v.specialToDate,
            aggregateRating: this.renderRating(v),
          };

          if (finalPrice < regularPrice) {
            offer.priceSpecification = this.renderOffersPriceSpecification(v);
          }

          return pruneUndefined(offer);
        }).filter(Boolean),
      ],
    };
  }

  renderOffersPriceSpecification(variant) {
    const { prices } = variant;
    const { regular } = prices;
    const { amount, currency } = regular;
    return {
      '@type': 'UnitPriceSpecification',
      priceType: 'https://schema.org/ListPrice',
      price: amount,
      priceCurrency: currency,
    };
  }

  render() {
    const {
      sku,
      name,
      metaDescription,
      images,
    } = this.product;

    const productUrl = this.constructProductURL();
    const mpn = this.constructMPN();
    const image = images?.[0]?.url ?? findProductImage(this.product, this.variants)?.url;
    return JSON.stringify(pruneUndefined({
      '@context': 'http://schema.org',
      '@type': 'Product',
      '@id': productUrl,
      url: productUrl,
      name,
      sku,
      mpn,
      description: metaDescription,
      image,
      productID: sku,
      ...this.renderOffers(),
      ...(this.renderBrand() ?? {}),
    }), undefined, 2);
  }
}
