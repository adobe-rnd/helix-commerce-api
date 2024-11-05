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

import { hasUppercase } from '../utils/product.js';
import { errorResponse } from '../utils/http.js';
import { handleProductLookupRequest } from './lookup.js';
import { handleProductFetchRequest } from './fetch.js';
import { handleProductSaveRequest } from './update.js';

const ALLOWED_METHODS = ['GET', 'PUT'];

/**
 * Handles the catalog request.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Request} request - The request object.
 * @returns {Promise<Response>} - A promise that resolves to the catalog response.
 */
export default async function catalogHandler(ctx, request) {
  const { config } = ctx;
  const { method } = ctx.info;

  // Split the pathname into segments and filter out empty strings
  const pathSegments = ctx.url.pathname.split('/').filter(Boolean);

  if (!ALLOWED_METHODS.includes(method)) {
    return errorResponse(405, 'method not allowed');
  }

  const catalogIndex = pathSegments.indexOf('catalog');
  if (catalogIndex === -1) {
    return errorResponse(400, 'Invalid URL: Missing "catalog" segment');
  }

  if (pathSegments.length < catalogIndex + 4) {
    return errorResponse(400, 'Invalid URL structure: Expected format: /{org}/{site}/catalog/{store}/{storeView}/product/{sku}');
  }

  const [storeCode, storeViewCode, subRoute, sku] = pathSegments.slice(catalogIndex + 1);

  if (hasUppercase(sku)) {
    return errorResponse(400, 'Invalid SKU: SKU cannot contain uppercase letters');
  }

  Object.assign(config, {
    storeCode, storeViewCode, subRoute, sku,
  });

  if (subRoute === 'lookup') {
    if (ctx.info.method === 'GET') {
      return handleProductLookupRequest(ctx);
    }
    return errorResponse(405, 'method not allowed');
  }

  if (ctx.info.method === 'PUT') {
    return handleProductSaveRequest(ctx, request);
  }
  return handleProductFetchRequest(ctx);
}
