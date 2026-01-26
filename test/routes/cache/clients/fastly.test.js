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

describe('FastlyPurgeClient Tests', () => {
  let FastlyPurgeClient;
  let ffetchStub;

  beforeEach(async () => {
    // Mock the ffetch function to avoid real HTTP calls
    ffetchStub = sinon.stub();

    const module = await esmock('../../../../src/routes/cache/clients/fastly.js', {
      '../../../../src/utils/http.js': {
        ffetch: ffetchStub,
      },
    });

    FastlyPurgeClient = module.FastlyPurgeClient;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('validate', () => {
    it('should pass validation with all required properties', () => {
      // Valid config with all required fields
      const config = {
        host: 'example.com',
        serviceId: 'service123',
        authToken: 'token123',
      };

      // Should not throw
      assert.doesNotThrow(() => {
        FastlyPurgeClient.validate(config);
      });
    });

    it('should throw error when host is missing', () => {
      // Config missing 'host' property
      const config = {
        serviceId: 'service123',
        authToken: 'token123',
      };

      // Should throw with specific error message
      assert.throws(() => {
        FastlyPurgeClient.validate(config);
      }, /invalid purge config: "host" is required/);
    });

    it('should throw error when serviceId is missing', () => {
      // Config missing 'serviceId' property
      const config = {
        host: 'example.com',
        authToken: 'token123',
      };

      // Should throw with specific error message
      assert.throws(() => {
        FastlyPurgeClient.validate(config);
      }, /invalid purge config: "serviceId" is required/);
    });

    it('should throw error when authToken is missing', () => {
      // Config missing 'authToken' property
      const config = {
        host: 'example.com',
        serviceId: 'service123',
      };

      // Should throw with specific error message
      assert.throws(() => {
        FastlyPurgeClient.validate(config);
      }, /invalid purge config: "authToken" is required/);
    });
  });

  describe('supportsPurgeByKey', () => {
    it('should return true', () => {
      // Fastly supports purge by surrogate key
      assert.strictEqual(FastlyPurgeClient.supportsPurgeByKey(), true);
    });
  });

  describe('purge', () => {
    let ctx;
    let purgeConfig;

    beforeEach(() => {
      // Setup default context with required config
      ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        requestInfo: {
          org: 'test-org',
          site: 'test-site',
        },
        attributes: {
          subRequestId: 0,
        },
      });

      // Valid Fastly purge configuration
      purgeConfig = {
        host: 'cdn.example.com',
        serviceId: 'ABC123',
        authToken: 'fastly-token-xyz',
      };
    });

    it('should successfully purge a small batch of keys', async () => {
      // Setup: Mock successful response from Fastly API
      const mockResponse = {
        ok: true,
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ status: 'ok' })),
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['key1', 'key2', 'key3'];

      // Execute purge
      await FastlyPurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify ffetch was called once with correct parameters
      assert.strictEqual(ffetchStub.callCount, 1);

      const [url, options] = ffetchStub.firstCall.args;
      assert.strictEqual(url, 'https://api.fastly.com/service/ABC123/purge');
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.headers['fastly-key'], 'fastly-token-xyz');
      assert.strictEqual(options.headers['content-type'], 'application/json');

      // Verify request body contains the surrogate keys
      const body = JSON.parse(options.body);
      assert.deepStrictEqual(body.surrogate_keys, keys);

      // Verify logging
      assert(ctx.log.info.calledTwice, 'Should log purge start and success');
      assert(ctx.log.info.firstCall.calledWith(sinon.match(/purging keys/)), 'Should log purge start');
      assert(ctx.log.info.firstCall.calledWith(sinon.match(/test-org--test-site/)), 'Should include site ID');
      assert(ctx.log.info.firstCall.calledWith(sinon.match(/\[1\]/)), 'Should include request ID');
      assert(ctx.log.info.firstCall.calledWith(sinon.match(/fastly/)), 'Should include CDN type');
      assert(ctx.log.info.secondCall.calledWith(sinon.match(/succeeded/)), 'Should log success');
    });

    it('should handle large batches by splitting into multiple requests (256 per batch)', async () => {
      // Setup: Generate 500 keys to test batching logic (should split into 2 batches)
      const keys = Array.from({ length: 500 }, (_, i) => `key${i}`);

      // Mock successful responses for each batch
      const mockResponse = {
        ok: true,
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ status: 'ok' })),
      };
      ffetchStub.resolves(mockResponse);

      // Execute purge
      await FastlyPurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify ffetch was called twice (500 keys / 256 per batch = 2 batches)
      assert.strictEqual(ffetchStub.callCount, 2);

      // Verify first batch has 256 keys
      const firstBatch = JSON.parse(ffetchStub.firstCall.args[1].body);
      assert.strictEqual(firstBatch.surrogate_keys.length, 256);

      // Verify second batch has remaining 244 keys
      const secondBatch = JSON.parse(ffetchStub.secondCall.args[1].body);
      assert.strictEqual(secondBatch.surrogate_keys.length, 244);
    });

    it('should throw error when Fastly API returns non-ok status', async () => {
      // Setup: Mock failed response from Fastly
      const mockResponse = {
        ok: false,
        status: 403,
        text: sinon.stub().resolves('Forbidden: Invalid API token'),
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['key1'];

      // Execute and expect error
      let thrownError;
      try {
        await FastlyPurgeClient.purge(ctx, purgeConfig, { keys });
      } catch (err) {
        thrownError = err;
      }

      // Verify error was thrown with correct message
      assert(thrownError);
      assert(thrownError.message.includes('purging'));
      assert(thrownError.message.includes('failed'));
      assert(thrownError.message.includes('403'));

      // Verify error logging
      assert(ctx.log.error.calledOnce, 'Should log error');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/purging.*failed/)), 'Should log failure');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/403/)), 'Should include status code');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/test-org--test-site/)), 'Should include site ID');
    });

    it('should throw error when network request fails', async () => {
      // Setup: Mock network failure
      ffetchStub.rejects(new Error('Network timeout'));

      const keys = ['key1'];

      // Execute and expect error
      let thrownError;
      try {
        await FastlyPurgeClient.purge(ctx, purgeConfig, { keys });
      } catch (err) {
        thrownError = err;
      }

      // Verify error was thrown
      assert(thrownError);
      assert(thrownError.message.includes('failed'));

      // Verify error logging
      assert(ctx.log.error.calledOnce, 'Should log error');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/failed/)), 'Should log failure');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/test-org--test-site/)), 'Should include site ID');
    });

    it('should do nothing when keys array is empty', async () => {
      // Execute purge with empty keys
      await FastlyPurgeClient.purge(ctx, purgeConfig, { keys: [] });

      // Verify no API calls were made
      assert.strictEqual(ffetchStub.callCount, 0);
    });

    it('should do nothing when keys is undefined', async () => {
      // Execute purge without keys parameter
      await FastlyPurgeClient.purge(ctx, purgeConfig, {});

      // Verify no API calls were made
      assert.strictEqual(ffetchStub.callCount, 0);
    });

    it('should include correct site identifier in logs', async () => {
      // Setup successful response
      const mockResponse = {
        ok: true,
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ status: 'ok' })),
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['key1'];

      await FastlyPurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify logs include site identifier (siteKey/storeCode/storeViewCode)
      const logCalls = ctx.log.info.getCalls();
      const hasCorrectSiteId = logCalls.some((call) => call.args[0].includes('test-org--test-site'));
      assert(hasCorrectSiteId, 'Logs should include site identifier');
    });

    it('should increment request ID for each batch', async () => {
      // Setup: Generate keys for 3 batches
      const keys = Array.from({ length: 600 }, (_, i) => `key${i}`);

      const mockResponse = {
        ok: true,
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ status: 'ok' })),
      };
      ffetchStub.resolves(mockResponse);

      await FastlyPurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify request ID incremented in context
      assert.strictEqual(ctx.attributes.subRequestId, 3);
    });
  });
});
