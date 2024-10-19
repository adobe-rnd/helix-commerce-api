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

import { errorResponse } from '../utils/http.js';
import { fetchProduct } from '../utils/r2.js';

/**
 * Handles a GET request for a product.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Config} config - The configuration object with application settings.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export async function handleProductFetchRequest(ctx, config) {
  try {
    const sku = ctx.url.pathname.split('/').pop();
    const product = await fetchProduct(ctx, config, sku);

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
