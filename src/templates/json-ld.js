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

import { findProductImage, pruneUndefined } from '../utils/product.js';

/**
 * @param {Product} product
 * @param {Variant[]} variants
 * @returns {string}
 */
export default (product, variants) => {
  const {
    sku,
    url,
    name,
    metaDescription,
    images,
    reviewCount,
    ratingValue,
    attributes,
    inStock,
    prices,
  } = product;

  const image = images?.[0]?.url ?? findProductImage(product, variants)?.url;
  const brandName = attributes?.find((attr) => attr.name === 'brand')?.value;
  return JSON.stringify(pruneUndefined({
    '@context': 'http://schema.org',
    '@type': 'Product',
    '@id': url,
    name,
    sku,
    description: metaDescription,
    image,
    productID: sku,
    offers: [
      prices ? ({
        '@type': 'Offer',
        sku,
        url,
        image,
        availability: inStock ? 'InStock' : 'OutOfStock',
        price: prices?.final?.amount,
        priceCurrency: prices?.final?.currency,
      }) : undefined,
      ...variants.map((v) => ({
        '@type': 'Offer',
        sku: v.sku,
        url: v.url,
        image: v.images?.[0]?.url ?? image,
        availability: v.inStock ? 'InStock' : 'OutOfStock',
        price: v.prices?.final?.amount,
        priceCurrency: v.prices?.final?.currency,

      })).filter(Boolean),
    ],
    ...(brandName
      ? {
        brand: {
          '@type': 'Brand',
          name: brandName,
        },
      }
      : {}),
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
};
