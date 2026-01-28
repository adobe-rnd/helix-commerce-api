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
import { errorWithResponse } from '../../utils/http.js';
import { validate } from '../../utils/validation.js';
import OrderSchema from '../../schemas/Order.js';
import { createAddress } from '../customers/addresses.js';
import { assertValidCustomer, createCustomer } from '../customers/create.js';

/**
 * @param {any} order
 * @returns {asserts order is Order}
 */
export function assertValidOrder(order) {
  const errors = validate(order, OrderSchema);
  if (errors) {
    throw errorWithResponse(400, 'Invalid order', { errors });
  }
}

/**
 * @type {RouteHandler}
 */
export default async function create(ctx) {
  ctx.authInfo.assertPermissions('orders:write');

  // validate payload
  assertValidOrder(ctx.data);

  // validate customer, create if needed
  assertValidCustomer(ctx.data.customer);

  // assert user auth'd with customer email (or admin)
  ctx.authInfo.assertEmail(ctx.data.customer.email);

  // create customer if needed
  await createCustomer(ctx, ctx.data.customer);

  // create internal order
  const storage = StorageClient.fromContext(ctx);
  const order = await storage.createOrder(ctx.data);

  // create link to customer
  await storage.linkOrderToCustomer(order.customer.email, order.id, order);

  // add address to customer, tbd
  await createAddress(ctx, order.customer.email, order.shipping);

  return new Response(JSON.stringify({
    order,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
