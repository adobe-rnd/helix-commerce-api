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

import { assertValidProduct } from '../utils/product.js';
import { callAdmin } from '../utils/admin.js';
import { errorResponse, errorWithResponse } from '../utils/http.js';
import { saveProducts } from '../utils/r2.js';

/**
 * Saves a product to R2.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Config} config - The configuration object with application settings.
 * @param {Object} product - The product object to be saved.
 * @returns {Promise<Object>} - A promise that resolves to the saved product.
 */
export async function putProduct(ctx, config, product) {
  if (!product.sku) {
    throw errorWithResponse(400, 'invalid request body: missing sku');
  }

  await saveProducts(ctx, config, [product]);
  return product;
}

/**
 * Handles a PUT request to update a product.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Config} config - The configuration object with application settings.
 * @param {Request} request - The request object.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export async function handleProductSaveRequest(ctx, config, request) {
  try {
    let product;

    if (config.sku === '*') {
      return errorResponse(501, 'not implemented');
    } else {
      try {
        product = await request.json();
      } catch (jsonError) {
        ctx.log.error('Invalid JSON in request body:', jsonError);
        return errorResponse(400, 'invalid JSON');
      }

      try {
        assertValidProduct(product);
      } catch (e) {
        return errorResponse(400, e.message);
      }
    }

    const { base: _ = undefined, ...otherPatterns } = config.confEnvMap[config.env] ?? {};
    const matchedPathPatterns = Object.entries(otherPatterns)
      .reduce((acc, [pattern, matchConf]) => {
        // find only configs that match the provided store & view codes
        if (config.storeCode === matchConf.storeCode
          && config.storeViewCode === matchConf.storeViewCode) {
          acc.push(pattern);
        }
        return acc;
      }, []);

    if (!matchedPathPatterns.length) {
      return errorResponse(404, 'no path patterns found');
    }

    await putProduct(ctx, config, product);

    const purgePaths = matchedPathPatterns.map(
      (pattern) => pattern
        .replace('{{sku}}', product.sku)
        .replace('{{urlkey}}', product.urlKey),
    );

    const errors = [];
    await Promise.all(
      purgePaths.map(async (path) => {
        for (const op of ['preview', 'live']) {
          // eslint-disable-next-line no-await-in-loop
          const response = await callAdmin(config, op, path, { method: 'POST' });
          if (!response.ok) {
            errors.push({
              op,
              path,
              status: response.status,
              message: response.headers.get('x-error') ?? response.statusText,
            });
            break; // don't hit live if preview fails
          }
        }
      }),
    );

    if (errors.length) {
      // use highest error code as status,
      // so 5xx will be forwarded but all 404s will be treated as a 404
      const status = errors.reduce((errCode, { status: code }) => Math.max(errCode, code), 0);
      return new Response(JSON.stringify({ errors }), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'x-error': 'purge errors',
        },
      });
    }

    return new Response(undefined, { status: 201 });
  } catch (e) {
    if (e.response) {
      return e.response;
    }
    ctx.log.error(e);
    return errorResponse(500, 'internal server error');
  }
}
