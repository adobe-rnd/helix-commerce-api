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
import { errorResponse } from '../utils/http.js';
import { saveProducts } from '../utils/r2.js';

/**
 * Handles a PUT request to update a product.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Config} config - The configuration object with application settings.
 * @param {Request} request - The request object.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export async function handleProductSaveRequest(ctx, config, request) {
  if (config.sku === '*') {
    return errorResponse(501, 'not implemented');
  }

  let product;
  try {
    product = await request.json();
  } catch (jsonError) {
    ctx.log.error('Invalid JSON in request body:', jsonError);
    return errorResponse(400, 'invalid JSON');
  }

  assertValidProduct(product);

  const saveResults = await saveProducts(ctx, config, [product]);

  ctx.log.info({
    action: 'save_products',
    result: JSON.stringify(saveResults),
    timestamp: new Date().toISOString(),
  });

  return new Response(JSON.stringify(saveResults), { status: 201 });
}
