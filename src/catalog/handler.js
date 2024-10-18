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
import { handleProductLookupRequest } from './lookup.js';
import { handleProductGetRequest, handleProductPutRequest } from './product.js';

const ALLOWED_METHODS = ['GET', 'PUT'];

/**
 * Handles the catalog request.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Config} config - The configuration object with application settings.
 * @param {Request} request - The request object.
 * @returns {Promise<Response>} - A promise that resolves to the catalog response.
 */
export default async function catalogHandler(ctx, config, request) {
  if (!ALLOWED_METHODS.includes(ctx.info.method)) {
    return errorResponse(405, 'method not allowed');
  }

  const pathSegments = ctx.url.pathname.split('/');
  const catalogIndex = pathSegments.indexOf('catalog');

  if (catalogIndex === -1 || pathSegments.length < catalogIndex + 5) {
    throw new Error('Invalid URL structure: Expected format: /catalog/{env}/{store}/{storeView}/{product}[/{sku}]');
  }

  const [env, storeCode, storeViewCode, subRoute, sku] = pathSegments.slice(catalogIndex + 1);

  Object.assign(config, {
    env, storeCode, storeViewCode, subRoute, sku,
  });

  if (subRoute === 'lookup') {
    if (ctx.info.method === 'GET') {
      return handleProductLookupRequest(ctx, config);
    }
    return errorResponse(405, 'method not allowed');
  }

  if (ctx.info.method === 'PUT') {
    return handleProductPutRequest(ctx, config, request);
  }
  return handleProductGetRequest(ctx, config);
}
