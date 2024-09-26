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
// @ts-check

import { pruneUndefined } from '../util.js';

/**
 * @param {Product} product
 * @returns {string}
 */
export default (product) => {
  const {
    sku,
    url,
    name,
    description,
    images,
    reviewCount,
    ratingValue,
    attributes,
    inStock,
    prices,
  } = product;

  const image = images?.[0]?.url;
  const brandName = attributes.find((attr) => attr.name === 'brand')?.value;

  return JSON.stringify(pruneUndefined({
    '@context': 'http://schema.org',
    '@type': 'Product',
    '@id': url,
    name,
    sku,
    description,
    image,
    productID: sku,
    offers: [
      /**
       * TODO: add offers from variants, if `product.options[*].product.prices` exists
       */
      {
        '@type': 'Offer',
        sku,
        url,
        image,
        availability: inStock ? 'InStock' : 'OutOfStock',
        price: prices.final.amount,
        priceCurrency: prices.final.currency,
      },
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
