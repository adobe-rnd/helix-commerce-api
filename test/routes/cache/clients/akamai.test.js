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

describe('AkamaiPurgeClient Tests', () => {
  let AkamaiPurgeClient;
  let ffetchStub;

  beforeEach(async () => {
    // Mock ffetch to avoid real HTTP calls
    ffetchStub = sinon.stub();

    const module = await esmock('../../../../src/routes/cache/clients/akamai.js', {
      '../../../../src/utils/http.js': {
        ffetch: ffetchStub,
      },
    });

    AkamaiPurgeClient = module.AkamaiPurgeClient;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('validate', () => {
    it('should pass validation with all required Akamai properties', () => {
      // Valid Akamai EdgeGrid configuration
      const config = {
        host: 'example.com',
        endpoint: 'akaa-xxxxx.purge.akamaiapis.net',
        clientSecret: 'secret123',
        clientToken: 'token123',
        accessToken: 'access123',
      };

      // Should not throw
      assert.doesNotThrow(() => {
        AkamaiPurgeClient.validate(config);
      });
    });

    it('should throw error when host is missing', () => {
      const config = {
        endpoint: 'akaa-xxxxx.purge.akamaiapis.net',
        clientSecret: 'secret123',
        clientToken: 'token123',
        accessToken: 'access123',
      };

      assert.throws(() => {
        AkamaiPurgeClient.validate(config);
      }, /invalid purge config: "host" is required/);
    });

    it('should throw error when endpoint is missing', () => {
      const config = {
        host: 'example.com',
        clientSecret: 'secret123',
        clientToken: 'token123',
        accessToken: 'access123',
      };

      assert.throws(() => {
        AkamaiPurgeClient.validate(config);
      }, /invalid purge config: "endpoint" is required/);
    });

    it('should throw error when clientSecret is missing', () => {
      const config = {
        host: 'example.com',
        endpoint: 'akaa-xxxxx.purge.akamaiapis.net',
        clientToken: 'token123',
        accessToken: 'access123',
      };

      assert.throws(() => {
        AkamaiPurgeClient.validate(config);
      }, /invalid purge config: "clientSecret" is required/);
    });

    it('should throw error when clientToken is missing', () => {
      const config = {
        host: 'example.com',
        endpoint: 'akaa-xxxxx.purge.akamaiapis.net',
        clientSecret: 'secret123',
        accessToken: 'access123',
      };

      assert.throws(() => {
        AkamaiPurgeClient.validate(config);
      }, /invalid purge config: "clientToken" is required/);
    });

    it('should throw error when accessToken is missing', () => {
      const config = {
        host: 'example.com',
        endpoint: 'akaa-xxxxx.purge.akamaiapis.net',
        clientSecret: 'secret123',
        clientToken: 'token123',
      };

      assert.throws(() => {
        AkamaiPurgeClient.validate(config);
      }, /invalid purge config: "accessToken" is required/);
    });
  });

  describe('supportsPurgeByKey', () => {
    it('should return true', () => {
      // Akamai supports cache tag purging
      assert.strictEqual(AkamaiPurgeClient.supportsPurgeByKey(), true);
    });
  });

  describe('purge', () => {
    let ctx;
    let purgeConfig;

    beforeEach(() => {
      // Setup context
      ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        config: {
          siteKey: 'akamai-site',
          storeCode: 'us',
          storeViewCode: 'en',
        },
        attributes: {
          subRequestId: 0,
        },
      });

      // Valid Akamai EdgeGrid configuration
      purgeConfig = {
        host: 'www.example.com',
        endpoint: 'akaa-baseurl.purge.akamaiapis.net',
        clientSecret: 'client-secret-xyz',
        clientToken: 'akab-client-token',
        accessToken: 'akab-access-token',
      };
    });

    it('should successfully purge tags with proper HMAC authentication', async () => {
      // Setup: Mock successful Akamai response
      const mockResponse = {
        ok: true,
        status: 201,
        text: sinon.stub().resolves(JSON.stringify({
          httpStatus: 201,
          detail: 'Request accepted',
          estimatedSeconds: 5,
          purgeId: 'purge-id-123',
        })),
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['tag1', 'tag2', 'tag3'];

      // Execute purge
      await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify API was called
      assert.strictEqual(ffetchStub.callCount, 1);

      const [url, options] = ffetchStub.firstCall.args;

      // Verify correct Akamai CCU endpoint
      assert.strictEqual(url, 'https://akaa-baseurl.purge.akamaiapis.net/ccu/v3/delete/tag/production');
      assert.strictEqual(options.method, 'POST');

      // Verify Authorization header exists and has correct format (EG1-HMAC-SHA256)
      assert(options.headers.Authorization);
      assert(options.headers.Authorization.startsWith('EG1-HMAC-SHA256'));

      // Verify header contains client_token, access_token, timestamp, nonce, signature
      const authHeader = options.headers.Authorization;
      assert(authHeader.includes('client_token='));
      assert(authHeader.includes('access_token='));
      assert(authHeader.includes('timestamp='));
      assert(authHeader.includes('nonce='));
      assert(authHeader.includes('signature='));

      // Verify request body
      const body = JSON.parse(options.body);
      assert.deepStrictEqual(body.objects, keys);

      // Verify logging
      assert(ctx.log.info.calledTwice, 'Should log purge start and success');
      assert(ctx.log.info.firstCall.calledWith(sinon.match(/purging keys/)), 'Should log purge start');
      assert(ctx.log.info.firstCall.calledWith(sinon.match(/akamai-site\/us\/en/)), 'Should include site ID');
      assert(ctx.log.info.firstCall.calledWith(sinon.match(/\[1\]/)), 'Should include request ID');
      assert(ctx.log.info.firstCall.calledWith(sinon.match(/akamai/)), 'Should include CDN type');
      assert(ctx.log.info.secondCall.calledWith(sinon.match(/succeeded/)), 'Should log success');
    });

    it('should include abort signal with 10 second timeout', async () => {
      // Setup: Mock response
      const mockResponse = {
        ok: true,
        status: 201,
        text: sinon.stub().resolves(JSON.stringify({ httpStatus: 201 })),
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['tag1'];

      await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys });

      // Verify signal was provided for timeout
      const options = ffetchStub.firstCall.args[1];
      assert(options.signal, 'Should include abort signal for timeout');
    });

    it('should throw error when Akamai API returns non-ok status', async () => {
      // Setup: Mock Akamai error response
      const mockResponse = {
        ok: false,
        status: 403,
        text: sinon.stub().resolves(JSON.stringify({
          httpStatus: 403,
          title: 'Forbidden',
          detail: 'Invalid credentials',
        })),
      };
      ffetchStub.resolves(mockResponse);

      const keys = ['tag1'];

      // Execute and expect error
      let thrownError;
      try {
        await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys });
      } catch (err) {
        thrownError = err;
      }

      // Verify error was thrown
      assert(thrownError);
      assert(thrownError.message.includes('key purge failed'));
      assert(thrownError.message.includes('403'));

      // Verify error logging
      assert(ctx.log.error.calledOnce, 'Should log error');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/key purge failed/)), 'Should log failure');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/403/)), 'Should include status code');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/akamai-site\/us\/en/)), 'Should include site ID');
    });

    it('should throw error when network request fails', async () => {
      // Setup: Mock network error
      ffetchStub.rejects(new Error('Connection timeout'));

      const keys = ['tag1'];

      // Execute and expect error
      let thrownError;
      try {
        await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys });
      } catch (err) {
        thrownError = err;
      }

      // Verify error was thrown
      assert(thrownError);
      assert(thrownError.message.includes('failed'));

      // Verify error logging
      assert(ctx.log.error.calledOnce, 'Should log error');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/failed/)), 'Should log failure');
      assert(ctx.log.error.firstCall.calledWith(sinon.match(/akamai-site\/us\/en/)), 'Should include site ID');
    });

    it('should do nothing when keys array is empty', async () => {
      // Execute with empty keys
      await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys: [] });

      // Verify no API calls
      assert.strictEqual(ffetchStub.callCount, 0);
    });

    it('should do nothing when keys is undefined', async () => {
      // Execute without keys
      await AkamaiPurgeClient.purge(ctx, purgeConfig, {});

      // Verify no API calls
      assert.strictEqual(ffetchStub.callCount, 0);
    });

    it('should generate unique nonce for each request', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        text: sinon.stub().resolves(JSON.stringify({ httpStatus: 201 })),
      };
      ffetchStub.resolves(mockResponse);

      // Make two purge requests
      await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys: ['tag1'] });
      await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys: ['tag2'] });

      // Extract nonce from Authorization headers
      const auth1 = ffetchStub.firstCall.args[1].headers.Authorization;
      const auth2 = ffetchStub.secondCall.args[1].headers.Authorization;

      // Extract nonce values using regex
      const nonce1 = auth1.match(/nonce=([^;]+)/)[1];
      const nonce2 = auth2.match(/nonce=([^;]+)/)[1];

      // Verify nonces are different (UUIDs should be unique)
      assert.notStrictEqual(nonce1, nonce2, 'Each request should have unique nonce');
    });

    it('should include timestamp in correct format', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        text: sinon.stub().resolves(JSON.stringify({ httpStatus: 201 })),
      };
      ffetchStub.resolves(mockResponse);

      await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys: ['tag1'] });

      const authHeader = ffetchStub.firstCall.args[1].headers.Authorization;
      const timestampMatch = authHeader.match(/timestamp=([^;]+)/);

      assert(timestampMatch, 'Should include timestamp');

      // Timestamp should be in format: YYYYMMDDTHH:mm:ss+0000
      const timestamp = timestampMatch[1];
      assert(timestamp.match(/^\d{8}T\d{2}:\d{2}:\d{2}\+0000$/), 'Timestamp should match Akamai format');
    });

    it('should include site identifier in logs', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        text: sinon.stub().resolves(JSON.stringify({ httpStatus: 201 })),
      };
      ffetchStub.resolves(mockResponse);

      await AkamaiPurgeClient.purge(ctx, purgeConfig, { keys: ['tag1'] });

      // Verify logs include site ID
      const logCalls = ctx.log.info.getCalls();
      const hasCorrectSiteId = logCalls.some((call) => call.args[0].includes('akamai-site/us/en'));
      assert(hasCorrectSiteId, 'Logs should include site identifier');
    });
  });

  describe('sendPurgeRequest', () => {
    let ctx;
    let purgeConfig;

    beforeEach(() => {
      ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        config: {
          siteKey: 'test',
          storeCode: 'us',
          storeViewCode: 'en',
        },
      });

      purgeConfig = {
        endpoint: 'akaa-test.purge.akamaiapis.net',
        clientSecret: 'secret',
        clientToken: 'token',
        accessToken: 'access',
      };
    });

    it('should support purging by tag type', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        text: sinon.stub().resolves(JSON.stringify({ httpStatus: 201 })),
      };
      ffetchStub.resolves(mockResponse);

      // Test tag purging
      await AkamaiPurgeClient.sendPurgeRequest(ctx, purgeConfig, 'tag', ['tag1', 'tag2']);

      const url = ffetchStub.firstCall.args[0];
      assert(url.includes('/delete/tag/production'), 'Should use tag endpoint');
    });

    it('should support purging by URL type', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        text: sinon.stub().resolves(JSON.stringify({ httpStatus: 201 })),
      };
      ffetchStub.resolves(mockResponse);

      // Test URL purging
      await AkamaiPurgeClient.sendPurgeRequest(ctx, purgeConfig, 'url', ['https://example.com/page1']);

      const url = ffetchStub.firstCall.args[0];
      assert(url.includes('/delete/url/production'), 'Should use URL endpoint');
    });
  });
});
