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

describe('CloudflarePurgeClient Tests', () => {
  let CloudflarePurgeClient;
  let ffetchStub;
  let processQueueStub;

  beforeEach(async () => {
    // Mock dependencies
    ffetchStub = sinon.stub();
    processQueueStub = sinon.stub();

    const module = await esmock('../../../../src/routes/cache/clients/cloudflare.js', {
      '../../../../src/utils/http.js': {
        ffetch: ffetchStub,
      },
      '@adobe/helix-shared-process-queue': {
        default: processQueueStub,
      },
    });

    CloudflarePurgeClient = module.CloudflarePurgeClient;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('validate', () => {
    it('should pass validation with all required properties', () => {
      // Valid Cloudflare configuration
      const config = {
        host: 'example.com',
        zoneId: 'zone123',
        apiToken: 'cf-token-xyz',
      };

      // Should not throw
      assert.doesNotThrow(() => {
        CloudflarePurgeClient.validate(config);
      });
    });

    it('should throw error when host is missing', () => {
      const config = {
        zoneId: 'zone123',
        apiToken: 'cf-token-xyz',
      };

      assert.throws(() => {
        CloudflarePurgeClient.validate(config);
      }, /invalid purge config: "host" is required/);
    });

    it('should throw error when zoneId is missing', () => {
      const config = {
        host: 'example.com',
        apiToken: 'cf-token-xyz',
      };

      assert.throws(() => {
        CloudflarePurgeClient.validate(config);
      }, /invalid purge config: "zoneId" is required/);
    });

    it('should throw error when apiToken is missing', () => {
      const config = {
        host: 'example.com',
        zoneId: 'zone123',
      };

      assert.throws(() => {
        CloudflarePurgeClient.validate(config);
      }, /invalid purge config: "apiToken" is required/);
    });
  });

  describe('supportsPurgeByKey', () => {
    it('should return true', () => {
      // Cloudflare supports cache tag purging
      assert.strictEqual(CloudflarePurgeClient.supportsPurgeByKey(), true);
    });
  });

  describe('purge', () => {
    let ctx;
    let purgeConfig;

    beforeEach(() => {
      // Setup context with logging
      ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        config: {
          siteKey: 'testsite',
          storeCode: 'us',
          storeViewCode: 'en',
        },
        attributes: {
          subRequestId: 0,
        },
      });

      // Valid Cloudflare configuration
      purgeConfig = {
        host: 'cdn.example.com',
        zoneId: 'abc123xyz',
        apiToken: 'cloudflare-api-token',
      };

      // Mock processQueue to execute callback immediately
      processQueueStub.callsFake(async (items, callback) => {
        for (const item of items) {
          // eslint-disable-next-line no-await-in-loop
          await callback(item);
        }
      });
    });

    it('should successfully purge keys using cache tags', async () => {
      // Setup: Mock successful Cloudflare response
      const mockResponse = {
        ok: true,
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ success: true })),
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['tag1', 'tag2', 'tag3'];

      // Execute purge
      await CloudflarePurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify API was called correctly
      assert.strictEqual(ffetchStub.callCount, 1);

      const [url, options] = ffetchStub.firstCall.args;
      assert.strictEqual(url, 'https://api.cloudflare.com/client/v4/zones/abc123xyz/purge_cache');
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.headers.Authorization, 'Bearer cloudflare-api-token');

      // Verify request body contains tags
      const body = JSON.parse(options.body);
      assert.deepStrictEqual(body.tags, keys);

      // Verify success logging
      assert(ctx.log.info.calledWith(sinon.match(/purging/)));
      assert(ctx.log.info.calledWith(sinon.match(/succeeded/)));
    });

    it('should split large tag sets into batches of 30 (Cloudflare API limit)', async () => {
      // Setup: Generate 65 tags to test batching (should create 3 batches: 30, 30, 5)
      const keys = Array.from({ length: 65 }, (_, i) => `tag${i}`);

      const mockResponse = {
        ok: true,
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ success: true })),
      };
      ffetchStub.resolves(mockResponse);

      // Execute purge
      await CloudflarePurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify 3 API calls were made (65 tags / 30 per batch = 3 batches)
      assert.strictEqual(ffetchStub.callCount, 3);

      // Verify batch sizes
      const batch1 = JSON.parse(ffetchStub.getCall(0).args[1].body);
      assert.strictEqual(batch1.tags.length, 30);

      const batch2 = JSON.parse(ffetchStub.getCall(1).args[1].body);
      assert.strictEqual(batch2.tags.length, 30);

      const batch3 = JSON.parse(ffetchStub.getCall(2).args[1].body);
      assert.strictEqual(batch3.tags.length, 5);
    });

    it('should throw error when Cloudflare API returns success: false', async () => {
      // Setup: Mock Cloudflare error response
      const mockResponse = {
        ok: true, // HTTP 200 but success: false in body
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ success: false, errors: ['Invalid tag'] })),
        headers: {
          get: sinon.stub().returns('abc-ray-123'),
        },
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['invalid-tag'];

      // Execute and expect error
      let thrownError;
      try {
        await CloudflarePurgeClient.purge(ctx, purgeConfig, { keys });
      } catch (err) {
        thrownError = err;
      }

      // Verify error was thrown
      assert(thrownError);
      assert(thrownError.message.includes('purge failed'));

      // Verify error logging includes cf-ray header
      assert(ctx.log.error.calledWith(sinon.match(/cf-ray/)));
    });

    it('should throw error when HTTP request fails', async () => {
      // Setup: Mock HTTP error
      const mockResponse = {
        ok: false,
        status: 403,
        text: sinon.stub().resolves('Forbidden'),
        headers: {
          get: sinon.stub().returns('def-ray-456'),
        },
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['tag1'];

      // Execute and expect error
      let thrownError;
      try {
        await CloudflarePurgeClient.purge(ctx, purgeConfig, { keys });
      } catch (err) {
        thrownError = err;
      }

      // Verify error was thrown with status code
      assert(thrownError);
      assert(thrownError.message.includes('403'));

      // Verify error logging
      assert(ctx.log.error.called);
    });

    it('should do nothing when keys array is empty', async () => {
      // Execute with empty keys
      await CloudflarePurgeClient.purge(ctx, purgeConfig, { keys: [] });

      // Verify no API calls
      assert.strictEqual(ffetchStub.callCount, 0);
    });

    it('should do nothing when keys is undefined', async () => {
      // Execute without keys
      await CloudflarePurgeClient.purge(ctx, purgeConfig, {});

      // Verify no API calls
      assert.strictEqual(ffetchStub.callCount, 0);
    });

    it('should use processQueue for parallel batch processing', async () => {
      // Setup: Multiple batches
      const keys = Array.from({ length: 90 }, (_, i) => `tag${i}`);

      const mockResponse = {
        ok: true,
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ success: true })),
      };
      ffetchStub.resolves(mockResponse);

      await CloudflarePurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify processQueue was called with the batched payloads
      assert(processQueueStub.calledOnce);

      // First argument should be array of payloads
      const payloads = processQueueStub.firstCall.args[0];
      assert.strictEqual(payloads.length, 3); // 90 / 30 = 3 batches
    });

    it('should increment request ID for tracking', async () => {
      const keys = ['tag1', 'tag2'];

      const mockResponse = {
        ok: true,
        status: 200,
        text: sinon.stub().resolves(JSON.stringify({ success: true })),
      };
      ffetchStub.resolves(mockResponse);

      await CloudflarePurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify request ID was incremented
      assert.strictEqual(ctx.attributes.subRequestId, 1);
    });
  });
});
