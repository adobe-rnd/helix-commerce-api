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

import assert from 'assert';
import ProductBusEntry from '../../src/schemas/ProductBus.js';
import { validate } from '../../src/utils/validation.js';

describe('schemas/ProductBus.shipping any-of', () => {
  function makeBase(overrides = {}) {
    return {
      sku: 'sku-1',
      name: 'Product',
      path: '/products/test-product',
      ...overrides,
    };
  }

  it('accepts shipping as string', () => {
    const product = makeBase({ shipping: '5.00 USD' });
    const errs = validate(product, ProductBusEntry);
    assert.ok(!errs);
  });

  it('accepts shipping as object', () => {
    const product = makeBase({ shipping: { country: 'US', price: '10.00 USD' } });
    const errs = validate(product, ProductBusEntry);
    assert.ok(!errs);
  });

  it('accepts shipping as array of objects', () => {
    const product = makeBase({ shipping: [{ country: 'US', price: '10.00 USD' }] });
    const errs = validate(product, ProductBusEntry);
    assert.ok(!errs);
  });

  it('rejects invalid shipping type', () => {
    const product = makeBase({ shipping: 10 });
    const errs = validate(product, ProductBusEntry);
    assert.ok(errs && errs.length >= 1);
    const [err] = errs;
    assert.strictEqual(err.path, '$.shipping');
    assert.strictEqual(err.message, 'invalid type');
  });
});
