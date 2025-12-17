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

import { assertAuthorization } from '../../utils/auth.js';
import StorageClient from '../../utils/StorageClient.js';
import { errorResponse } from '../../utils/http.js';

/**
 * Create an index.
 * Returns 400 if index already exists.
 * Returns 201 on success.
 * Assumes caller is authorized.
 *
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
async function create(ctx) {
  const { org, site, path } = ctx.requestInfo;
  const storage = StorageClient.fromContext(ctx);
  const exists = await storage.queryIndexExists(org, site, path);
  if (exists) {
    return errorResponse(400, 'index already exists');
  }

  await storage.saveQueryIndexByPath(org, site, path, {});
  return new Response('', { status: 201 });
}

/**
 * Delete an index.
 * Returns 404 if index does not exist.
 * Returns 204 on success.
 * Assumes caller is authorized.
 *
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
async function remove(ctx) {
  const { org, site, path } = ctx.requestInfo;
  const storage = StorageClient.fromContext(ctx);
  const exists = await storage.queryIndexExists(org, site, path);
  if (!exists) {
    return errorResponse(404, 'index does not exist');
  }
  await storage.deleteQueryIndex(org, site, path);
  return new Response('', { status: 204 });
}

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx) {
  const { requestInfo } = ctx;
  const { path, method } = requestInfo;

  if (!path) {
    return errorResponse(404, 'path is required');
  }

  await assertAuthorization(ctx);

  switch (method) {
    case 'POST':
      return create(ctx);
    case 'DELETE':
      return remove(ctx);
    default:
      return errorResponse(405, 'method not allowed');
  }
}
