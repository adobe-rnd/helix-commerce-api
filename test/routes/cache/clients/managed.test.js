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
import { DEFAULT_CONTEXT } from '../../../fixtures/context.js';

describe('ManagedPurgeClient Tests', () => {
  let ManagedPurgeClient;
  let ffetchStub;

  beforeEach(async () => {
    // Mock dependencies
    ffetchStub = sinon.stub();

    const module = await esmock('../../../../src/routes/cache/clients/managed.js', {
      '../../../../src/utils/http.js': {
        ffetch: ffetchStub,
      },
    });

    ManagedPurgeClient = module.ManagedPurgeClient;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('validate', () => {
    it('should pass validation with only host required', () => {
      // Managed CDN only requires host
      const config = {
        host: 'example.com',
      };

      // Should not throw
      assert.doesNotThrow(() => {
        ManagedPurgeClient.validate(config);
      });
    });

    it('should throw error when host is missing', () => {
      const config = {};

      assert.throws(() => {
        ManagedPurgeClient.validate(config);
      }, /invalid purge config: "host" is required/);
    });
  });

  describe('supportsPurgeByKey', () => {
    it('should return true', () => {
      // Adobe-managed CDN supports surrogate key purging
      assert.strictEqual(ManagedPurgeClient.supportsPurgeByKey(), true);
    });
  });

  describe('purge', () => {
    let ctx;
    let purgeConfig;

    beforeEach(() => {
      // Setup context with auth token
      ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        config: {
          siteKey: 'managed-site',
          storeCode: 'us',
          storeViewCode: 'en',
        },
        attributes: {
          subRequestId: 0,
        },
        env: {
          HLX_ADMIN_MANAGED_PURGEPROXY_TOKEN: 'purge-proxy-token-xyz',
        },
      });

      // Managed CDN config
      purgeConfig = {
        host: 'main--site--org.hlx.page',
      };
    });

    describe('purging surrogate keys', () => {
      it('should successfully purge surrogate keys', async () => {
        // Setup: Mock successful response
        const mockResponse = {
          ok: true,
          status: 200,
          text: sinon.stub().resolves('{"status":"ok"}'),
        };
        ffetchStub.resolves(mockResponse);

        const keys = ['key1', 'key2', 'key3'];

        // Execute purge
        await ManagedPurgeClient.purge(ctx, purgeConfig, { keys });

        // Verify purge request
        assert.strictEqual(ffetchStub.callCount, 1);

        const [url, options] = ffetchStub.firstCall.args;
        assert.strictEqual(url, 'https://purgeproxy.adobeaemcloud.com/purge/main--site--org.hlx.page');
        assert.strictEqual(options.method, 'POST');
        assert.strictEqual(options.headers['x-aem-purge-key'], 'purge-proxy-token-xyz');

        // Verify Surrogate-Key header contains space-separated keys
        assert.strictEqual(options.headers['Surrogate-Key'], 'key1 key2 key3');

        // Verify logging
        assert(ctx.log.info.calledTwice, 'Should log purge start and success');
        assert(ctx.log.info.firstCall.calledWith(sinon.match(/purging keys/)), 'Should log purge start');
        assert(ctx.log.info.firstCall.calledWith(sinon.match(/managed-site\/us\/en/)), 'Should include site ID');
        assert(ctx.log.info.firstCall.calledWith(sinon.match(/\[1\]/)), 'Should include request ID');
        assert(ctx.log.info.firstCall.calledWith(sinon.match(/main--site--org\.hlx\.page/)), 'Should include host');
        assert(ctx.log.info.secondCall.calledWith(sinon.match(/surrogate key\(s\) succeeded/)), 'Should log success');
      });

      it('should split large key sets into batches of 256', async () => {
        // Setup: Generate 500 keys
        const keys = Array.from({ length: 500 }, (_, i) => `key${i}`);

        const mockResponse = {
          ok: true,
          status: 200,
          text: sinon.stub().resolves('{"status":"ok"}'),
        };
        ffetchStub.resolves(mockResponse);

        await ManagedPurgeClient.purge(ctx, purgeConfig, { keys });

        // Should make 2 requests (500 / 256 = 2 batches)
        assert.strictEqual(ffetchStub.callCount, 2);

        // Verify first batch has 256 keys
        const firstBatchHeader = ffetchStub.firstCall.args[1].headers['Surrogate-Key'];
        const firstBatchKeys = firstBatchHeader.split(' ');
        assert.strictEqual(firstBatchKeys.length, 256);

        // Verify second batch has remaining 244 keys
        const secondBatchHeader = ffetchStub.secondCall.args[1].headers['Surrogate-Key'];
        const secondBatchKeys = secondBatchHeader.split(' ');
        assert.strictEqual(secondBatchKeys.length, 244);
      });

      it('should use envId when provided instead of host', async () => {
        // Setup: Config with envId
        const configWithEnvId = {
          host: 'main--site--org.hlx.page',
          envId: 'custom-env-id-123',
        };

        const mockResponse = {
          ok: true,
          status: 200,
          text: sinon.stub().resolves('{"status":"ok"}'),
        };
        ffetchStub.resolves(mockResponse);

        const keys = ['key1'];

        await ManagedPurgeClient.purge(ctx, configWithEnvId, { keys });

        // Verify envId is used in URL
        const url = ffetchStub.firstCall.args[0];
        assert.strictEqual(url, 'https://purgeproxy.adobeaemcloud.com/purge/custom-env-id-123');

        // Verify logging uses envId
        assert(ctx.log.info.calledWith(sinon.match(/custom-env-id-123/)));
      });

      it('should throw error when surrogate key purge fails', async () => {
        // Setup: Mock failed response
        const mockResponse = {
          ok: false,
          status: 403,
          text: sinon.stub().resolves('Forbidden'),
        };
        ffetchStub.resolves(mockResponse);

        const keys = ['key1'];

        // Execute and expect error
        let thrownError;
        try {
          await ManagedPurgeClient.purge(ctx, purgeConfig, { keys });
        } catch (err) {
          thrownError = err;
        }

        // Verify error was thrown
        assert(thrownError);
        assert(thrownError.message.includes('surrogate key(s) failed'));
        assert(thrownError.message.includes('403'));

        // Verify error logging
        assert(ctx.log.error.calledOnce, 'Should log error');
        assert(ctx.log.error.firstCall.calledWith(sinon.match(/surrogate key\(s\) failed/)), 'Should log failure message');
        assert(ctx.log.error.firstCall.calledWith(sinon.match(/403/)), 'Should include status code');
        assert(ctx.log.error.firstCall.calledWith(sinon.match(/managed-site\/us\/en/)), 'Should include site ID');
      });

      it('should throw error on network failure', async () => {
        // Setup: Mock network error
        ffetchStub.rejects(new Error('Connection refused'));

        const keys = ['key1'];

        // Execute and expect error
        let thrownError;
        try {
          await ManagedPurgeClient.purge(ctx, purgeConfig, { keys });
        } catch (err) {
          thrownError = err;
        }

        // Verify error was thrown
        assert(thrownError);
        assert(thrownError.message.includes('failed'));

        // Verify error logging
        assert(ctx.log.error.calledOnce, 'Should log error');
        assert(ctx.log.error.firstCall.calledWith(sinon.match(/failed/)), 'Should log failure');
        assert(ctx.log.error.firstCall.calledWith(sinon.match(/managed-site\/us\/en/)), 'Should include site ID');
      });
    });

    describe('edge cases', () => {
      it('should do nothing when keys are empty', async () => {
        // Execute with empty array
        await ManagedPurgeClient.purge(ctx, purgeConfig, { keys: [] });

        // Verify no API calls
        assert.strictEqual(ffetchStub.callCount, 0);
      });

      it('should do nothing when keys are undefined', async () => {
        // Execute without parameters
        await ManagedPurgeClient.purge(ctx, purgeConfig, {});

        // Verify no API calls
        assert.strictEqual(ffetchStub.callCount, 0);
      });

      it('should increment request ID for each purge operation', async () => {
        const mockResponse = {
          ok: true,
          status: 200,
          text: sinon.stub().resolves('{"status":"ok"}'),
        };
        ffetchStub.resolves(mockResponse);

        const keys = ['key1', 'key2'];

        await ManagedPurgeClient.purge(ctx, purgeConfig, { keys });

        // Request ID should be incremented
        assert.strictEqual(ctx.attributes.subRequestId, 1);
      });
    });
  });
});
