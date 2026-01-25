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

import StorageClient from '../../utils/StorageClient.js';
import { errorResponse } from '../../utils/http.js';
import { DIRECTORY_PATH_PATTERN } from '../../utils/validation.js';

/**
 * Update the index registry with retry logic for concurrent modifications
 * @param {StorageClient} storage
 * @param {string} org
 * @param {string} site
 * @param {string} path
 * @param {boolean} adding - true to add, false to remove
 * @param {number} [retries=3] - number of retries on conflict
 * @returns {Promise<void>}
 */
async function updateRegistry(storage, org, site, path, adding, retries = 3) {
  const indexPath = `${path}/index.json`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // Fetch current registry with etag
      // eslint-disable-next-line no-await-in-loop
      const { data: registry, etag } = await storage.fetchIndexRegistry(org, site);

      // Update registry
      if (adding) {
        registry[indexPath] = { lastmod: new Date().toISOString() };
      } else {
        delete registry[indexPath];
      }

      // Save with etag for conditional write
      // eslint-disable-next-line no-await-in-loop
      await storage.saveIndexRegistry(org, site, registry, etag);
      return; // Success
    } catch (e) {
      if (e.code === 'PRECONDITION_FAILED' && attempt < retries) {
        // Retry on conflict
        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        // eslint-disable-next-line no-continue
        continue;
      }
      throw e;
    }
  }

  throw new Error('Failed to update registry after multiple retries');
}

/**
 * Create an index.
 * Returns 400 if path is invalid.
 * Returns 409 if index already exists (checked via registry).
 * Returns 409 if registry update fails due to conflict.
 * Returns 502 if registry update fails for other reasons.
 * Returns 201 on success.
 * Assumes caller is authorized.
 *
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
async function create(ctx) {
  let { path } = ctx.requestInfo;
  const { org, site } = ctx.requestInfo;

  path = path.replace(/\/+$/, '');

  if (path.endsWith('/index.json')) {
    path = path.slice(0, -('/index.json'.length));
  }

  if (!DIRECTORY_PATH_PATTERN.test(path)) {
    return errorResponse(400, 'invalid path');
  }

  const storage = StorageClient.fromContext(ctx);
  const indexPath = `${path}/index.json`;

  // Step 1: Check if index exists using registry
  const { data: registry, etag } = await storage.fetchIndexRegistry(org, site);
  if (registry[indexPath]) {
    return errorResponse(409, 'index already exists');
  }

  // Step 2: Update registry first
  try {
    registry[indexPath] = { lastmod: new Date().toISOString() };
    await storage.saveIndexRegistry(org, site, registry, etag);
  } catch (e) {
    if (e.code === 'PRECONDITION_FAILED') {
      // Another request modified the registry concurrently
      return errorResponse(409, 'conflict: concurrent modification');
    }
    // Other errors (network, storage, etc.)
    ctx.log.error('Failed to update registry', e);
    return errorResponse(502, 'failed to update registry');
  }

  // Step 3: Create the index.json file
  try {
    await storage.saveQueryIndexByPath(org, site, path, {});
  } catch (e) {
    // If index creation fails, we should try to rollback the registry
    ctx.log.error('Failed to create index, attempting rollback', e);
    try {
      // Fetch latest registry and remove the entry we just added
      const {
        data: currentRegistry,
        etag: currentEtag,
      } = await storage.fetchIndexRegistry(org, site);
      delete currentRegistry[indexPath];
      await storage.saveIndexRegistry(org, site, currentRegistry, currentEtag);
    } catch (rollbackError) {
      ctx.log.error('Failed to rollback registry', rollbackError);
    }
    return errorResponse(502, 'failed to create index');
  }

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

  // Update registry
  try {
    await updateRegistry(storage, org, site, path, false);
  } catch (e) {
    ctx.log.error('Failed to update registry', e);
    // Don't fail the request if registry update fails
    // The index was deleted successfully
  }

  return new Response(null, { status: 204 });
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

  switch (method) {
    case 'POST':
      ctx.authInfo.assertPermissions('indices:write');
      return create(ctx);
    case 'DELETE':
      ctx.authInfo.assertPermissions('indices:write');
      return remove(ctx);
    default:
      return errorResponse(405, 'method not allowed');
  }
}
