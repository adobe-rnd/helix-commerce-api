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
import sinon from 'sinon';
import esmock from 'esmock';
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';

describe('Cache Handler Tests', () => {
  let cacheHandler;
  let fetchHelixConfigStub;
  let purgeBatchStub;

  beforeEach(async () => {
    fetchHelixConfigStub = sinon.stub();
    purgeBatchStub = sinon.stub();

    cacheHandler = await esmock('../../../src/routes/cache/handler.js', {
      '../../../src/utils/config.js': {
        fetchHelixConfig: fetchHelixConfigStub,
      },
      '../../../src/routes/cache/purge.js': {
        purgeBatch: purgeBatchStub,
      },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('authentication', () => {
    it('should return 401 when CACHE_API_KEY is not configured', async () => {
      const headers = { 'x-cache-api-key': 'Bearer test-key' };
      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo: {
          org: 'test-org',
          site: 'test-site',
          method: 'POST',
          getHeader: (name) => headers[name.toLowerCase()],
        },
        data: {
          products: [
            { sku: 'TEST-123', path: '/us/en/products/test-product' },
          ],
        },
        env: {
          // CACHE_API_KEY not set
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.headers.get('x-error'), 'unauthorized');
    });

    it('should return 401 when authorization header is missing', async () => {
      const headers = {};
      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo: {
          org: 'test-org',
          site: 'test-site',
          method: 'POST',
          getHeader: (name) => headers[name.toLowerCase()],
        },
        data: {
          products: [
            { sku: 'TEST-123', path: '/us/en/products/test-product' },
          ],
        },
        env: {
          CACHE_API_KEY: 'secret-key',
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.headers.get('x-error'), 'unauthorized');
    });

    it('should return 401 when API key is incorrect', async () => {
      const headers = { 'x-cache-api-key': 'Bearer wrong-key' };
      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo: {
          org: 'test-org',
          site: 'test-site',
          method: 'POST',
          getHeader: (name) => headers[name.toLowerCase()],
        },
        data: {
          products: [
            { sku: 'TEST-123', path: '/us/en/products/test-product' },
          ],
        },
        env: {
          CACHE_API_KEY: 'secret-key',
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.headers.get('x-error'), 'unauthorized');
    });

    it('should accept Bearer token format', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });
      purgeBatchStub.resolves();

      const headers = { 'x-cache-api-key': 'Bearer secret-key' };
      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo: {
          org: 'test-org',
          site: 'test-site',
          siteKey: 'test-org--test-site',
          method: 'POST',
          getHeader: (name) => headers[name.toLowerCase()],
        },
        data: {
          products: [
            { sku: 'TEST-123', path: '/us/en/products/test-product' },
          ],
        },
        env: {
          CACHE_API_KEY: 'secret-key',
        },
        attributes: {},
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 200);
    });

    it('should accept direct token format (without Bearer)', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });
      purgeBatchStub.resolves();

      const headers = { 'x-cache-api-key': 'secret-key' };
      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo: {
          org: 'test-org',
          site: 'test-site',
          siteKey: 'test-org--test-site',
          method: 'POST',
          getHeader: (name) => headers[name.toLowerCase()],
        },
        data: {
          products: [
            { sku: 'TEST-123', path: '/us/en/products/test-product' },
          ],
        },
        env: {
          CACHE_API_KEY: 'secret-key',
        },
        attributes: {},
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 200);
    });
  });

  describe('request validation', () => {
    const validCtx = () => {
      const headers = { 'x-cache-api-key': 'Bearer secret-key' };
      return DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo: {
          org: 'test-org',
          site: 'test-site',
          siteKey: 'test-org--test-site',
          method: 'POST',
          getHeader: (name) => headers[name.toLowerCase()],
        },
        env: {
          CACHE_API_KEY: 'secret-key',
        },
        attributes: {},
      });
    };

    it('should return 400 when request body is missing', async () => {
      const ctx = validCtx();
      ctx.data = null;

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'request body must contain a "products" array');
    });

    it('should return 400 when products is not an array', async () => {
      const ctx = validCtx();
      ctx.data = { products: 'not-an-array' };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'request body must contain a "products" array');
    });

    it('should return 400 when products array is empty', async () => {
      const ctx = validCtx();
      ctx.data = { products: [] };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'products array cannot be empty');
    });

    it('should return 400 when product is missing sku', async () => {
      const ctx = validCtx();
      ctx.data = {
        products: [
          { path: '/us/en/products/test-product' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'each product must have a "sku" property');
    });

    it('should return 400 when product is missing path', async () => {
      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'each product must have a "path" property');
    });
  });

  describe('bulk purge', () => {
    const validCtx = () => {
      const headers = { 'x-cache-api-key': 'Bearer secret-key' };
      return DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo: {
          org: 'test-org',
          site: 'test-site',
          siteKey: 'test-org--test-site',
          method: 'POST',
          getHeader: (name) => headers[name.toLowerCase()],
        },
        env: {
          CACHE_API_KEY: 'secret-key',
        },
        attributes: {},
      });
    };

    it('should successfully purge single product', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });
      purgeBatchStub.resolves();

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', path: '/us/en/products/test-product' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 200);

      const body = await response.text();
      assert.strictEqual(body, '');

      // Verify helix config was fetched once
      assert(fetchHelixConfigStub.calledOnce);
      assert(fetchHelixConfigStub.calledWith(sinon.match.any, 'test-org', 'test-site'));

      // Verify purgeBatch was called once with the products array
      assert(purgeBatchStub.calledOnce);
      assert(purgeBatchStub.calledWith(
        sinon.match.any,
        sinon.match({ org: 'test-org', site: 'test-site' }),
        ctx.data.products,
      ));
    });

    it('should successfully purge multiple products', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });
      purgeBatchStub.resolves();

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', path: '/us/en/products/test-123' },
          { sku: 'TEST-456', path: '/us/en/products/test-456' },
          { sku: 'TEST-789', path: '/uk/en/products/test-789' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 200);

      const body = await response.text();
      assert.strictEqual(body, '');

      // Verify helix config was fetched once (not once per product)
      assert(fetchHelixConfigStub.calledOnce);

      // Verify purgeBatch was called once (batched, not once per product)
      assert.strictEqual(purgeBatchStub.callCount, 1);
      assert(purgeBatchStub.calledWith(
        sinon.match.any,
        sinon.match({ org: 'test-org', site: 'test-site' }),
        ctx.data.products,
      ));
    });

    it('should return 404 when helix config is not found', async () => {
      fetchHelixConfigStub.resolves(null);

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', path: '/us/en/products/test-product' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.headers.get('x-error'), 'site configuration not found');
    });

    it('should return 500 when batch purge fails', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });

      // Batch purge fails
      purgeBatchStub.rejects(new Error('CDN purge failed'));

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', path: '/us/en/products/test-123' },
          { sku: 'TEST-456', path: '/us/en/products/test-456' },
          { sku: 'TEST-789', path: '/us/en/products/test-789' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 500);
      assert.strictEqual(response.headers.get('x-error'), 'cache purge failed: CDN purge failed');
    });

    it('should cache helix config in context attributes', async () => {
      const mockHelixConfig = {
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      };
      fetchHelixConfigStub.resolves(mockHelixConfig);
      purgeBatchStub.resolves();

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', path: '/us/en/products/test-product' },
        ],
      };

      await cacheHandler.default(ctx);

      // Verify config was cached
      assert.strictEqual(ctx.attributes.helixConfigCache, mockHelixConfig);
    });

    it('should log success count', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });
      purgeBatchStub.resolves();

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', path: '/us/en/products/test-123' },
          { sku: 'TEST-456', path: '/us/en/products/test-456' },
        ],
      };

      await cacheHandler.default(ctx);

      // Verify success logging
      assert(ctx.log.info.calledWith(sinon.match(/2 products purged successfully/)));
    });
  });

  describe('HTTP method handling', () => {
    it('should return 405 for GET requests', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { warn: sinon.stub(), info: sinon.stub(), error: sinon.stub() },
        requestInfo: {
          method: 'GET',
          getHeader: () => null,
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 405);
      assert.strictEqual(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 405 for PUT requests', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { warn: sinon.stub(), info: sinon.stub(), error: sinon.stub() },
        requestInfo: {
          method: 'PUT',
          getHeader: () => null,
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 405);
      assert.strictEqual(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 405 for DELETE requests', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { warn: sinon.stub(), info: sinon.stub(), error: sinon.stub() },
        requestInfo: {
          method: 'DELETE',
          getHeader: () => null,
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 405);
      assert.strictEqual(response.headers.get('x-error'), 'method not allowed');
    });
  });
});
