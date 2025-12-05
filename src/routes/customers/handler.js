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
import handleAddresses from './addresses.js';
import handleOrders from './orders.js';
import { errorResponse } from '../../utils/http.js';
import create from './create.js';
import StorageClient from '../../utils/StorageClient.js';

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx, req) {
  const { requestInfo } = ctx;
  const { email } = requestInfo;
  const subroute = requestInfo.getVariable('subroute');

  if (subroute) {
    if (subroute === 'addresses') {
      return handleAddresses(ctx, req);
    }
    if (subroute === 'orders') {
      return handleOrders(ctx, req);
    }
    return errorResponse(404, 'Not found');
  }

  switch (ctx.requestInfo.method) {
    case 'POST': {
      await assertAuthorization(ctx);
      if (!email) {
        // create customer
        return create(ctx, req);
      }
      return errorResponse(404, 'Not found');
    }
    case 'GET': {
      await assertAuthorization(ctx);
      const storage = StorageClient.fromContext(ctx);
      if (!email) {
        // list customers
        const customers = await storage.listCustomers();
        return new Response(JSON.stringify({ customers }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      // get a customer
      const customer = await storage.getCustomer(email);
      if (!customer) {
        return errorResponse(404, 'Not found');
      }
      return new Response(JSON.stringify({ customer }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    case 'DELETE': {
      if (!email) {
        return errorResponse(404, 'Not found');
      }

      // delete customer
      // assert authorized
      await assertAuthorization(ctx);
      const storage = StorageClient.fromContext(ctx);
      await storage.deleteCustomer(email);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    default:
      return errorResponse(405, 'Method not allowed');
  }
}
