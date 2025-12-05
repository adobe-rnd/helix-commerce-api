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
import StorageClient from '../../utils/StorageClient.js';

/**
 * @type {RouteHandler}
 */
export default async function remove(ctx) {
  const { log, config, variables } = ctx;
  const { path } = variables;

  if (path === '/*') {
    return errorResponse(400, 'Wildcard path deletions not supported');
  }

  await assertAuthorization(ctx);

  const storage = StorageClient.fromContext(ctx);
  const deleteResults = await storage.deleteProductsByPath([path]);

  const products = deleteResults.map((res) => ({
    path: res.path,
    action: 'delete',
  }));

  await ctx.env.INDEXER_QUEUE.send({
    org: config.org,
    site: config.site,
    // @ts-ignore
    products,
    timestamp: Date.now(),
  });

  log.info({
    action: 'delete_products',
    result: JSON.stringify(deleteResults),
    timestamp: new Date().toISOString(),
  });

  return new Response(JSON.stringify(deleteResults), { status: 200 });
}
