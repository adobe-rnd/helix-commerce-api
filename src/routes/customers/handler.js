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

import handleAddresses from './addresses.js';
import handleOrders from './orders.js';
import { errorResponse } from '../../utils/http.js';
import create from './create.js';

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx, req) {
  const segments = ctx.url.pathname.split('/').filter(Boolean).slice(['org', 'site', 'route'].length);
  // eslint-disable-next-line no-unused-vars
  const [email, subroute] = segments;
  Object.assign(ctx.config, {
    email,
  });
  if (subroute === 'addresses') {
    return handleAddresses(ctx, req);
  }
  if (subroute === 'orders') {
    return handleOrders(ctx, req);
  }

  switch (ctx.info.method) {
    case 'POST': {
      if (!segments.length) {
        // create customer
        return create(ctx, req);
      }
      return errorResponse(404, 'Not found');
    }
    case 'GET': {
      if (!segments.length) {
        // list customers?
        // assert superuser authorized
        return errorResponse(501, 'Not implemented');
      }
      return errorResponse(404, 'Not found');
    }
    case 'DELETE': {
      if (!segments.length) {
        // delete customer
        // assert superuser authorized
        return errorResponse(501, 'Not implemented');
      }
      return errorResponse(404, 'Not found');
    }
    default:
      return errorResponse(405, 'Method not allowed');
  }
}
