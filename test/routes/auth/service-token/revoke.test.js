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
import esmock from 'esmock';
import { DEFAULT_CONTEXT, SUPERUSER_CONTEXT, createAuthInfoMock } from '../../../fixtures/context.js';

describe('routes/auth/service-token/revoke tests', () => {
  let handler;

  beforeEach(async () => {
    handler = await esmock('../../../../src/routes/auth/service-token/revoke.js', {
      '../../../../src/utils/jwt.js': {
        verifyToken: async (ctx, token) => {
          if (token === 'valid-service-token') {
            return {
              type: 'service_token',
              permissions: ['catalog:read'],
              org: 'org',
              site: 'site',
              exp: Math.floor(Date.now() / 1000) + 3600,
            };
          }
          if (token === 'user-jwt-token') {
            return {
              email: 'user@example.com',
              roles: ['user'],
              org: 'org',
              site: 'site',
              exp: Math.floor(Date.now() / 1000) + 3600,
            };
          }
          if (token === 'other-org-token') {
            return {
              type: 'service_token',
              permissions: ['catalog:read'],
              org: 'otherorg',
              site: 'othersite',
              exp: Math.floor(Date.now() / 1000) + 3600,
            };
          }
          throw new Error('invalid token');
        },
      },
      '../../../../src/utils/auth.js': {
        revokeServiceToken: async () => true,
      },
    });
  });

  it('should reject unauthenticated requests', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { token: 'valid-service-token' },
    });
    await assert.rejects(
      () => handler.default(ctx),
      (err) => err.response?.status === 403,
    );
  });

  it('should reject requests without service_token:write permission', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { token: 'valid-service-token' },
      authInfo: createAuthInfoMock(['catalog:read']),
    });
    await assert.rejects(
      () => handler.default(ctx),
      (err) => err.response?.status === 403,
    );
  });

  it('should reject requests from service tokens', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { token: 'valid-service-token' },
      authInfo: createAuthInfoMock(
        ['service_token:write'],
        null,
        { isServiceToken: true },
      ),
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 403);
    assert.equal(resp.headers.get('x-error'), 'service tokens cannot revoke service tokens');
  });

  it('should reject missing token', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: {},
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'token is required');
  });

  it('should reject invalid/expired token', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { token: 'invalid-token' },
      env: { JWT_SECRET: 'test' },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'invalid or expired token');
  });

  it('should reject non-service tokens', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { token: 'user-jwt-token' },
      env: { JWT_SECRET: 'test' },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'token is not a service token');
  });

  it('should reject tokens from other org/site', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { token: 'other-org-token' },
      env: { JWT_SECRET: 'test' },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 403);
    assert.equal(resp.headers.get('x-error'), 'token does not belong to this org/site');
  });

  it('should revoke a valid service token', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { token: 'valid-service-token' },
      env: { JWT_SECRET: 'test' },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 204);
  });
});
