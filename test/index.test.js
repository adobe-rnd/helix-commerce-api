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
import esmock from 'esmock';

describe('index tests', () => {
  let worker;
  let mockHandlers;
  let mockRequest;
  let mockEnv;
  let mockExecutionContext;

  beforeEach(async () => {
    // Mock handlers
    mockHandlers = {
      catalog: sinon.stub().resolves(new Response('catalog response')),
      auth: sinon.stub().resolves(new Response('auth response')),
      orders: sinon.stub().resolves(new Response('orders response')),
      customers: sinon.stub().resolves(new Response('customers response')),
      'operations-log': sinon.stub().resolves(new Response('operations-log response')),
      cache: sinon.stub().resolves(new Response('cache response')),
    };

    // Mock the routes
    worker = await esmock('../src/index.js', {
      '../src/routes/index.js': {
        default: mockHandlers,
      },
      '../src/utils/metrics.js': {
        default: sinon.stub(),
      },
    });

    // Setup mock request
    mockRequest = {
      method: 'GET',
      url: 'https://api.example.com/test-org/sites/test-site/catalog/products/test-product.json',
      headers: new Map([
        ['content-type', 'application/json'],
      ]),
      text: sinon.stub().resolves(''),
    };

    // Setup mock env
    mockEnv = {
      SUPERUSER_KEY: 'test-key',
      KEYS: {},
      INDEXER_QUEUE: {},
    };

    // Setup mock execution context
    mockExecutionContext = {
      waitUntil: sinon.stub(),
      passThroughOnException: sinon.stub(),
    };
  });

  describe('fetch handler', () => {
    it('should route to catalog handler', async () => {
      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers.catalog.calledOnce);
      const text = await response.text();
      assert.strictEqual(text, 'catalog response');
    });

    it('should route to auth handler', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/auth/retrieve';

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers.auth.calledOnce);
      const text = await response.text();
      assert.strictEqual(text, 'auth response');
    });

    it('should route to orders handler', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/orders';

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers.orders.calledOnce);
      const text = await response.text();
      assert.strictEqual(text, 'orders response');
    });

    it('should route to orders handler with orderId', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/orders/ORDER-123';

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers.orders.calledOnce);
    });

    it('should route to customers handler', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/customers';

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers.customers.calledOnce);
      const text = await response.text();
      assert.strictEqual(text, 'customers response');
    });

    it('should route to customers handler with email', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/customers/test@example.com';

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers.customers.calledOnce);
    });

    it('should route to customers handler with email and subroute', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/customers/test@example.com/addresses';

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers.customers.calledOnce);
    });

    it('should route to cache handler', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/cache';

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers.cache.calledOnce);
      const text = await response.text();
      assert.strictEqual(text, 'cache response');
    });

    it('should route to operations-log handler', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/operations-log';

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert(mockHandlers['operations-log'].calledOnce);
      const text = await response.text();
      assert.strictEqual(text, 'operations-log response');
    });

    it('should return 404 for unknown routes', async () => {
      mockRequest.url = 'https://api.example.com/unknown/path';

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.headers.get('x-error'), 'route not found');
    });

    it('should handle errors with response property', async () => {
      const errorResponse = new Response(JSON.stringify({ error: 'custom error' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
      const error = new Error('test error');
      // @ts-ignore
      error.response = errorResponse;

      mockHandlers.catalog.rejects(error);

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert.strictEqual(response.status, 400);
      const body = await response.json();
      assert.strictEqual(body.error, 'custom error');
    });

    it('should handle generic errors with 500', async () => {
      mockHandlers.catalog.rejects(new Error('unexpected error'));

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert.strictEqual(response.status, 500);
      assert.strictEqual(response.headers.get('x-error'), 'internal server error');
    });

    it('should apply CORS headers to responses', async () => {
      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert.strictEqual(response.headers.get('access-control-allow-origin'), '*');
      assert.strictEqual(response.headers.get('access-control-allow-methods'), 'GET, POST, PUT, DELETE, OPTIONS');
      assert.strictEqual(response.headers.get('access-control-allow-headers'), 'Content-Type');
    });

    it('should preserve custom CORS headers from handler response', async () => {
      mockHandlers.catalog.resolves(new Response('test', {
        headers: {
          'access-control-allow-origin': 'https://example.com',
          'access-control-allow-methods': 'GET, POST',
          'access-control-allow-headers': 'Authorization',
        },
      }));

      const response = await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      assert.strictEqual(response.headers.get('access-control-allow-origin'), 'https://example.com');
      assert.strictEqual(response.headers.get('access-control-allow-methods'), 'GET, POST');
      assert.strictEqual(response.headers.get('access-control-allow-headers'), 'Authorization');
    });
  });

  describe('parseData', () => {
    it('should return query params for GET requests', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/catalog/products/test.json?foo=bar&baz=qux';
      mockRequest.method = 'GET';

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      // Verify context.data contains query params
      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, { foo: 'bar', baz: 'qux' });
    });

    it('should return empty object for GET requests without query params', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/catalog/products/test.json';
      mockRequest.method = 'GET';

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, {});
    });

    it('should parse JSON body for POST requests', async () => {
      mockRequest.method = 'POST';
      mockRequest.text.resolves('{"key":"value"}');

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, { key: 'value' });
    });

    it('should return text for POST requests with non-JSON body', async () => {
      mockRequest.method = 'POST';
      mockRequest.text.resolves('plain text data');

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.strictEqual(ctx.data, 'plain text data');
    });

    it('should return query params for POST requests with empty body', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/catalog/products/test.json?foo=bar';
      mockRequest.method = 'POST';
      mockRequest.text.resolves('');

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, { foo: 'bar' });
    });

    it('should handle PUT requests', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/catalog/products/test.json';
      mockRequest.method = 'PUT';
      mockRequest.text.resolves('{"updated":"data"}');

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, { updated: 'data' });
    });

    it('should handle PATCH requests', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/catalog/products/test.json';
      mockRequest.method = 'PATCH';
      mockRequest.text.resolves('{"patched":"data"}');

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, { patched: 'data' });
    });

    it('should handle HEAD requests', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/catalog/products/test.json?foo=bar';
      mockRequest.method = 'HEAD';

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, { foo: 'bar' });
    });

    it('should handle OPTIONS requests', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/catalog/products/test.json';
      mockRequest.method = 'OPTIONS';

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, {});
    });

    it('should return empty object for DELETE requests', async () => {
      mockRequest.url = 'https://api.example.com/test-org/sites/test-site/catalog/products/test.json';
      mockRequest.method = 'DELETE';

      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];
      assert.deepStrictEqual(ctx.data, {});
    });
  });

  describe('makeContext', () => {
    it('should create context with all required properties', async () => {
      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];

      assert(ctx.executionContext);
      assert(ctx.attributes);
      assert(ctx.env);
      assert(ctx.url);
      assert(ctx.log);
      assert(ctx.metrics);
      assert(ctx.data !== undefined);
      assert(ctx.requestInfo);
    });

    it('should initialize metrics object with timestamps', async () => {
      await worker.default.fetch(mockRequest, mockEnv, mockExecutionContext);

      const ctx = mockHandlers.catalog.firstCall.args[0];

      assert(typeof ctx.metrics.startedAt === 'number');
      assert(Array.isArray(ctx.metrics.payloadValidationMs));
      assert(Array.isArray(ctx.metrics.imageDownloads));
      assert(Array.isArray(ctx.metrics.imageUploads));
      assert(Array.isArray(ctx.metrics.productUploadsMs));
    });
  });
});
