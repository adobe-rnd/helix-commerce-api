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

/**
 * Validates that all specified properties exist and are truthy in an object.
 *
 * This function is commonly used for configuration validation before executing
 * CDN purge operations. It checks each property name and throws an error for
 * the first missing or falsy value encountered.
 *
 * Note: Falsy values include: undefined, null, false, 0, '', NaN
 *
 * @param {object} obj - The object to validate
 * @param {string} msg - Error message prefix to use if validation fails
 * @param {...string} names - Property names to check (variadic arguments)
 * @throws {Error} If any property is missing or falsy, with format: "{msg}: "{name}" is required"
 *
 * @example
 * const config = { host: 'cdn.example.com', token: 'abc123' };
 * assertRequiredProperties(config, 'invalid config', 'host', 'token'); // passes
 * assertRequiredProperties(config, 'invalid config', 'host', 'missing'); // throws
 */
export function assertRequiredProperties(obj, msg, ...names) {
  for (const name of names) {
    if (!obj[name]) {
      throw new Error(`${msg}: "${name}" is required`);
    }
  }
}

/**
 * Generates sequential request IDs for tracking multiple purge operations within a context.
 *
 * This function maintains a counter on the context's attributes object, incrementing
 * it with each call. Used for correlating log messages across batch purge operations
 * to the same CDN.
 *
 * @param {Context} ctx - The request context (must have attributes object)
 * @returns {number} The next sequential request ID (starts at 1)
 *
 * @example
 * const id1 = nextRequestId(ctx); // returns 1
 * const id2 = nextRequestId(ctx); // returns 2
 * log.info(`[${id1}] Purging batch 1...`);
 */
export function nextRequestId(ctx) {
  ctx.attributes.subRequestId = (ctx.attributes.subRequestId || 0) + 1;
  return ctx.attributes.subRequestId;
}

/**
 * Generates the Cartesian product of multiple arrays as a lazy iterator.
 *
 * This generator function yields all possible combinations of elements from the
 * input arrays, where each combination contains one element from each input array.
 * The result is produced lazily, so it's memory-efficient even with large arrays.
 *
 * @generator
 * @param {...Array} arrays - Any number of arrays to compute the Cartesian product of
 * @yields {Array} Each yielded array contains one element from each input array
 *
 * @example
 * const colors = ['red', 'blue'];
 * const sizes = ['S', 'M'];
 * for (const combo of cartesian(colors, sizes)) {
 *   console.log(combo); // ['red', 'S'], ['red', 'M'], ['blue', 'S'], ['blue', 'M']
 * }
 *
 * @example
 * // Convert to array for all combinations at once
 * const allCombos = Array.from(cartesian(['a', 'b'], [1, 2]));
 * // Result: [['a', 1], ['a', 2], ['b', 1], ['b', 2]]
 */
export function* cartesian(...arrays) {
  const len = arrays.length;
  const idx = new Array(len).fill(0);
  let done = false;
  do {
    yield arrays.map((a, i) => a[idx[i]]);
    for (let i = 0; i < len; i += 1) {
      if (idx[i] < arrays[i].length - 1) {
        idx[i] += 1;
        break;
      } else {
        idx[i] = 0;
        if (i === len - 1) {
          done = true;
        }
      }
    }
  } while (!done);
}
