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

import StorageClient from './StorageClient.js';

/**
 * Handles a product lookup request.
 * @param {Context} ctx - The context object.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export default async function lookup(ctx) {
  const {
    env,
    config,
    data = {},
  } = ctx;
  const {
    org,
    site,
    storeCode,
    storeViewCode,
  } = config;
  const storage = StorageClient.fromContext(ctx);

  if (data.urlKey || data.urlkey) {
    const urlkey = data.urlKey || data.urlkey;
    const sku = await storage.lookupSku(urlkey);

    const origin = (env.ENVIRONMENT === 'dev') ? 'https://adobe-commerce-api-ci.adobeaem.workers.dev' : ctx.url.origin;
    return new Response(undefined, {
      status: 301,
      headers: {
        Location: `${origin}/${org}/${site}/catalog/${storeCode}/${storeViewCode}/products/${sku}`,
      },
    });
  }

  const products = await storage.listAllProducts();
  const response = {
    total: products.length,
    products,
  };

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' },
  });
}
