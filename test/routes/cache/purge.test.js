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

describe('Cache Purge Tests', () => {
  let purge;
  let purgeBatch;
  let computeAuthoredContentKeyStub;
  let computeProductPathKeyStub;
  let FastlyPurgeClientStub;
  let CloudflarePurgeClientStub;
  let AkamaiPurgeClientStub;
  let ManagedPurgeClientStub;

  beforeEach(async () => {
    computeAuthoredContentKeyStub = sinon.stub();
    computeProductPathKeyStub = sinon.stub();

    // Create mock CDN client classes
    FastlyPurgeClientStub = {
      validate: sinon.stub(),
      purge: sinon.stub().resolves(),
    };

    CloudflarePurgeClientStub = {
      validate: sinon.stub(),
      purge: sinon.stub().resolves(),
    };

    AkamaiPurgeClientStub = {
      validate: sinon.stub(),
      purge: sinon.stub().resolves(),
    };

    ManagedPurgeClientStub = {
      validate: sinon.stub(),
      purge: sinon.stub().resolves(),
    };

    // Mock the module
    const module = await esmock('../../../src/routes/cache/purge.js', {
      '@dylandepass/helix-product-shared': {
        computeAuthoredContentKey: computeAuthoredContentKeyStub,
        computeProductPathKey: computeProductPathKeyStub,
      },
      '../../../src/routes/cache/clients/fastly.js': {
        FastlyPurgeClient: FastlyPurgeClientStub,
      },
      '../../../src/routes/cache/clients/cloudflare.js': {
        CloudflarePurgeClient: CloudflarePurgeClientStub,
      },
      '../../../src/routes/cache/clients/akamai.js': {
        AkamaiPurgeClient: AkamaiPurgeClientStub,
      },
      '../../../src/routes/cache/clients/managed.js': {
        ManagedPurgeClient: ManagedPurgeClientStub,
      },
    });

    purge = module.purge;
    purgeBatch = module.purgeBatch;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('purge function', () => {
    let ctx;
    let requestInfo;

    beforeEach(() => {
      requestInfo = {
        org: 'myorg',
        site: 'mysite',
      };

      ctx = DEFAULT_CONTEXT({
        log: {
          debug: sinon.stub(),
          info: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo,
        attributes: {
          helixConfigCache: {
            cdn: {
              prod: {
                type: 'fastly',
                host: 'cdn.example.com',
                serviceId: 'service123',
                authToken: 'token123',
              },
            },
            content: {
              contentBusId: 'content-bus-123',
            },
          },
        },
      });

      computeProductPathKeyStub.resolves('product-path-key-hash');
      computeAuthoredContentKeyStub.resolves('content-key-hash');
    });

    it('should purge both product path key and content key when contentBusId is configured', async () => {
      const path = '/us/en/products/my-product';

      await purge(ctx, requestInfo, path);

      // Verify product path key was computed
      assert(computeProductPathKeyStub.calledWith('myorg', 'mysite', '/us/en/products/my-product'));

      // Verify content key was computed
      assert(computeAuthoredContentKeyStub.calledWith('content-bus-123', '/us/en/products/my-product'));

      // Verify Fastly purge was called with both keys
      assert(FastlyPurgeClientStub.purge.calledOnce);
      const purgeArgs = FastlyPurgeClientStub.purge.firstCall.args;
      assert.deepStrictEqual(purgeArgs[2].keys, ['product-path-key-hash', 'content-key-hash']);
    });

    it('should purge product path key even when contentBusId is missing', async () => {
      delete ctx.attributes.helixConfigCache.content;

      const path = '/us/en/products/my-product';

      await purge(ctx, requestInfo, path);

      // Verify product path key was computed
      assert(computeProductPathKeyStub.calledWith('myorg', 'mysite', '/us/en/products/my-product'));

      // Verify content key was not computed
      assert(computeAuthoredContentKeyStub.notCalled);

      // Verify purge was called with only the product path key
      assert(FastlyPurgeClientStub.purge.calledOnce);
      const purgeArgs = FastlyPurgeClientStub.purge.firstCall.args;
      assert.deepStrictEqual(purgeArgs[2].keys, ['product-path-key-hash']);
    });

    it('should not purge when path is not provided', async () => {
      await purge(ctx, requestInfo, null);

      // Verify no purge was called
      assert(computeAuthoredContentKeyStub.notCalled);
      assert(FastlyPurgeClientStub.purge.notCalled);
      assert(ctx.log.warn.calledWith('No keys to purge, skipping purge'));
    });

    it('should skip purge when CDN config is missing', async () => {
      delete ctx.attributes.helixConfigCache.cdn;

      const path = '/us/en/products/my-product';

      await purge(ctx, requestInfo, path);

      assert(ctx.log.warn.calledWith('No production CDN configuration found, skipping purge'));

      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should purge Cloudflare CDN when type is cloudflare', async () => {
      ctx.attributes.helixConfigCache.cdn.prod.type = 'cloudflare';

      const path = '/us/en/products/my-product';

      await purge(ctx, requestInfo, path);

      // Verify Cloudflare purge was called
      assert(CloudflarePurgeClientStub.purge.calledOnce);
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should purge Akamai CDN when type is akamai', async () => {
      ctx.attributes.helixConfigCache.cdn.prod.type = 'akamai';

      const path = '/us/en/products/my-product';

      await purge(ctx, requestInfo, path);

      // Verify Akamai purge was called
      assert(AkamaiPurgeClientStub.purge.calledOnce);
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should purge Managed CDN when type is managed', async () => {
      ctx.attributes.helixConfigCache.cdn.prod.type = 'managed';

      const path = '/us/en/products/my-product';

      await purge(ctx, requestInfo, path);

      // Verify Managed purge was called
      assert(ManagedPurgeClientStub.purge.calledOnce);
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should throw error for unsupported CDN type', async () => {
      ctx.attributes.helixConfigCache.cdn.prod.type = 'unsupported';

      const path = '/us/en/products/my-product';

      await assert.rejects(
        () => purge(ctx, requestInfo, path),
        /Unsupported 'cdn.prod.type' value: unsupported/,
      );
    });

    it('should warn and skip purge when CDN config validation fails', async () => {
      FastlyPurgeClientStub.validate.throws(new Error('Missing serviceId'));

      const path = '/us/en/products/my-product';

      await purge(ctx, requestInfo, path);

      // Verify warning was logged
      assert(ctx.log.warn.calledWith(sinon.match(/ignoring production cdn purge config/)));

      // Verify no purge was attempted
      assert(FastlyPurgeClientStub.purge.notCalled);
    });
  });

  describe('purgeBatch function', () => {
    let ctx;
    let requestInfo;

    beforeEach(() => {
      requestInfo = {
        org: 'myorg',
        site: 'mysite',
      };

      ctx = DEFAULT_CONTEXT({
        log: {
          debug: sinon.stub(),
          info: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo,
        attributes: {
          helixConfigCache: {
            cdn: {
              prod: {
                type: 'fastly',
                host: 'cdn.example.com',
                serviceId: 'service123',
                authToken: 'token123',
              },
            },
            content: {
              contentBusId: 'content-bus-123',
            },
          },
        },
      });

      computeProductPathKeyStub.resolves('product-path-key-hash');
      computeAuthoredContentKeyStub.resolves('content-key-hash');
    });

    it('should batch purge multiple products in a single CDN call', async () => {
      computeProductPathKeyStub
        .onCall(0).resolves('product-path-key-hash-1')
        .onCall(1).resolves('product-path-key-hash-2')
        .onCall(2)
        .resolves('product-path-key-hash-3');

      computeAuthoredContentKeyStub
        .onCall(0).resolves('content-key-hash-1')
        .onCall(1).resolves('content-key-hash-2')
        .onCall(2)
        .resolves('content-key-hash-3');

      const products = [
        { sku: 'PROD-123', path: '/us/en/products/product-1' },
        { sku: 'PROD-456', path: '/us/en/products/product-2' },
        { sku: 'PROD-789', path: '/us/en/products/product-3' },
      ];

      await purgeBatch(ctx, requestInfo, products);

      // Verify all product path keys were computed
      assert.strictEqual(computeProductPathKeyStub.callCount, 3);
      assert(computeProductPathKeyStub.calledWith('myorg', 'mysite', '/us/en/products/product-1'));
      assert(computeProductPathKeyStub.calledWith('myorg', 'mysite', '/us/en/products/product-2'));
      assert(computeProductPathKeyStub.calledWith('myorg', 'mysite', '/us/en/products/product-3'));

      // Verify all content keys were computed
      assert.strictEqual(computeAuthoredContentKeyStub.callCount, 3);
      assert(computeAuthoredContentKeyStub.calledWith('content-bus-123', '/us/en/products/product-1'));
      assert(computeAuthoredContentKeyStub.calledWith('content-bus-123', '/us/en/products/product-2'));
      assert(computeAuthoredContentKeyStub.calledWith('content-bus-123', '/us/en/products/product-3'));

      // Verify single CDN purge call with all keys (product path keys + content keys)
      assert.strictEqual(FastlyPurgeClientStub.purge.callCount, 1);
      const purgeArgs = FastlyPurgeClientStub.purge.firstCall.args;
      assert.deepStrictEqual(purgeArgs[2].keys, [
        'product-path-key-hash-1',
        'content-key-hash-1',
        'product-path-key-hash-2',
        'content-key-hash-2',
        'product-path-key-hash-3',
        'content-key-hash-3',
      ]);

      // Verify logging
      assert(ctx.log.info.calledWith(sinon.match(/Purging 6 unique cache keys for 3 products/)));
    });

    it('should deduplicate keys when multiple products have the same path', async () => {
      computeProductPathKeyStub.resolves('same-product-path-key');
      computeAuthoredContentKeyStub.resolves('same-content-key');

      const products = [
        { sku: 'PROD-123', path: '/us/en/products/same-product' },
        { sku: 'PROD-456', path: '/us/en/products/same-product' },
        { sku: 'PROD-789', path: '/us/en/products/same-product' },
      ];

      await purgeBatch(ctx, requestInfo, products);

      // Verify single CDN purge call with deduplicated keys
      assert.strictEqual(FastlyPurgeClientStub.purge.callCount, 1);
      const purgeArgs = FastlyPurgeClientStub.purge.firstCall.args;
      assert.deepStrictEqual(purgeArgs[2].keys, ['same-product-path-key', 'same-content-key']);

      // Verify logging shows deduplication (2 unique keys despite 3 products)
      assert(ctx.log.info.calledWith(sinon.match(/Purging 2 unique cache keys for 3 products/)));
    });

    it('should purge product path keys even when contentBusId is not configured', async () => {
      delete ctx.attributes.helixConfigCache.content;

      const products = [
        { sku: 'PROD-123', path: '/us/en/products/product-1' },
      ];

      await purgeBatch(ctx, requestInfo, products);

      // Verify product path key was computed
      assert.strictEqual(computeProductPathKeyStub.callCount, 1);
      assert(computeProductPathKeyStub.calledWith('myorg', 'mysite', '/us/en/products/product-1'));

      // Verify content key was not computed
      assert(computeAuthoredContentKeyStub.notCalled);

      // Verify purge was called with only the product path key
      assert(FastlyPurgeClientStub.purge.calledOnce);
      const purgeArgs = FastlyPurgeClientStub.purge.firstCall.args;
      assert.deepStrictEqual(purgeArgs[2].keys, ['product-path-key-hash']);
    });

    it('should skip purge when CDN config is missing', async () => {
      delete ctx.attributes.helixConfigCache.cdn;

      const products = [
        { sku: 'PROD-123', path: '/us/en/products/product-1' },
      ];

      await purgeBatch(ctx, requestInfo, products);

      // Verify warning was logged
      assert(ctx.log.warn.calledWith('No production CDN configuration found, skipping batch purge'));

      // Verify no purge was attempted
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should work with Cloudflare CDN', async () => {
      ctx.attributes.helixConfigCache.cdn.prod.type = 'cloudflare';

      const products = [
        { sku: 'PROD-123', path: '/us/en/products/product-1' },
      ];

      await purgeBatch(ctx, requestInfo, products);

      // Verify Cloudflare purge was called
      assert(CloudflarePurgeClientStub.purge.calledOnce);
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should work with Akamai CDN', async () => {
      ctx.attributes.helixConfigCache.cdn.prod.type = 'akamai';

      const products = [
        { sku: 'PROD-123', path: '/us/en/products/product-1' },
      ];

      await purgeBatch(ctx, requestInfo, products);

      // Verify Akamai purge was called
      assert(AkamaiPurgeClientStub.purge.calledOnce);
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should work with Managed CDN', async () => {
      ctx.attributes.helixConfigCache.cdn.prod.type = 'managed';

      const products = [
        { sku: 'PROD-123', path: '/us/en/products/product-1' },
      ];

      await purgeBatch(ctx, requestInfo, products);

      // Verify Managed purge was called
      assert(ManagedPurgeClientStub.purge.calledOnce);
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should handle products without path gracefully', async () => {
      const products = [
        { sku: 'PROD-123', path: '/us/en/products/product-1' },
        { sku: 'PROD-456' }, // No path
        { sku: 'PROD-789', path: '/us/en/products/product-3' },
      ];

      await purgeBatch(ctx, requestInfo, products);

      // Verify only 2 product path keys were computed (for products with paths)
      assert.strictEqual(computeProductPathKeyStub.callCount, 2);

      // Verify only 2 content keys were computed (for products with paths)
      assert.strictEqual(computeAuthoredContentKeyStub.callCount, 2);
    });
  });
});
