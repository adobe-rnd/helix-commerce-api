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
import handler from '../../../src/routes/operations-log/handler.js';

describe('routes/operations-log handler tests', () => {
  it('should 404 on invalid method', async () => {
    const ctx = DEFAULT_CONTEXT({
      url: { pathname: '/org/site/operations-log' },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 404);
  });

  it('should 404 on invalid data or action', async () => {
    const ctx = DEFAULT_CONTEXT({
      url: { pathname: '/org/site/operations-log' },
      config: {
        org: 'org',
        site: 'site',
        route: 'operations-log',
      },
      info: { method: 'POST' },
    });
    let resp = await handler(ctx);
    assert.equal(resp.status, 404);

    ctx.data = { action: 'not-valid' };
    resp = await handler(ctx);
    assert.equal(resp.status, 404);
  });

  it('should log on valid action', async () => {
    const calls = [];
    const ctx = DEFAULT_CONTEXT({
      url: { pathname: '/org/site/operations-log' },
      config: {
        org: 'org',
        site: 'site',
        route: 'operations-log',
      },
      info: { method: 'POST' },
      data: {
        action: 'add-to-cart',
        sku: 'test-sku',
        quantity: 1,
        price: 100,
        currency: 'USD',
        product: 'test-product',
        category: 'test-category',
        brand: 'test-brand',
        image: 'test-image',
        name: 'test-name',
      },
      log: {
        info: (...args) => {
          calls.push(args);
        },
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    assert.deepStrictEqual(calls, [[{
      action: 'add-to-cart',
      org: 'org',
      payload: {
        action: 'add-to-cart',
        sku: 'test-sku',
        quantity: 1,
        price: 100,
        currency: 'USD',
        product: 'test-product',
        category: 'test-category',
        brand: 'test-brand',
        image: 'test-image',
        name: 'test-name',
      },
      site: 'site',
    }]]);
  });
});
