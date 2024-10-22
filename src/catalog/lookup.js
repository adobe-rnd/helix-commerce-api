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

import { errorResponse } from '../utils/http.js';
import { listAllProducts, fetchProduct, lookupSku } from '../utils/r2.js';

/**
 * Handles a product lookup request.
 * @param {Context} ctx - The context object.
 * @param {Config} config - The configuration object.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export async function handleProductLookupRequest(ctx, config) {
  try {
    const { search } = ctx.url;
    const params = new URLSearchParams(search);

    if (params.has('urlKey') || params.has('urlkey')) {
      const urlkey = params.get('urlKey') || params.get('urlkey');
      const sku = await lookupSku(ctx, config, urlkey);
      const product = await fetchProduct(ctx, config, sku);
      return new Response(JSON.stringify(product), {
        status: 301,
        headers: {
          'Content-Type': 'application/json',
          Location: `${ctx.url.origin}/${config.org}/${config.site}/${config.env}/${config.storeCode}/${config.storeViewCode}/product/${sku}`,
        },
      });
    }

    const products = await listAllProducts(ctx, config);

    const response = {
      total: products.length,
      products,
    };

    return new Response(JSON.stringify(response), {
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
