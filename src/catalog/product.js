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

import { errorResponse, errorWithResponse } from '../utils/http.js';
import { callAdmin } from '../utils/admin.js';
import { loadProductFromR2, saveProductsToR2 } from '../utils/r2.js';

/**
 * Handles a GET request for a product.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Config} config - The configuration object with application settings.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export async function handleProductGetRequest(ctx, config) {
  try {
    const sku = ctx.url.pathname.split('/').pop();
    const product = await loadProductFromR2(ctx, config, sku);

    return new Response(JSON.stringify(product), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (e.response) {
      return e.response;
    }
    ctx.log.error(e);
    return errorResponse(500, 'internal server error');
  }
}

/**
 * Saves a product to R2 storage.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Config} config - The configuration object with application settings.
 * @param {Product} product - The product object to be saved.
 * @returns {Promise<Product>} - A promise that resolves to the product response.
 */
async function putProduct(ctx, config, product) {
  if (!product.sku) {
    throw errorWithResponse(400, 'invalid request body: missing sku');
  }

  await saveProductsToR2(ctx, config, [product]);
  return product;
}

/**
 * Handles a PUT request to update a product.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Config} config - The configuration object with application settings.
 * @param {Request} request - The request object.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export async function handleProductPutRequest(ctx, config, request) {
  try {
    let products;

    // Parse the request body only once
    const requestBody = await request.json();
    if (config.sku === '*') {
      return errorResponse(501, 'not implemented');
    } else {
      products = [await putProduct(ctx, config, requestBody)];
    }

    const matchedKeys = Object.keys(config.confMap).filter((key) => {
      const currentItem = config.confMap[key];
      return currentItem.env === config.env;
    });

    for (const product of products) {
      for (const key of matchedKeys) {
        let path = key.replace('{{sku}}', product.sku);

        if (key.includes('{{urlkey}}') && product.urlKey) {
          path = path.replace('{{urlkey}}', product.urlKey);
        }
        const previewResponse = await callAdmin(config, 'preview', path, {
          method: 'post',
        });
        if (!previewResponse.ok) {
          return errorResponse(400, 'failed to preview product');
        }
        const publishResponse = await callAdmin(config, 'live', path, {
          method: 'post',
        });
        if (!publishResponse.ok) {
          return errorResponse(400, 'failed to publish product');
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
