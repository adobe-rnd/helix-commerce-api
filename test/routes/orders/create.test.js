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
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';
import handler from '../../../src/routes/orders/create.js';

describe('routes/orders create tests', () => {
  it('should create an order without payment by default', async () => {
    let createOrderCalled = false;
    const ctx = DEFAULT_CONTEXT({
      info: { method: 'POST' },
      url: { pathname: '/org/site/orders' },
      data: {
        storeCode: 'store1',
        storeViewCode: 'view1',
        items: [
          {
            name: 'Product 1',
            sku: 'sku1',
            quantity: 1,
            price: { final: '100', currency: 'USD' },
          },
        ],
      },
      attributes: {
        storageClient: {
          createOrder: async (data, platformType) => {
            createOrderCalled = true;
            assert.equal(data.storeCode, 'store1');
            assert.equal(data.storeViewCode, 'view1');
            assert.equal(platformType, 'none');
            return {
              id: 'order1',
              createdAt: '2021-01-01T00:00:00.000Z',
              updatedAt: '2021-01-01T00:00:00.000Z',
              state: 'pending',
              ...data,
            };
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
      assert.equal(createOrderCalled, true);

      const body = await resp.json();
      assert.equal(body.order.id, 'order1');
      assert.equal(body.order.createdAt, '2021-01-01T00:00:00.000Z');
      assert.equal(body.order.updatedAt, '2021-01-01T00:00:00.000Z');
      assert.equal(body.order.state, 'pending');
      assert.equal(body.order.storeCode, 'store1');
      assert.equal(body.order.storeViewCode, 'view1');
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
