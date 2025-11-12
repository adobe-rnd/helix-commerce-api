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

/**
 * @type {RouteHandler}
 */
// eslint-disable-next-line no-unused-vars
export default async function handler(ctx, req) {
  // eslint-disable-next-line no-unused-vars
  const { email } = ctx.config;
  const segments = ctx.url.pathname.split('/').filter(Boolean).slice(['org', 'site', 'route', 'email', 'subroute'].length);
  const [orderId] = segments;
  switch (ctx.info.method) {
    case 'GET': {
      // list order for customer
      if (orderId) {
        // get order for customer
        return errorResponse(501, 'Not implemented');
      }

      // list orders for customer
      // assert authorized
      return errorResponse(501, 'Not implemented');
    }
    default:
      return errorResponse(405, 'Method not allowed');
  }
}
