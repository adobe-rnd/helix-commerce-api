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

import { errorResponse } from '../../utils/http.js';
import { fetchHelixConfig } from '../../utils/config.js';
import { purgeBatch } from './purge.js';

/**
 * Validates the cache API key from the request headers.
 *
 * @param {Context} ctx - The request context
 * @returns {boolean} True if the API key is valid
 */
function validateCacheApiKey(ctx) {
  const { CACHE_API_KEY } = ctx.env;

  if (!CACHE_API_KEY) {
    ctx.log.warn('CACHE_API_KEY not configured');
    return false;
  }

  const cacheAuthHeader = ctx.info.headers['x-cache-api-key'];
  if (!cacheAuthHeader) {
    return false;
  }

  // Support both "Bearer <token>" and direct token formats
  const token = cacheAuthHeader.startsWith('Bearer ')
    ? cacheAuthHeader.substring(7)
    : cacheAuthHeader;

  return token === CACHE_API_KEY;
}

/**
 * Handles bulk cache purge requests for a specific site.
 *
 * This endpoint accepts a bulk request to purge cache entries for multiple products
 * across different store codes and store view codes within the same org/site.
 *
 * The request body should contain an array of product objects with:
 * - sku: Product SKU to purge
 * - urlKey: (optional) Product URL key to purge
 * - storeCode: Store code for the product
 * - storeViewCode: Store view code for the product
 *
 * @param {Context} ctx - The request context
 * @returns {Promise<Response>} HTTP response - 200 (empty body) on success,
 *                                              error response otherwise
 *
 * @example
 * POST /{org}/{site}/cache
 * x-cache-api-key: Bearer <CACHE_API_KEY>
 * Content-Type: application/json
 *
 * {
 *   "products": [
 *     { "sku": "PROD-123", "urlKey": "product-123", "storeCode": "us", "storeViewCode": "en" },
 *     { "sku": "PROD-456", "storeCode": "us", "storeViewCode": "en" }
 *   ]
 * }
 */
async function handleBulkPurge(ctx) {
  const { log, data, config } = ctx;

  // Validate API key
  if (!validateCacheApiKey(ctx)) {
    log.warn('Invalid or missing cache API key');
    return errorResponse(401, 'unauthorized');
  }

  // Validate request body
  if (!data || !Array.isArray(data.products)) {
    return errorResponse(400, 'request body must contain a "products" array');
  }

  if (data.products.length === 0) {
    return errorResponse(400, 'products array cannot be empty');
  }

  // Validate each product entry
  for (const product of data.products) {
    if (!product.sku) {
      return errorResponse(400, 'each product must have a "sku" property');
    }
    if (!product.storeCode) {
      return errorResponse(400, 'each product must have a "storeCode" property');
    }
    if (!product.storeViewCode) {
      return errorResponse(400, 'each product must have a "storeViewCode" property');
    }
  }

  // Fetch helix config once for the entire request
  const helixConfig = await fetchHelixConfig(ctx, config.org, config.site);
  ctx.attributes.helixConfigCache = helixConfig;

  if (!helixConfig) {
    log.warn(`No helix config found for ${config.org}/${config.site}`);
    return errorResponse(404, 'site configuration not found');
  }

  // Purge all products in a single batched operation
  try {
    // Use purgeBatch to compute all cache keys upfront and make a single CDN call
    await purgeBatch(ctx, config, data.products);

    log.info(`Cache purge completed: ${data.products.length} products purged successfully`);

    return new Response('', {
      status: 200,
    });
  } catch (error) {
    // If batch purge fails, return 500
    log.error('Failed to purge cache for batch:', error);

    return errorResponse(500, `cache purge failed: ${error.message}`);
  }
}

/**
 * Main cache route handler.
 *
 * Routes cache-related requests to the appropriate handler based on HTTP method.
 * Currently supports:
 * - POST: Bulk cache purge for multiple products
 *
 * @type {RouteHandler}
 */
export default async function cacheHandler(ctx) {
  const { info } = ctx;

  if (info.method === 'POST') {
    return handleBulkPurge(ctx);
  }

  return errorResponse(405, 'method not allowed');
}
