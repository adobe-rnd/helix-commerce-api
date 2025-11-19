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
      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        info: {
          method: 'POST',
          headers: {
            'x-cache-api-key': 'Bearer test-key',
          },
        },
        config: {
          org: 'test-org',
          site: 'test-site',
        },
        data: {
          products: [
            { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
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
      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        info: {
          method: 'POST',
          headers: {},
        },
        config: {
          org: 'test-org',
          site: 'test-site',
        },
        data: {
          products: [
            { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
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
      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        info: {
          method: 'POST',
          headers: {
            'x-cache-api-key': 'Bearer wrong-key',
          },
        },
        config: {
          org: 'test-org',
          site: 'test-site',
        },
        data: {
          products: [
            { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
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

      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        info: {
          method: 'POST',
          headers: {
            'x-cache-api-key': 'Bearer secret-key',
          },
        },
        config: {
          org: 'test-org',
          site: 'test-site',
        },
        data: {
          products: [
            { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
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

      const ctx = DEFAULT_CONTEXT({
        log: {
          warn: sinon.stub(),
          info: sinon.stub(),
          error: sinon.stub(),
        },
        info: {
          method: 'POST',
          headers: {
            'x-cache-api-key': 'secret-key',
          },
        },
        config: {
          org: 'test-org',
          site: 'test-site',
        },
        data: {
          products: [
            { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
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
    const validCtx = () => DEFAULT_CONTEXT({
      log: {
        warn: sinon.stub(),
        info: sinon.stub(),
        error: sinon.stub(),
      },
      info: {
        method: 'POST',
        headers: {
          'x-cache-api-key': 'Bearer secret-key',
        },
      },
      config: {
        org: 'test-org',
        site: 'test-site',
      },
      env: {
        CACHE_API_KEY: 'secret-key',
      },
      attributes: {},
    });

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
          { storeCode: 'us', storeViewCode: 'en' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'each product must have a "sku" property');
    });

    it('should return 400 when product is missing storeCode', async () => {
      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', storeViewCode: 'en' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'each product must have a "storeCode" property');
    });

    it('should return 400 when product is missing storeViewCode', async () => {
      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', storeCode: 'us' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'each product must have a "storeViewCode" property');
    });
  });

  describe('bulk purge', () => {
    const validCtx = () => DEFAULT_CONTEXT({
      log: {
        warn: sinon.stub(),
        info: sinon.stub(),
        error: sinon.stub(),
      },
      info: {
        method: 'POST',
        headers: {
          'x-cache-api-key': 'Bearer secret-key',
        },
      },
      config: {
        org: 'test-org',
        site: 'test-site',
      },
      env: {
        CACHE_API_KEY: 'secret-key',
      },
      attributes: {},
    });

    it('should successfully purge single product', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });
      purgeBatchStub.resolves();

      const ctx = validCtx();
      ctx.data = {
        products: [
          {
            sku: 'TEST-123', urlKey: 'test-product', storeCode: 'us', storeViewCode: 'en',
          },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 200);

      const body = JSON.parse(await response.text());
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.purged, 1);
      assert.strictEqual(body.failed, 0);
      assert.strictEqual(body.results.length, 1);
      assert.strictEqual(body.results[0].status, 'success');
      assert.strictEqual(body.results[0].sku, 'TEST-123');

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
          {
            sku: 'TEST-123', urlKey: 'test-123', storeCode: 'us', storeViewCode: 'en',
          },
          {
            sku: 'TEST-456', urlKey: 'test-456', storeCode: 'us', storeViewCode: 'en',
          },
          { sku: 'TEST-789', storeCode: 'uk', storeViewCode: 'en' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 200);

      const body = JSON.parse(await response.text());
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.purged, 3);
      assert.strictEqual(body.failed, 0);
      assert.strictEqual(body.results.length, 3);

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

    it('should handle products without urlKey', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });
      purgeBatchStub.resolves();

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 200);

      const body = JSON.parse(await response.text());
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.results[0].urlKey, undefined);

      // Verify purgeBatch was called with the products (urlKey will be undefined in product object)
      assert(purgeBatchStub.calledOnce);
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
          { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.headers.get('x-error'), 'site configuration not found');
    });

    it('should handle batch purge failures (207 Multi-Status)', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });

      // Batch purge fails - with batching, all products fail together
      purgeBatchStub.rejects(new Error('CDN purge failed'));

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
          { sku: 'TEST-456', storeCode: 'us', storeViewCode: 'en' },
          { sku: 'TEST-789', storeCode: 'us', storeViewCode: 'en' },
        ],
      };

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 207); // Multi-Status

      const body = JSON.parse(await response.text());
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.purged, 0);
      assert.strictEqual(body.failed, 3);
      assert.strictEqual(body.results.length, 3);
      // With batching, if the CDN call fails, all products fail
      assert.strictEqual(body.results[0].status, 'error');
      assert.strictEqual(body.results[0].error, 'CDN purge failed');
      assert.strictEqual(body.results[1].status, 'error');
      assert.strictEqual(body.results[1].error, 'CDN purge failed');
      assert.strictEqual(body.results[2].status, 'error');
      assert.strictEqual(body.results[2].error, 'CDN purge failed');
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
          { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
        ],
      };

      await cacheHandler.default(ctx);

      // Verify config was cached
      assert.strictEqual(ctx.attributes.helixConfigCache, mockHelixConfig);
    });

    it('should log success and failure counts', async () => {
      fetchHelixConfigStub.resolves({
        cdn: { prod: { type: 'fastly', host: 'cdn.example.com' } },
      });

      // With batched purging, if the batch fails, all products fail
      purgeBatchStub.rejects(new Error('CDN purge failed'));

      const ctx = validCtx();
      ctx.data = {
        products: [
          { sku: 'TEST-123', storeCode: 'us', storeViewCode: 'en' },
          { sku: 'TEST-456', storeCode: 'us', storeViewCode: 'en' },
        ],
      };

      await cacheHandler.default(ctx);

      // Verify logging - with batch purge, all products fail together
      assert(ctx.log.info.calledWith(sinon.match(/2 products failed/)));
    });
  });

  describe('HTTP method handling', () => {
    it('should return 405 for GET requests', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { warn: sinon.stub(), info: sinon.stub(), error: sinon.stub() },
        info: {
          method: 'GET',
          headers: {},
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 405);
      assert.strictEqual(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 405 for PUT requests', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { warn: sinon.stub(), info: sinon.stub(), error: sinon.stub() },
        info: {
          method: 'PUT',
          headers: {},
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 405);
      assert.strictEqual(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 405 for DELETE requests', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { warn: sinon.stub(), info: sinon.stub(), error: sinon.stub() },
        info: {
          method: 'DELETE',
          headers: {},
        },
      });

      const response = await cacheHandler.default(ctx);

      assert.strictEqual(response.status, 405);
      assert.strictEqual(response.headers.get('x-error'), 'method not allowed');
    });
  });
});
