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

import assert from 'node:assert';
import { ResponseError } from '../../src/utils/http.js';
import { assertValidProduct } from '../../src/utils/product.js';
import { DEFAULT_CONTEXT } from '../fixtures/context.js';

describe('schemas/ProductBus', () => {
  describe.skip('should reject invalid values', () => {
    it('invalid images', async () => {
      const product = {
        sku: '123',
        urlKey: '123',
        name: 'Product 1',
        images: 'invalid type',
      };
      try {
        assertValidProduct(DEFAULT_CONTEXT(), product);
        assert.ok(false, 'should have thrown');
      } catch (e) {
        const { response } = e;
        assert.ok(response instanceof Response);
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.headers.get('x-error'), 'Invalid product');

        const json = await response.json();
        assert.deepStrictEqual(json.errors, [
          {
            path: '$.images',
            message: 'invalid type',
            details: 'expected array, got string',
          },
        ]);
      }
    });

    it('invalid images entry', async () => {
      const product = {
        sku: '123',
        urlKey: '123',
        name: 'Product 1',
        images: [[]],
      };
      try {
        assertValidProduct(DEFAULT_CONTEXT(), product);
        assert.ok(false, 'should have thrown');
      } catch (e) {
        const { response } = e;
        assert.ok(response instanceof Response);
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.headers.get('x-error'), 'Invalid product');

        const json = await response.json();
        assert.deepStrictEqual(json.errors, [
          {
            path: '$.images[0]',
            message: 'object missing required properties',
            details: "missing property keys: ['url']",
          },
        ]);
      }
    });

    it('invalid price', async () => {
      const product = {
        sku: '123',
        urlKey: '123',
        name: 'Product 1',
        price: {
          currency: 'USD',
          regular: 100,
          final: 100,
        },
      };
      try {
        assertValidProduct(DEFAULT_CONTEXT(), product);
        assert.ok(false, 'should have thrown');
      } catch (e) {
        assert.ok(e instanceof ResponseError);
        const { response } = e;
        assert.ok(response);
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.headers.get('x-error'), 'Invalid product');

        const json = await response.json();
        assert.deepStrictEqual(json.errors, [
          {
            path: '$.price.regular',
            message: 'invalid type',
            details: 'expected string, got number',
          },
        ]);
      }
    });
  });

  describe('OpenAI Commerce Feed fields', () => {
    it('should accept products with merchant information', () => {
      const product = {
        sku: '123',
        name: 'Product 1',
        path: '/products/test',
        merchant: {
          name: 'Test Seller',
          url: 'https://seller.com',
          privacyPolicy: 'https://seller.com/privacy',
          termsOfService: 'https://seller.com/tos',
        },
      };
      assertValidProduct(DEFAULT_CONTEXT(), product);
    });

    it('should accept products with feed eligibility flags', () => {
      const product = {
        sku: '123',
        name: 'Product 1',
        path: '/products/test',
        feeds: {
          openai: {
            isEligibleForSearch: true,
            isEligibleForCheckout: true,
          },
        },
      };
      assertValidProduct(DEFAULT_CONTEXT(), product);
    });

    it('should reject feed object missing required fields', async () => {
      const product = {
        sku: '123',
        name: 'Product 1',
        path: '/products/test',
        feeds: {
          openai: {
            isEligibleForSearch: true,
            // missing isEligibleForCheckout
          },
        },
      };
      try {
        assertValidProduct(DEFAULT_CONTEXT(), product);
        assert.ok(false, 'should have thrown');
      } catch (e) {
        assert.ok(e instanceof ResponseError);
        const { response } = e;
        assert.ok(response);
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.headers.get('x-error'), 'Invalid product');

        const json = await response.json();
        assert.ok(json.errors);
        assert.ok(json.errors.some((err) => err.path === '$.feeds.openai'));
      }
    });

    it('should accept products with geographic fields', () => {
      const product = {
        sku: '123',
        name: 'Product 1',
        path: '/products/test',
        feeds: {
          common: {
            geoTargetCountries: ['US', 'CA', 'MX'],
            geoStoreCountry: 'US',
          },
        },
      };
      assertValidProduct(DEFAULT_CONTEXT(), product);
    });

    it('should accept products with availability date', () => {
      const product = {
        sku: '123',
        name: 'Product 1',
        path: '/products/test',
        availability: 'PreOrder',
        availabilityDate: '2026-03-01T00:00:00Z',
      };
      assertValidProduct(DEFAULT_CONTEXT(), product);
    });

    it('should accept products without OpenAI fields (backwards compatibility)', () => {
      const product = {
        sku: '123',
        name: 'Product 1',
        path: '/products/test',
      };
      assertValidProduct(DEFAULT_CONTEXT(), product);
    });

    it('should accept products with all OpenAI fields combined', () => {
      const product = {
        sku: '123',
        name: 'Product 1',
        path: '/products/test',
        description: 'Test product description',
        brand: 'Test Brand',
        availability: 'InStock',
        price: {
          currency: 'USD',
          regular: '10.00',
          final: '9.99',
        },
        merchant: {
          name: 'Test Seller',
          url: 'https://seller.com',
          privacyPolicy: 'https://seller.com/privacy',
          termsOfService: 'https://seller.com/tos',
        },
        feeds: {
          common: {
            geoTargetCountries: ['US', 'CA'],
            geoStoreCountry: 'US',
          },
          openai: {
            isEligibleForSearch: true,
            isEligibleForCheckout: true,
          },
        },
      };
      assertValidProduct(DEFAULT_CONTEXT(), product);
    });
  });
});
