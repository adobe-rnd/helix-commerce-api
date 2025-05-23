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

import { assertAuthorization } from '../../utils/auth.js';
import { errorResponse } from '../../utils/http.js';
import StorageClient from './StorageClient.js';

/**
 * @type {RouteHandler}
 */
export default async function remove(ctx) {
  const { log, config } = ctx;
  const { sku } = config;

  if (sku === '*') {
    return errorResponse(400, 'Wildcard SKU deletions is not currently supported');
  }

  await assertAuthorization(ctx);

  const storage = StorageClient.fromContext(ctx);
  const deleteResults = await storage.deleteProducts([sku]);

  log.info({
    action: 'delete_products',
    result: JSON.stringify(deleteResults),
    timestamp: new Date().toISOString(),
  });

  return new Response(JSON.stringify(deleteResults), { status: 200 });
}
