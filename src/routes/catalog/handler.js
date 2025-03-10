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
import lookup from './lookup.js';
import fetch from './fetch.js';
import update from './update.js';
import remove from './remove.js';

/**
 * @type {Record<string, Record<string, RouteHandler>>}
 */
const handlers = {
  lookup: {
    // api:/{org}/{site}/catalog/{storeCode}/{viewCode}/lookup?urlkey={urlkey}
    GET: lookup,
  },
  products: {
    // api:/{org}/{site}/catalog/{storeCode}/{viewCode}/products/{sku}.json
    GET: fetch,
    // api:/{org}/{site}/catalog/{storeCode}/{viewCode}/products/{sku}.json
    PUT: update,
    // api:/{org}/{site}/catalog/{storeCode}/{viewCode}/products/*
    POST: async () => errorResponse(501, 'not implemented'),
    // api:/{org}/{site}/catalog/{storeCode}/{viewCode}/products/{sku}.json
    DELETE: remove,
  },
};

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx, request) {
  const {
    config,
    info: { method },
  } = ctx;
  const pathSegments = ctx.url.pathname.split('/').filter(Boolean);
  const [storeCode, storeViewCode, subRoute, sku] = pathSegments.slice(3);

  if (!Object.keys(handlers).includes(subRoute)
    || (subRoute === 'products' && !sku)
    || (subRoute === 'lookup' && sku)) {
    return errorResponse(404, 'invalid path');
  }

  Object.assign(config, {
    storeCode,
    storeViewCode,
    subRoute,
    sku: sku && sku.endsWith('.json') ? sku.slice(0, -5) : sku,
  });

  const fn = handlers[subRoute]?.[method];
  if (!fn) {
    return errorResponse(405, 'method not allowed');
  }

  return fn(ctx, request);
}
