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
import { fetchProduct } from '../utils/r2.js';
import HTML_TEMPLATE from '../templates/html.js';

/**
 * @param {Context} ctx
 * @param {Config} config
 * @returns {Promise<Response>}
 */
export async function handle(ctx, config) {
  const { urlkey } = config.params;
  const { sku } = config.params;

  if (!sku && !urlkey) {
    return errorResponse(404, 'missing sku or urlkey');
  }

  const product = await fetchProduct(ctx, config, sku);
  const html = HTML_TEMPLATE(config, product, product.variants);
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html',
    },
  });
}
