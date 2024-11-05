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

export const hasUppercase = (str) => /[A-Z]/.test(str);

/**
 * This function combines an array of strings with interpolated
 * parameters to create a GraphQL query string.
 * @param {string[]} strs - The string array representing parts of the GraphQL query.
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
 * This function removes all undefined values from an object.
 * @param {Record<string,unknown>} obj - The object to prune.
 * @returns {Record<string,unknown>} - The pruned object.
 */
export function pruneUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * Finds product image
 * If product doesn't contain an image, finds first in-stock variant image
 * If no in-stock variant, returns first variant image
 *
 * @param {Product} product - The product object.
 * @param {Variant[]} [variants] - The variants array.
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

/**
 * @param {any} product
 * @returns {asserts product is Product}
 */
export function assertValidProduct(product) {
  if (typeof product !== 'object' || !product.sku) {
    throw new Error('Invalid product');
  }
}

/**
 * @param {Config} config
 * @param {string} path
 * @returns {string} matched path key
 */
export function matchConfigPath(config, path) {
  // Filter out any keys that are not paths
  const pathEntries = Object.entries(config.confMap).filter(([key]) => key !== 'base');

  for (const [key] of pathEntries) {
    // Replace `{{urlkey}}` and `{{sku}}` with regex patterns
    const pattern = key
      .replace('{{urlkey}}', '([^]+)')
      .replace('{{sku}}', '([^]+)');

    // Convert to regex and test against the path
    const regex = new RegExp(`^${pattern}$`);
    const match = path.match(regex);

    if (match) {
      return key;
    }
  }
  console.warn('No match found for path:', path);
  return null;
}

export function parseSpecialToDate(product) {
  const specialToDate = product.attributes?.find((attr) => attr.name === 'special_to_date')?.value;
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
