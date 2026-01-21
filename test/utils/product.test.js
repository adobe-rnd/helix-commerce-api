/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import assert from 'node:assert';
import sinon from 'sinon';
import { ResponseError } from '../../src/utils/http.js';
import { assertValidProduct, pruneUndefined } from '../../src/utils/product.js';
import { DEFAULT_CONTEXT } from '../fixtures/context.js';

describe('Product Utils', () => {
  describe('pruneUndefined', () => {
    it('should remove undefined values', () => {
      const obj = { a: 1, b: undefined, c: 'test' };
      const result = pruneUndefined(obj);
      assert.deepStrictEqual(result, { a: 1, c: 'test' });
    });

    it('should keep null values by default', () => {
      const obj = { a: 1, b: null, c: 'test' };
      const result = pruneUndefined(obj);
      assert.deepStrictEqual(result, { a: 1, b: null, c: 'test' });
    });

    it('should remove null values when pruneNullish is true', () => {
      const obj = {
        a: 1, b: null, c: 'test', d: undefined,
      };
      const result = pruneUndefined(obj, true);
      assert.deepStrictEqual(result, { a: 1, c: 'test' });
    });
  });

  describe('assertValidProduct', () => {
    it('should not throw for a valid product', () => {
      const ctx = DEFAULT_CONTEXT();
      const validProduct = {
        sku: 'TEST-SKU-123',
        name: 'Test Product',
        path: '/products/test-product',
      };

      assert.doesNotThrow(() => {
        assertValidProduct(ctx, validProduct);
      });
    });

    it('should throw error for invalid product with missing required fields', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
        },
      });

      const invalidProduct = {
        // Missing required 'sku' field
        name: 'Test Product',
      };

      let err;
      try {
        assertValidProduct(ctx, invalidProduct);
      } catch (e) {
        err = e;
      }

      assert(err instanceof ResponseError);
      assert.strictEqual(err.response.status, 400);
      assert.strictEqual(err.response.headers.get('x-error'), 'Invalid product');
      assert.deepStrictEqual(await err.response.json(), {
        errors: [
          {
            details: "missing property keys: ['sku', 'path']",
            message: 'object missing required properties',
            path: '$',
          },
        ],
      });

      // Verify error was logged
      assert(ctx.log.info.calledOnce);
      assert(ctx.log.info.firstCall.args[0] === 'Invalid product');
    });

    it('should throw error with multiple validation errors, breaks on first error', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
        },
      });

      const invalidProduct = {
        // Missing required fields and invalid types
        sku: 123, // Should be string
        name: null, // Should be string
      };

      let err;
      try {
        assertValidProduct(ctx, invalidProduct);
      } catch (e) {
        err = e;
      }

      assert(err instanceof ResponseError);
      assert.strictEqual(err.response.status, 400);
      assert.strictEqual(err.response.headers.get('x-error'), 'Invalid product');
      assert.deepStrictEqual(await err.response.json(), {
        errors: [
          {
            details: 'expected string, got number',
            message: 'invalid type',
            path: '$.sku',
          },
        ],
      });

      assert(ctx.log.info.calledOnce);
    });
  });
});
