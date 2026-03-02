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
import { errorResponse, optionsHandler } from '../../utils/http.js';

/**
 * @type {RouteHandler}
 */
// eslint-disable-next-line no-unused-vars
export default async function handler(ctx, req) {
  const { requestInfo } = ctx;
  const {
    email, method, org, site,
  } = requestInfo;
  const { orderId } = requestInfo;
  switch (method) {
    case 'GET': {
      const storage = StorageClient.fromContext(ctx);
      if (orderId) {
        // get order for customer
        const order = await storage.getOrder(orderId);
        // if order doesnt exist or email doesnt match customer, return 404
        if (!order || order.customer.email !== email) {
          return errorResponse(404, 'Not found');
        }
        return new Response(JSON.stringify({ order }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      // list orders for customer
      // assert authorized
      ctx.authInfo.assertPermissions('orders:read');
      ctx.authInfo.assertEmail(email);
      ctx.authInfo.assertOrgSite(org, site);
      const orders = await storage.listOrders(email);
      return new Response(JSON.stringify({ orders }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    case 'OPTIONS':
      return optionsHandler(['GET'])(ctx);
    default:
      return errorResponse(405, 'Method not allowed');
  }
}
