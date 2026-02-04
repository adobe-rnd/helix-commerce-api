/*
 * Copyright 2026 Adobe. All rights reserved.
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
import configHandler from '../../../src/routes/config/handler.js';
import { DEFAULT_CONTEXT, createAuthInfoMock } from '../../fixtures/context.js';

describe('Config Handler Tests', () => {
  let configsBucketStub;

  beforeEach(() => {
    configsBucketStub = {
      get: sinon.stub(),
      put: sinon.stub(),
      delete: sinon.stub(),
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('GET /config', () => {
    it('should return 200 with config when it exists', async () => {
      const mockConfig = {
        authEnabled: true,
        otpEmailSender: 'test@example.com',
        otpEmailSubject: 'Your OTP Code',
        otpEmailBodyTemplate: 'Your code is {{code}}',
      };

      configsBucketStub.get.resolves({
        json: sinon.stub().resolves(mockConfig),
      });

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:read']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'GET',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Type'), 'application/json');

      const responseBody = await response.json();
      assert.deepStrictEqual(responseBody, mockConfig);

      assert(configsBucketStub.get.calledOnceWith('myorg/mysite/config.json'));
    });

    it('should return 404 when config does not exist', async () => {
      configsBucketStub.get.resolves(null);

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:read']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'GET',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 404);
      assert.equal(response.headers.get('x-error'), 'Config not found');
    });

    it('should require config:read permission', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock([]), // No permissions
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'GET',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown authorization error');
      } catch (error) {
        assert.ok(error.response, 'Should throw ResponseError');
        assert.equal(error.response.status, 403);
      }
    });

    it('should require matching org/site', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:read']),
        requestInfo: {
          org: 'different-org',
          site: 'different-site',
          method: 'GET',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      // Override assertOrgSite to reject
      ctx.authInfo.assertOrgSite = (org, site) => {
        if (org !== 'myorg' || site !== 'mysite') {
          const error = new Error('access denied');
          error.response = new Response('', { status: 403 });
          throw error;
        }
      };

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown authorization error');
      } catch (error) {
        assert.equal(error.response.status, 403);
      }
    });
  });

  describe('POST /config', () => {
    it('should return 200 and save valid config', async () => {
      const validConfig = {
        authEnabled: true,
        otpEmailSender: 'noreply@example.com',
        otpEmailSubject: 'Your OTP Code',
        otpEmailBodyTemplate: 'Your code is {{code}}',
      };

      configsBucketStub.put.resolves();

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: validConfig,
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Type'), 'application/json');

      const responseBody = await response.json();
      assert.deepStrictEqual(responseBody, validConfig);

      assert(configsBucketStub.put.calledOnce);
      const [key, value] = configsBucketStub.put.firstCall.args;
      assert.equal(key, 'myorg/mysite/config.json');
      assert.deepStrictEqual(JSON.parse(value), validConfig);
    });

    it('should accept config with only some fields', async () => {
      const partialConfig = {
        authEnabled: false,
      };

      configsBucketStub.put.resolves();

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: partialConfig,
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 200);
      const responseBody = await response.json();
      assert.deepStrictEqual(responseBody, partialConfig);
    });

    it('should return 400 for invalid config - extra properties', async () => {
      const invalidConfig = {
        authEnabled: true,
        unknownField: 'value',
      };

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: invalidConfig,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error.response, 'Should throw ResponseError');
        assert.equal(error.response.status, 400);
        assert.equal(error.response.headers.get('x-error'), 'Invalid config');
      }
    });

    it('should return 400 for invalid config - wrong type', async () => {
      const invalidConfig = {
        authEnabled: 'not-a-boolean',
      };

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: invalidConfig,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error.response, 'Should throw ResponseError');
        assert.equal(error.response.status, 400);
      }
    });

    it('should return 400 for invalid email format', async () => {
      const invalidConfig = {
        otpEmailSender: 'not-an-email',
      };

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: invalidConfig,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error.response, 'Should throw ResponseError');
        assert.equal(error.response.status, 400);
      }
    });

    it('should return 400 for fields exceeding max length', async () => {
      const invalidConfig = {
        otpEmailSubject: 'x'.repeat(256), // Max is 255
      };

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: invalidConfig,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error.response, 'Should throw ResponseError');
        assert.equal(error.response.status, 400);
      }
    });

    it('should return 500 when R2 put operation fails', async () => {
      configsBucketStub.put.rejects(new Error('R2 error'));

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: { authEnabled: true },
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 500);
      assert.equal(response.headers.get('x-error'), 'Error updating config');
      assert(ctx.log.error.calledOnce);
    });

    it('should require config:write permission', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:read']), // Wrong permission
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: { authEnabled: true },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown authorization error');
      } catch (error) {
        assert.ok(error.response, 'Should throw ResponseError');
        assert.equal(error.response.status, 403);
      }
    });

    it('should require matching org/site', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'different-org',
          site: 'different-site',
          method: 'POST',
        },
        data: { authEnabled: true },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      // Override assertOrgSite to reject
      ctx.authInfo.assertOrgSite = (org, site) => {
        if (org !== 'myorg' || site !== 'mysite') {
          const error = new Error('access denied');
          error.response = new Response('', { status: 403 });
          throw error;
        }
      };

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown authorization error');
      } catch (error) {
        assert.equal(error.response.status, 403);
      }
    });
  });

  describe('DELETE /config', () => {
    it('should return 204 when config is successfully deleted', async () => {
      configsBucketStub.delete.resolves();

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'DELETE',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 204);

      assert(configsBucketStub.delete.calledOnceWith('myorg/mysite/config.json'));
    });

    it('should return 500 when R2 delete operation fails', async () => {
      configsBucketStub.delete.rejects(new Error('R2 delete error'));

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'DELETE',
        },
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 500);
      assert.equal(response.headers.get('x-error'), 'Error removing config');
      assert(ctx.log.error.calledOnce);
    });

    it('should require config:write permission', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:read']), // Wrong permission
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'DELETE',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown authorization error');
      } catch (error) {
        assert.ok(error.response, 'Should throw ResponseError');
        assert.equal(error.response.status, 403);
      }
    });

    it('should require matching org/site', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'different-org',
          site: 'different-site',
          method: 'DELETE',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      // Override assertOrgSite to reject
      ctx.authInfo.assertOrgSite = (org, site) => {
        if (org !== 'myorg' || site !== 'mysite') {
          const error = new Error('access denied');
          error.response = new Response('', { status: 403 });
          throw error;
        }
      };

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown authorization error');
      } catch (error) {
        assert.equal(error.response.status, 403);
      }
    });
  });

  describe('Invalid HTTP Methods', () => {
    it('should return 405 for PUT method', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'PUT',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 405 for PATCH method', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'PATCH',
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-error'), 'method not allowed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty config object', async () => {
      configsBucketStub.put.resolves();

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: {},
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 200);
      const responseBody = await response.json();
      assert.deepStrictEqual(responseBody, {});
    });

    it('should handle all valid config fields', async () => {
      const fullConfig = {
        authEnabled: true,
        otpEmailSender: 'noreply@example.com',
        otpEmailSubject: 'Your One-Time Password',
        otpEmailBodyTemplate: 'Hello {{name}}, your code is {{code}}. Valid for 10 minutes.',
        otpEmailBodyUrl: 'https://example.com/otp-template.html',
      };

      configsBucketStub.put.resolves();

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: fullConfig,
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 200);
      const responseBody = await response.json();
      assert.deepStrictEqual(responseBody, fullConfig);
    });

    it('should handle config with max length body template', async () => {
      const config = {
        otpEmailBodyTemplate: 'x'.repeat(1024 * 100), // Max allowed
      };

      configsBucketStub.put.resolves();

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: config,
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      const response = await configHandler(ctx);

      assert.equal(response.status, 200);
    });

    it('should reject config with body template exceeding max length', async () => {
      const config = {
        otpEmailBodyTemplate: 'x'.repeat(1024 * 100 + 1), // Over max
      };

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['config:write']),
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          method: 'POST',
        },
        data: config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        env: {
          CONFIGS_BUCKET: configsBucketStub,
        },
      });

      try {
        await configHandler(ctx);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error.response, 'Should throw ResponseError');
        assert.equal(error.response.status, 400);
      }
    });
  });
});
