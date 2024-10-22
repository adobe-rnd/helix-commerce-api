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

/* eslint-disable no-await-in-loop */

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
    let requestBody;

    try {
      requestBody = await request.json();
    } catch (jsonError) {
      ctx.log.error('Invalid JSON in request body:', jsonError);
      return errorResponse(400, 'invalid JSON');
    }

    if (config.sku === '*') {
      return errorResponse(501, 'not implemented');
    }

    const product = await putProduct(ctx, config, requestBody);
    const products = [product];

    const { base: _ = undefined, ...otherPatterns } = (config.env in config.confEnvMap)
      ? config.confEnvMap[config.env]
      : {};
    const matchedPathPatterns = Object.keys(otherPatterns);

    if (matchedPathPatterns.length !== 0) {
      for (const purgeProduct of products) {
        for (const pattern of matchedPathPatterns) {
          let path = pattern.replace('{{sku}}', purgeProduct.sku);

          if (path.includes('{{urlkey}}') && purgeProduct.urlKey) {
            path = path.replace('{{urlkey}}', purgeProduct.urlKey);
          }

          for (const op of ['preview', 'live']) {
            const response = await callAdmin(config, op, path, { method: 'post' });
            if (!response.ok) {
              return errorResponse(400, `failed to ${op} product`);
            }
          }
        }
      }
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
