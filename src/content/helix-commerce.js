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

import StorageClient from '../catalog/storage/r2.js';
import { errorResponse } from '../utils/http.js';
import htmlTemplateFromContext from '../templates/html/index.js';

/**
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
export async function handle(ctx) {
  const { config } = ctx;
  const { urlkey } = config.params;
  let { sku } = config.params;

  if (!sku && !urlkey) {
    return errorResponse(404, 'missing sku or urlkey');
  }

  const storageClient = new StorageClient(ctx, config);
  if (!sku) {
    sku = await storageClient.lookupSku(urlkey);
    if (!sku) {
      return errorResponse(404, 'could not find sku');
    }
  }

  const product = await storageClient.fetchProduct(sku);
  const html = htmlTemplateFromContext(ctx, product, product.variants).render();
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html',
    },
  });
}
