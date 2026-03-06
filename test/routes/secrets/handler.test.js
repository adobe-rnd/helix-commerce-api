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
import secretsHandler from '../../../src/routes/secrets/handler.js';
import { DEFAULT_CONTEXT, createAuthInfoMock, TEST_SECRETS_PK } from '../../fixtures/context.js';
import { deriveKey, decrypt } from '../../../src/utils/encryption.js';

const validPayload = {
  merchantId: 'merchant-123',
  apiKey: 'key-abc',
  apiSecret: 'secret-xyz',
  environment: 'sandbox',
};

function makeCtx(overrides = {}) {
  const secretsBucketStub = {
    put: sinon.stub().resolves(),
    get: sinon.stub().resolves(null),
    ...(overrides.secretsBucket ?? {}),
  };

  return DEFAULT_CONTEXT({
    requestInfo: {
      org: 'myorg',
      site: 'mysite',
      method: 'PUT',
      path: '/payments-chase.json',
      ...(overrides.requestInfo ?? {}),
    },
    authInfo: overrides.authInfo ?? createAuthInfoMock(['secrets:write']),
    data: overrides.data ?? validPayload,
    env: {
      SECRETS_BUCKET: secretsBucketStub,
      SECRETS_PK: TEST_SECRETS_PK,
      ...(overrides.env ?? {}),
    },
    log: {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      ...(overrides.log ?? {}),
    },
  });
}

describe('Secrets Handler Tests', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const ctx = makeCtx({
        authInfo: createAuthInfoMock([]),
      });

      try {
        await secretsHandler(ctx);
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error.response);
        assert.strictEqual(error.response.status, 401);
      }
    });

    it('should reject unauthorized requests with 403', async () => {
      const ctx = makeCtx({
        authInfo: createAuthInfoMock(['catalog:read']),
      });

      try {
        await secretsHandler(ctx);
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error.response);
        assert.strictEqual(error.response.status, 403);
      }
    });

    it('should reject service tokens with 403', async () => {
      const ctx = makeCtx({
        authInfo: createAuthInfoMock(['secrets:write'], null, { isServiceToken: true }),
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.headers.get('x-error'), 'service tokens cannot write secrets');
    });
  });

  describe('Method validation', () => {
    it('should reject GET requests with 405', async () => {
      const ctx = makeCtx({
        requestInfo: { method: 'GET', path: '/payments-chase.json' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 405);
    });

    it('should reject POST requests with 405', async () => {
      const ctx = makeCtx({
        requestInfo: { method: 'POST', path: '/payments-chase.json' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 405);
    });

    it('should reject DELETE requests with 405', async () => {
      const ctx = makeCtx({
        requestInfo: { method: 'DELETE', path: '/payments-chase.json' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 405);
    });
  });

  describe('Path validation', () => {
    it('should reject paths not ending with .json', async () => {
      const ctx = makeCtx({
        requestInfo: { method: 'PUT', path: '/payments-chase' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'path must end with .json');
    });

    it('should reject paths with directory traversal', async () => {
      const ctx = makeCtx({
        requestInfo: { method: 'PUT', path: '/../payments-chase.json' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 400);
    });

    it('should reject unknown secret store IDs', async () => {
      const ctx = makeCtx({
        requestInfo: { method: 'PUT', path: '/unknown-store.json' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 404);
      assert.ok(response.headers.get('x-error').includes('unknown secret store'));
    });
  });

  describe('Payload validation', () => {
    it('should reject invalid payload', async () => {
      const ctx = makeCtx({
        data: {
          merchantId: 123, apiKey: 'key', apiSecret: 'secret', environment: 'sandbox',
        },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'invalid payload');
    });

    it('should reject payload with extra properties', async () => {
      const ctx = makeCtx({
        data: { ...validPayload, extraProp: 'not-allowed' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 400);
    });

    it('should reject payload missing required fields', async () => {
      const ctx = makeCtx({
        data: { merchantId: 'merchant-123' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 400);
    });

    it('should reject invalid environment value', async () => {
      const ctx = makeCtx({
        data: { ...validPayload, environment: 'staging' },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 400);
    });
  });

  describe('PUT /:org/sites/:site/secrets/:path', () => {
    it('should encrypt and store a valid secret at root path', async () => {
      const ctx = makeCtx();

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 204);

      const { put } = ctx.env.SECRETS_BUCKET;
      assert.ok(put.calledOnce);
      const [storageKey, encrypted] = put.firstCall.args;
      assert.strictEqual(storageKey, 'myorg/mysite/secrets/payments-chase.json');
      assert.ok(encrypted.startsWith('v1:'), 'should be versioned');
    });

    it('should encrypt and store a valid secret at locale path', async () => {
      const ctx = makeCtx({
        requestInfo: {
          method: 'PUT',
          path: '/en/us/payments-chase.json',
        },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 204);

      const { put } = ctx.env.SECRETS_BUCKET;
      assert.ok(put.calledOnce);
      const [storageKey] = put.firstCall.args;
      assert.strictEqual(storageKey, 'myorg/mysite/secrets/en/us/payments-chase.json');
    });

    it('stored data should be decryptable back to the original payload', async () => {
      const ctx = makeCtx();

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 204);

      const [, encrypted] = ctx.env.SECRETS_BUCKET.put.firstCall.args;
      const key = await deriveKey(TEST_SECRETS_PK, 'myorg', 'mysite');
      const plaintext = await decrypt(key, encrypted);
      assert.deepStrictEqual(JSON.parse(plaintext), validPayload);
    });

    it('should return 500 when bucket put fails', async () => {
      const ctx = makeCtx({
        secretsBucket: {
          put: sinon.stub().rejects(new Error('R2 error')),
        },
      });

      const response = await secretsHandler(ctx);
      assert.strictEqual(response.status, 500);
      assert.strictEqual(response.headers.get('x-error'), 'error writing secret');
    });
  });
});
