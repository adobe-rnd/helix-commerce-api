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

// @ts-nocheck

import assert from 'node:assert';
import { DEFAULT_CONTEXT, createAuthInfoMock } from '../../fixtures/context.js';
import handler from '../../../src/routes/orders/create.js';

describe('routes/orders create tests', () => {
  it('should create an order without payment by default', async () => {
    const called = {
      customerExists: false,
      saveCustomer: false,
      createOrder: false,
      linkOrderToCustomer: false,
      saveAddress: false,
    };
    const ctx = DEFAULT_CONTEXT({
      authInfo: createAuthInfoMock(['orders:write', 'customers:write'], 'test@example.com'),
      info: { method: 'POST' },
      url: { pathname: '/org/site/orders' },
      data: {
        customer: {
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
        },
        shipping: {
          name: 'Test User',
          email: 'test@example.com',
          address1: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zip: '12345',
          country: 'US',
        },
        items: [
          {
            name: 'Product 1',
            sku: 'sku1',
            urlKey: 'product-1',
            quantity: 1,
            price: { final: '100', currency: 'USD' },
          },
        ],
      },
      attributes: {
        storageClient: {
          customerExists: async (email) => {
            called.customerExists = true;
            assert.equal(email, 'test@example.com');
            return false;
          },
          saveCustomer: async (customer) => {
            called.saveCustomer = true;
            assert.strictEqual(customer.email, 'test@example.com');
            assert.strictEqual(customer.firstName, 'Test');
            assert.strictEqual(customer.lastName, 'User');
            assert.strictEqual(customer.phone, undefined);
            assert.ok(/[\d]{4}-[\d]{2}-[\d]{2}T[\d]{2}:[\d]{2}:[\d]{2}\.[\d]{3}Z/.test(customer.createdAt));
            assert.ok(/[\d]{4}-[\d]{2}-[\d]{2}T[\d]{2}:[\d]{2}:[\d]{2}\.[\d]{3}Z/.test(customer.updatedAt));
            return customer;
          },
          createOrder: async (data, platformType) => {
            called.createOrder = true;
            assert.equal(platformType, undefined);
            return {
              id: 'order1',
              createdAt: '2021-01-01T00:00:00.000Z',
              updatedAt: '2021-01-01T00:00:00.000Z',
              state: 'pending',
              ...data,
            };
          },
          linkOrderToCustomer: async (email, orderId) => {
            called.linkOrderToCustomer = true;
            assert.equal(email, 'test@example.com');
            assert.equal(orderId, 'order1');
          },
          saveAddress: async (id, email, address) => {
            called.saveAddress = true;
            assert.equal(id, '3110f7fa1cdfe550bf75171e191b9acfa4e49714f27453986b0b3b490be98183'); // sha256 hash of the address
            assert.equal(email, 'test@example.com');
            assert.deepStrictEqual(address, {
              name: 'Test User',
              email: 'test@example.com',
              address1: '123 Main St',
              city: 'Anytown',
              state: 'CA',
              zip: '12345',
              country: 'US',
            });
          },
        },
      },
    });
    const req = new Request('http://localhost/org/site/orders', {
      method: 'POST',
      body: JSON.stringify(ctx.data),
    });
    try {
      const resp = await handler(ctx, req);
      assert.equal(resp.status, 200);
      assert.equal(called.createOrder, true);
      assert.equal(called.linkOrderToCustomer, true);
      assert.equal(called.saveAddress, true);

      const body = await resp.json();
      assert.equal(body.order.id, 'order1');
      assert.equal(body.order.createdAt, '2021-01-01T00:00:00.000Z');
      assert.equal(body.order.updatedAt, '2021-01-01T00:00:00.000Z');
      assert.equal(body.order.state, 'pending');
      assert.equal(body.order.items.length, 1);
      assert.equal(body.order.items[0].sku, 'sku1');
      assert.equal(body.order.items[0].quantity, 1);
      assert.equal(body.payment, null);
    } catch (error) {
      console.error(error.response ? await error.response.text() : error.message);
      assert.fail(error);
    }
  });
});
