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

import { pruneUndefined } from '../../../utils/product.js';

/**
 * @typedef {import('./types.d.ts').Product} Product
 * @typedef {import('./types.d.ts').Variant} Variant
 * @typedef {import('./types.d.ts').Rating} Rating
 */

/**
 * This function combines an array of strings with interpolated
 * parameters to create a GraphQL query string.
 * @param {TemplateStringsArray} strs - The string array representing parts of the GraphQL query.
 * @param {...string} params - The parameters to be interpolated into the query.
 * @returns {string} - The resulting GraphQL query string.
 */
export function gql(strs, ...params) {
  let res = '';
  strs.forEach((s, i) => {
    res += s;
    if (i < params.length) {
      res += params[i];
    }
  });
  return res.replace(/(\\r\\n|\\n|\\r)/gm, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {Product|Variant} product
 * @returns {Rating | undefined}
 */
export function parseRating(product) {
  const { attributeMap: attrs } = product;
  /** @type {Rating} */
  // @ts-ignore
  const rating = pruneUndefined({
    count: attrs['rating-count'] ? Number.parseInt(attrs['rating-count'], 10) : undefined,
    reviews: attrs['review-count'] ? Number.parseInt(attrs['review-count'], 10) : undefined,
    value: attrs['rating-value'],
    best: attrs['best-rating'],
    worst: attrs['worst-rating'],
  }, true);

  // at least one of count, reviews, or value must exist
  if (rating.value != null
      || ['count', 'reviews'].some(
        (key) => rating[key] != null && !Number.isNaN(rating[key]),
      )) {
    return rating;
  }
  return undefined;
}

/**
   * @param {Product['images']} images images with roles
   * @param {string[]} [order] preference order
   * @returns {Product['images']}
   */
export function sortImagesByRole(images, order) {
  if (!order?.length) {
    return images;
  }

  const sorted = [];
  let remaining = images;
  order.forEach((role) => {
    const found = remaining.filter((img) => img.roles.includes(role));
    if (found.length) {
      sorted.push(...found);
      remaining = remaining.filter((img) => !found.includes(img));
    }
  });
  return sorted.concat(remaining);
}

/**
 * @param {Product|Variant} product
 */
export function parseSpecialToDate(product) {
  const specialToDate = product.attributeMap.special_to_date;
  if (specialToDate) {
    const today = new Date();
    const specialPriceToDate = new Date(specialToDate);
    if (specialPriceToDate.getTime() >= today.getTime()) {
      const [date] = specialToDate.split(' ');
      return date;
    }
  }
  return undefined;
}

export function forceImagesHTTPS(images) {
  return images?.map((img) => ({
    ...img,
    url: img.url.replace('http://', 'https://'),
  }));
}

/**
 * Finds product image
 * If product doesn't contain an image, finds first in-stock variant image
 * If no in-stock variant, returns first variant image
 *
 * @param {Product} product - The product object.
 * @param {Variant[]} [variants=[]] - The variants array.
 * @returns {Product['images'][number]} - The product image.
 */
export function findProductImage(product, variants = []) {
  if (product.images?.length || !variants.length) {
    return product.images?.[0];
  }
  const inStock = variants.find((v) => v.inStock && v.images?.length);
  if (inStock) {
    return inStock.images[0];
  }
  return variants.find((v) => v.images?.length)?.images?.[0];
}
