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

import { assertValidProduct } from '../../utils/product.js';
import { errorResponse } from '../../utils/http.js';
import StorageClient from './StorageClient.js';
import { assertAuthorization } from '../../utils/auth.js';

/**
 * Handles a PUT request to update a product.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export default async function update(ctx) {
  const { config, log, data } = ctx;
  if (config.sku === '*') {
    return errorResponse(501, 'not implemented');
  }

  assertValidProduct(data);

  if (config.sku !== data.sku) {
    return errorResponse(400, 'sku must match the product data');
  }

  await assertAuthorization(ctx);

  const storage = StorageClient.fromContext(ctx);
  const saveResults = await storage.saveProducts([data]);

  log.info({
    action: 'save_products',
    result: JSON.stringify(saveResults),
    timestamp: new Date().toISOString(),
  });

  return new Response(JSON.stringify(saveResults), { status: 201 });
}
