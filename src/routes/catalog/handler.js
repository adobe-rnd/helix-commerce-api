/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { errorResponse, optionsHandler } from '../../utils/http.js';
import { PATH_PATTERN_WITH_JSON } from '../../utils/validation.js';
import StorageClient from '../../utils/StorageClient.js';
import retrieve from './retrieve.js';
import update from './update.js';
import remove from './remove.js';

/**
 * List all products in the catalog.
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
async function list(ctx) {
  const storage = StorageClient.fromContext(ctx);
  const result = await storage.listProducts();
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx, request) {
  const { requestInfo } = ctx;
  const { path, method } = requestInfo;

  if (method === 'OPTIONS') {
    return optionsHandler(['GET', 'PUT', 'POST', 'DELETE'])(ctx);
  }

  if (!path) {
    if (method === 'GET') {
      ctx.authInfo.assertPermissions('catalog:read');
      ctx.authInfo.assertOrgSite(requestInfo.org, requestInfo.site);
      return list(ctx);
    }
    return errorResponse(404, 'path is required');
  }

  // Validate path format (skip validation for wildcard bulk operations)
  if (path !== '/*' && !PATH_PATTERN_WITH_JSON.test(path)) {
    return errorResponse(400, 'Invalid path format. Path must start with / and contain only lowercase letters, numbers, hyphens, and forward slashes');
  }

  switch (method) {
    case 'GET':
      return retrieve(ctx, request);
    case 'POST':
      if (path !== '/*') {
        return errorResponse(400, 'POST only allowed for bulk operations at /*');
      }
      return update(ctx, request);
    case 'PUT':
      return update(ctx, request);
    case 'DELETE':
      return remove(ctx, request);
    default:
      return errorResponse(405, 'method not allowed');
  }
}
