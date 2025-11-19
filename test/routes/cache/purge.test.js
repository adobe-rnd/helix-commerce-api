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

describe('Cache Purge Orchestration Tests', () => {
  let purge;
  let resolveProductPathStub;
  let computeProductSkuKeyStub;
  let computeProductUrlKeyKeyStub;
  let computeAuthoredContentKeyStub;
  let FastlyPurgeClientStub;
  let CloudflarePurgeClientStub;
  let AkamaiPurgeClientStub;
  let ManagedPurgeClientStub;

  beforeEach(async () => {
    // Stub all dependencies
    resolveProductPathStub = sinon.stub();
    computeProductSkuKeyStub = sinon.stub();
    computeProductUrlKeyKeyStub = sinon.stub();
    computeAuthoredContentKeyStub = sinon.stub();

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
      '../../../src/utils/config.js': {
        resolveProductPath: resolveProductPathStub,
      },
      '@dylandepass/helix-product-shared': {
        computeProductSkuKey: computeProductSkuKeyStub,
        computeProductUrlKeyKey: computeProductUrlKeyKeyStub,
        computeAuthoredContentKey: computeAuthoredContentKeyStub,
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
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('purge function', () => {
    let ctx;

    beforeEach(() => {
      ctx = DEFAULT_CONTEXT({
        log: {
          debug: sinon.stub(),
          info: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub(),
        },
        config: {
          org: 'myorg',
          site: 'mysite',
          storeCode: 'us',
          storeViewCode: 'en',
        },
        attributes: {
          // Cached helix config (fetched once in update.js)
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
            public: {
              patterns: {
                base: { storeCode: 'us', storeViewCode: 'en' },
                '/products/{{urlKey}}': { pageType: 'product' },
              },
            },
          },
        },
      });

      // Default: Compute keys return values
      computeProductSkuKeyStub.resolves('sku-key-hash');
      computeProductUrlKeyKeyStub.resolves('urlkey-key-hash');
      computeAuthoredContentKeyStub.resolves('content-key-hash');
      resolveProductPathStub.returns('/products/my-product');
    });

    it('should purge Fastly CDN with correct keys for SKU and urlKey', async () => {
      const sku = 'PROD123';
      const urlKey = 'my-product';

      await purge(ctx, sku, urlKey);

      // Verify keys were computed
      assert(computeProductSkuKeyStub.calledWith('myorg', 'mysite', 'us', 'en', 'PROD123'));
      assert(computeProductUrlKeyKeyStub.calledWith('myorg', 'mysite', 'us', 'en', 'my-product'));

      // Verify product path was resolved
      assert(resolveProductPathStub.calledOnce);

      // Verify content key was computed with resolved path
      assert(computeAuthoredContentKeyStub.calledWith('content-bus-123', '/products/my-product'));

      // Verify Fastly client was validated and purge called
      assert(FastlyPurgeClientStub.validate.calledOnce);
      assert(FastlyPurgeClientStub.purge.calledOnce);

      // Verify all 3 keys were passed to purge
      const purgeCall = FastlyPurgeClientStub.purge.firstCall;
      const { keys } = purgeCall.args[2];
      assert.strictEqual(keys.length, 3);
      assert(keys.includes('sku-key-hash'));
      assert(keys.includes('urlkey-key-hash'));
      assert(keys.includes('content-key-hash'));
    });

    it('should purge Cloudflare CDN when type is cloudflare', async () => {
      // Override config to use Cloudflare
      ctx.attributes.helixConfigCache = {
        cdn: {
          prod: {
            type: 'cloudflare',
            host: 'cdn.example.com',
            zoneId: 'zone123',
            apiToken: 'cf-token',
          },
        },
      };

      await purge(ctx, 'SKU123', null);

      // Verify Cloudflare client was used
      assert(CloudflarePurgeClientStub.validate.calledOnce);
      assert(CloudflarePurgeClientStub.purge.calledOnce);

      // Verify other clients were not called
      assert(FastlyPurgeClientStub.purge.notCalled);
      assert(AkamaiPurgeClientStub.purge.notCalled);
      assert(ManagedPurgeClientStub.purge.notCalled);
    });

    it('should purge Akamai CDN when type is akamai', async () => {
      // Override config to use Akamai
      ctx.attributes.helixConfigCache = {
        cdn: {
          prod: {
            type: 'akamai',
            host: 'cdn.example.com',
            endpoint: 'akaa-test.purge.akamaiapis.net',
            clientSecret: 'secret',
            clientToken: 'token',
            accessToken: 'access',
          },
        },
      };

      await purge(ctx, 'SKU123', null);

      // Verify Akamai client was used
      assert(AkamaiPurgeClientStub.validate.calledOnce);
      assert(AkamaiPurgeClientStub.purge.calledOnce);
    });

    it('should purge Managed CDN when type is managed', async () => {
      // Override config to use Managed CDN
      ctx.attributes.helixConfigCache = {
        cdn: {
          prod: {
            type: 'managed',
            host: 'main--site--org.hlx.page',
          },
        },
      };

      await purge(ctx, 'SKU123', null);

      // Verify Managed client was used
      assert(ManagedPurgeClientStub.validate.calledOnce);
      assert(ManagedPurgeClientStub.purge.calledOnce);
    });

    it('should only purge SKU key when urlKey is not provided', async () => {
      // Override config to not have content bus ID
      ctx.attributes.helixConfigCache = {
        cdn: {
          prod: {
            type: 'fastly',
            host: 'cdn.example.com',
            serviceId: 'service123',
            authToken: 'token123',
          },
        },
        // No content.contentBusId here
        public: {
          patterns: {},
        },
      };

      const sku = 'PROD123';
      const urlKey = null;

      await purge(ctx, sku, urlKey);

      // Verify only SKU key was computed
      assert(computeProductSkuKeyStub.calledOnce);
      assert(computeProductUrlKeyKeyStub.notCalled);

      // Verify purge was called with only SKU key
      const { keys } = FastlyPurgeClientStub.purge.firstCall.args[2];
      assert.strictEqual(keys.length, 1);
      assert(keys.includes('sku-key-hash'));
    });

    it('should only purge urlKey key when SKU is not provided', async () => {
      const sku = null;
      const urlKey = 'my-product';

      await purge(ctx, sku, urlKey);

      // Verify only urlKey key was computed
      assert(computeProductUrlKeyKeyStub.calledOnce);
      assert(computeProductSkuKeyStub.notCalled);

      // Verify purge was called with only urlKey key
      const { keys } = FastlyPurgeClientStub.purge.firstCall.args[2];
      assert.strictEqual(keys.length, 2); // urlKey + content key
      assert(keys.includes('urlkey-key-hash'));
    });

    it('should not compute content key when contentBusId is missing', async () => {
      // Override config without contentBusId
      ctx.attributes.helixConfigCache = {
        cdn: {
          prod: {
            type: 'fastly',
            host: 'cdn.example.com',
            serviceId: 'service123',
            authToken: 'token123',
          },
        },
        public: {
          patterns: {},
        },
      };

      await purge(ctx, 'SKU123', 'my-product');

      // Verify content key was not computed
      assert(computeAuthoredContentKeyStub.notCalled);

      // Verify only SKU and urlKey keys were purged
      const { keys } = FastlyPurgeClientStub.purge.firstCall.args[2];
      assert.strictEqual(keys.length, 2);
    });

    it('should not compute content key when product path cannot be resolved', async () => {
      // resolveProductPath returns null
      resolveProductPathStub.returns(null);

      await purge(ctx, 'SKU123', 'my-product');

      // Verify content key was not computed
      assert(computeAuthoredContentKeyStub.notCalled);

      // Verify only SKU and urlKey keys were purged
      const { keys } = FastlyPurgeClientStub.purge.firstCall.args[2];
      assert.strictEqual(keys.length, 2);
    });

    it('should log warning and return early when CDN config is missing (config without cdn.prod)', async () => {
      // Return config without cdn.prod
      ctx.attributes.helixConfigCache = {};

      await purge(ctx, 'SKU123', null);

      // Verify warning was logged
      assert(ctx.log.warn.calledWith('No production CDN configuration found, skipping purge'));

      // Verify purge was not called
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should log warning and return early when helix config is null', async () => {
      // Return null config
      ctx.attributes.helixConfigCache = null;

      await purge(ctx, 'SKU123', null);

      // Verify warning was logged
      assert(ctx.log.warn.calledWith('No production CDN configuration found, skipping purge'));

      // Verify purge was not called
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should throw error for unsupported CDN type', async () => {
      // Use unsupported CDN type
      ctx.attributes.helixConfigCache = {
        cdn: {
          prod: {
            type: 'unsupported-cdn',
            host: 'cdn.example.com',
          },
        },
      };

      // Execute and expect error
      let thrownError;
      try {
        await purge(ctx, 'SKU123', null);
      } catch (err) {
        thrownError = err;
      }

      // Verify error was thrown
      assert(thrownError);
      assert(thrownError.message.includes('Unsupported'));
      assert(thrownError.message.includes('unsupported-cdn'));
    });

    it('should warn and skip purge when CDN config validation fails', async () => {
      // Make validation throw error
      FastlyPurgeClientStub.validate.throws(new Error('Missing serviceId'));

      await purge(ctx, 'SKU123', null);

      // Verify warning was logged
      assert(ctx.log.warn.calledWith(sinon.match(/ignoring production cdn purge/)));
      assert(ctx.log.warn.calledWith(sinon.match(/Missing serviceId/)));

      // Verify purge was not called
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it('should log warning and skip purge when no keys are generated', async () => {
      // Override config to not have content bus ID so no content key is generated
      ctx.attributes.helixConfigCache = {
        cdn: {
          prod: {
            type: 'fastly',
            host: 'cdn.example.com',
            serviceId: 'service123',
            authToken: 'token123',
          },
        },
      };

      // Don't provide SKU or urlKey
      await purge(ctx, null, null);

      // Verify warning was logged
      assert(ctx.log.warn.calledWith('No keys to purge, skipping purge'));

      // Verify purge was not called
      assert(FastlyPurgeClientStub.purge.notCalled);
    });

    it.skip('should truncate key list in logs when more than 10 keys', async () => {
      // This test requires modifying the purge logic to truncate key display
      // Skipping as it tests a nice-to-have feature not currently implemented
    });
  });
});
