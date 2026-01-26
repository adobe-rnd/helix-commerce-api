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

// @ts-nocheck

import assert from 'node:assert';
import sinon from 'sinon';
import esmock from 'esmock';
import { DEFAULT_CONTEXT } from '../fixtures/context.js';

describe('config tests', () => {
  describe('fetchHelixConfig', () => {
    let fetchHelixConfig;
    let ffetchStub;

    beforeEach(async () => {
      // Mock ffetch
      ffetchStub = sinon.stub();

      const module = await esmock('../../src/utils/config.js', {
        '../../src/utils/http.js': {
          ffetch: ffetchStub,
        },
      });

      fetchHelixConfig = module.fetchHelixConfig;
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should fetch and return valid helix config', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          warn: sinon.stub(),
        },
        env: {
          HLX_CONFIG_SERVICE_TOKEN: 'test-token-xyz',
        },
      });

      // Mock successful config response
      const mockConfig = {
        cdn: {
          prod: { type: 'fastly', host: 'example.com' },
        },
        content: { contentBusId: 'bus-123' },
        legacy: false,
      };

      ffetchStub.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves(mockConfig),
      });

      const config = await fetchHelixConfig(ctx, 'myorg', 'mysite');

      // Verify correct URL was fetched
      const url = ffetchStub.firstCall.args[0];
      assert.strictEqual(url, 'https://config.aem.page/main--mysite--myorg/config.json?scope=raw');

      // Verify headers
      const options = ffetchStub.firstCall.args[1];
      assert.strictEqual(options.headers['x-access-token'], 'test-token-xyz');
      assert.strictEqual(options.headers['cache-control'], 'no-cache');
      assert.strictEqual(options.headers['x-backend-type'], 'aws');

      // Verify config was returned
      assert.deepStrictEqual(config, mockConfig);

      // Verify info logging
      assert(ctx.log.info.calledWith(sinon.match(/loaded config from/)));
    });

    it('should return null for legacy config', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          warn: sinon.stub(),
        },
        env: {
          HLX_CONFIG_SERVICE_TOKEN: 'token',
        },
      });

      // Mock legacy config (legacy: true)
      ffetchStub.resolves({
        ok: true,
        status: 200,
        json: sinon.stub().resolves({ legacy: true }),
      });

      const config = await fetchHelixConfig(ctx, 'org', 'site');

      // Should return null for legacy configs
      assert.strictEqual(config, null);
    });

    it('should return null when config is not found (404)', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          warn: sinon.stub(),
        },
        env: {
          HLX_CONFIG_SERVICE_TOKEN: 'token',
        },
      });

      // Mock 404 response
      ffetchStub.resolves({
        ok: false,
        status: 404,
      });

      const config = await fetchHelixConfig(ctx, 'org', 'site');

      // Should return null for 404
      assert.strictEqual(config, null);

      // Should not log warning for 404
      assert(ctx.log.warn.notCalled);
    });

    it('should log warning and return null for non-404 errors', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          warn: sinon.stub(),
        },
        env: {
          HLX_CONFIG_SERVICE_TOKEN: 'token',
        },
      });

      // Mock 500 error
      ffetchStub.resolves({
        ok: false,
        status: 500,
      });

      const config = await fetchHelixConfig(ctx, 'org', 'site');

      // Should return null
      assert.strictEqual(config, null);

      // Should log warning for non-404 errors
      assert(ctx.log.warn.calledWith(sinon.match(/error loading config/)));
      assert(ctx.log.warn.calledWith(sinon.match(/500/)));
    });

    it('should throw ResponseError when fetch fails', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: {
          info: sinon.stub(),
          warn: sinon.stub(),
        },
        env: {
          HLX_CONFIG_SERVICE_TOKEN: 'token',
        },
      });

      // Mock network error
      ffetchStub.rejects(new Error('Network timeout'));

      // Should throw with ResponseError
      let thrownError;
      try {
        await fetchHelixConfig(ctx, 'org', 'site');
      } catch (err) {
        thrownError = err;
      }

      assert(thrownError);
      assert(thrownError.message.includes('Fetching config'));
      assert(thrownError.message.includes('failed'));
      assert(thrownError.response);
      assert.strictEqual(thrownError.response.status, 502);
    });
  });
});
