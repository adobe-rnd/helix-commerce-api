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

import { hasUppercase } from '../../utils/product.js';
import { errorResponse } from '../../utils/http.js';
import lookup from './lookup.js';
import fetch from './fetch.js';
import update from './update.js';
import remove from './remove.js';

/**
 * @type {Record<string, Record<string, (ctx: Context, req: Request) => Promise<Response>>>}
 */
const handlers = {
  lookup: {
    // api:/{org}/{site}/catalog/{storeCode}/{viewCode}/lookup?urlkey={urlkey}
    GET: lookup,
  },
  product: {
    // api:/{org}/{site}/catalog/{storeCode}/{viewCode}/products/{sku}.json
    GET: fetch,
    // api:/{org}/{site}/products/{storeCode}/{viewCode}/products/{sku}.json
    PUT: update,
    // api:/{org}/{site}/products/{storeCode}/{viewCode}/products/*
    POST: async () => errorResponse(501, 'not implemented'),
    // api:/{org}/{site}/products/{storeCode}/{viewCode}/products/{sku}.json
    DELETE: remove,
  },
};

/**
 * Handles productbus requests.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @param {Request} request - The request object.
 * @returns {Promise<Response>} - A promise that resolves to the catalog response.
 */
export default async function handler(ctx, request) {
  const {
    config,
    info: { method },
  } = ctx;
  // Split the pathname into segments and filter out empty strings
  const pathSegments = ctx.url.pathname.split('/').filter(Boolean);
  if (pathSegments.length !== 7) {
    return errorResponse(404, 'invalid path');
  }

  const [storeCode, storeViewCode, subRoute, sku] = pathSegments.slice(4);

  if (hasUppercase(sku)) {
    return errorResponse(400, 'Invalid SKU: SKU cannot contain uppercase letters');
  }

  Object.assign(config, {
    storeCode,
    storeViewCode,
    subRoute,
    sku,
  });

  const fn = handlers[subRoute]?.[method];
  if (!fn) {
    return errorResponse(405, 'method not allowed');
  }

  return fn(ctx, request);
}
