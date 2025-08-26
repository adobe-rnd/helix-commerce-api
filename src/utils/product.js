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

import ProductBusEntry from '../schemas/ProductBus.js';
import { errorWithResponse } from './http.js';
import { validate } from './validation.js';

/**
 * Slugify a SKU by converting it to lowercase, replacing spaces with hyphens,
 * @param {string} sku
 * @returns {string}
 */
export function slugger(sku) {
  if (typeof sku !== 'string') return '';
  return sku
    .toLowerCase()
    .replace(/[_//]/g, '-') // Replace underscores and forward slashes with hyphens
    .replace(/[^a-z0-9\s-]/g, '') // Remove all characters except a-z, 0-9, spaces, and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens into single hyphen
    .replace(/^-+/, '') // Remove leading hyphens
    .replace(/-+$/, ''); // Remove trailing hyphens
}

/**
 * This function removes all undefined values from an object.
 * @template {Record<string, unknown>} T
 * @param {T} obj - The object to prune.
 * @param {boolean} [pruneNullish=false] - Whether to remove nullish values.
 * @returns {Partial<T>} - The pruned object.
 */
export function pruneUndefined(obj, pruneNullish = false) {
  // @ts-ignore
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => (pruneNullish
        ? v != null
        : v !== undefined
      )),
  );
}

/**
 * @param {any} product
 * @returns {asserts product is ProductBusEntry}
 */
export function assertValidProduct(product) {
  try {
    validate(product, ProductBusEntry);
  } catch (err) {
    throw errorWithResponse(400, 'Invalid product', err);
  }
}
