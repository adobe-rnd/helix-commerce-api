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

import { listAllProducts, lookupSku } from '../utils/r2.js';

/**
 * Handles a product lookup request.
 * @param {Context} ctx - The context object.
 * @param {Config} config - The configuration object.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export async function handleProductLookupRequest(ctx, config) {
  const { search } = ctx.url;
  const params = new URLSearchParams(search);

  if (params.has('urlKey') || params.has('urlkey')) {
    const urlkey = params.get('urlKey') || params.get('urlkey');
    const sku = await lookupSku(ctx, config, urlkey);

    const origin = (ctx.env.ENVIRONMENT === 'dev') ? 'https://adobe-commerce-api-ci.adobeaem.workers.dev' : ctx.url.origin;
    return new Response(undefined, {
      status: 301,
      headers: {
        Location: `${origin}/${config.org}/${config.site}/catalog/${config.storeCode}/${config.storeViewCode}/product/${sku}`,
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
}
