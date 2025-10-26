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
import Platform from './payments/Platform.js';

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
export default async function create(ctx, req) {
  // validate payload
  const payload = await req.json();
  assertValidOrder(payload);

  // find assigned backend for site(/store/view), if any
  const platform = await Platform.fromContext(ctx);

  // platform-specific validation
  platform.assertValidOrder(payload);
  await platform.validateLineItems(payload.items);

  // create internal order
  const storage = StorageClient.fromContext(ctx);
  const order = await storage.createOrder(payload, platform.type);

  /** @type {PaymentLink|null} */
  let paymentLink = null;
  if (platform.type !== 'none') {
    paymentLink = await platform.createPaymentLink(order);
  }

  return new Response(JSON.stringify({
    order,
    payment: paymentLink,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
