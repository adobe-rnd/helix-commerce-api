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
import { errorWithResponse, errorResponse } from '../../utils/http.js';
import { validate } from '../../utils/validation.js';
import CustomerSchema from '../../schemas/Customer.js';

/**
 * @param {Customer} customer
 * @returns {asserts customer is Customer}
 */
export function assertValidCustomer(customer) {
  const errors = validate(customer, CustomerSchema);
  if (errors) {
    throw errorWithResponse(400, 'Invalid customer', { errors });
  }
}

/**
 * @param {Context} ctx
 * @param {Customer} data
 * @returns {Promise<Customer | null>}
 */
export async function createCustomer(ctx, data) {
  const storage = StorageClient.fromContext(ctx);
  if (await storage.customerExists(data.email)) {
    return null;
  }
  const customer = {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return storage.saveCustomer(customer);
}

/**
 * @type {RouteHandler}
 */
export default async function create(ctx) {
  // validate payload
  assertValidCustomer(ctx.data);

  const customer = await createCustomer(ctx, ctx.data);
  if (!customer) {
    return errorResponse(409, 'customer already exists');
  }

  return new Response(JSON.stringify({
    customer,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
