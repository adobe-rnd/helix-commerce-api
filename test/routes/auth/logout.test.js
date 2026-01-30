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
import { SignJWT } from 'jose';
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';
import handler from '../../../src/routes/auth/logout.js';

/**
 * Helper to create a valid JWT
 */
async function createTestJWT(email, org, site, role = 'user', secret = 'test-jwt-secret') {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

  return new SignJWT({
    email,
    role,
    org,
    site,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .setSubject(email)
    .sign(key);
}

describe('routes/auth logout tests', () => {
  const jwtSecret = 'test-jwt-secret';
  const email = 'test@example.com';
  const org = 'testorg';
  const site = 'testsite';

  it('should return 201 when no token is present', async () => {
    const req = new Request('https://example.com', {
      headers: new Headers(),
    });

    const ctx = DEFAULT_CONTEXT({
      requestInfo: { org, site },
      env: {
        JWT_SECRET: jwtSecret,
      },
    });

    const resp = await handler(ctx, req);
    assert.equal(resp.status, 204);

    const setCookie = resp.headers.get('Set-Cookie');
    assert.ok(setCookie, 'should set cookie');
    assert.ok(setCookie.includes('auth_token='), 'should contain auth_token');
    assert.ok(setCookie.includes('Max-Age=0'), 'should expire cookie');
  });

  it('should return 204 and remove cookie when token is present in cookie', async () => {
    const token = await createTestJWT(email, org, site, 'user', jwtSecret);
    let revokedKey = null;

    const req = new Request('https://example.com', {
      headers: new Headers({
        cookie: `auth_token=${token}`,
      }),
    });

    const ctx = DEFAULT_CONTEXT({
      requestInfo: { org, site },
      env: {
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          put: async (key, value, options) => {
            revokedKey = key;
            assert.equal(value, '');
            assert.ok(options.customMetadata.revokedAt);
          },
        },
      },
    });

    const resp = await handler(ctx, req);
    assert.equal(resp.status, 204);

    // Check cookie was removed
    const setCookie = resp.headers.get('Set-Cookie');
    assert.ok(setCookie.includes('Max-Age=0'), 'should expire cookie');

    // Check token was revoked
    assert.ok(revokedKey, 'should revoke token');
    assert.ok(revokedKey.includes('/revoked-tokens/'));
    assert.ok(revokedKey.includes(token));
  });

  it('should return 204 and remove cookie when token is present in Authorization header', async () => {
    const token = await createTestJWT(email, org, site, 'user', jwtSecret);
    let revokedKey = null;

    const req = new Request('https://example.com', {
      headers: new Headers({
        authorization: `Bearer ${token}`,
      }),
    });

    const ctx = DEFAULT_CONTEXT({
      requestInfo: { org, site },
      env: {
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          put: async (key, value, options) => {
            revokedKey = key;
            assert.equal(value, '');
            assert.ok(options.customMetadata.revokedAt);
          },
        },
      },
    });

    const resp = await handler(ctx, req);
    assert.equal(resp.status, 204);

    // Check cookie was removed
    const setCookie = resp.headers.get('Set-Cookie');
    assert.ok(setCookie.includes('Max-Age=0'), 'should expire cookie');

    // Check token was revoked
    assert.ok(revokedKey, 'should revoke token');
    assert.ok(revokedKey.includes('/revoked-tokens/'));
  });

  it('should return 204 and remove cookie when token is invalid', async () => {
    const invalidToken = 'invalid.token.here';
    let putCalled = false;

    const req = new Request('https://example.com', {
      headers: new Headers({
        cookie: `auth_token=${invalidToken}`,
      }),
    });

    const ctx = DEFAULT_CONTEXT({
      requestInfo: { org, site },
      env: {
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          put: async () => {
            putCalled = true;
          },
        },
      },
    });

    const resp = await handler(ctx, req);
    assert.equal(resp.status, 204);

    // Check cookie was removed
    const setCookie = resp.headers.get('Set-Cookie');
    assert.ok(setCookie.includes('Max-Age=0'), 'should expire cookie');

    // Check token was NOT revoked (because it's invalid)
    assert.equal(putCalled, false, 'should not revoke invalid token');
  });

  it('should return 204 and remove cookie when token is expired', async () => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(jwtSecret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );

    // Create an expired token (expired 1 hour ago)
    const expiredToken = await new SignJWT({
      email,
      role: 'user',
      org,
      site,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2 hours ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
      .setSubject(email)
      .sign(key);

    let putCalled = false;

    const req = new Request('https://example.com', {
      headers: new Headers({
        cookie: `auth_token=${expiredToken}`,
      }),
    });

    const ctx = DEFAULT_CONTEXT({
      requestInfo: { org, site },
      env: {
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          put: async () => {
            putCalled = true;
          },
        },
      },
    });

    const resp = await handler(ctx, req);
    assert.equal(resp.status, 204);

    // Check cookie was removed
    const setCookie = resp.headers.get('Set-Cookie');
    assert.ok(setCookie.includes('Max-Age=0'), 'should expire cookie');

    // Check token was NOT revoked (because it's expired)
    assert.equal(putCalled, false, 'should not revoke expired token');
  });

  it('should use correct key format for revoked tokens', async () => {
    const token = await createTestJWT(email, 'myorg', 'mysite', 'user', jwtSecret);
    let capturedKey = null;

    const req = new Request('https://example.com', {
      headers: new Headers({
        cookie: `auth_token=${token}`,
      }),
    });

    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        org: 'myorg',
        site: 'mysite',
      },
      env: {
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          put: async (key) => {
            capturedKey = key;
          },
        },
      },
    });

    await handler(ctx, req);

    assert.equal(capturedKey, `myorg/mysite/revoked-tokens/${token}`);
  });

  it('should handle AUTH_BUCKET.put failure gracefully', async () => {
    const token = await createTestJWT(email, org, site, 'user', jwtSecret);

    const req = new Request('https://example.com', {
      headers: new Headers({
        cookie: `auth_token=${token}`,
      }),
    });

    const ctx = DEFAULT_CONTEXT({
      requestInfo: { org, site },
      env: {
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          put: async () => {
            throw new Error('Storage failure');
          },
        },
      },
    });

    const resp = await handler(ctx, req);
    assert.equal(resp.status, 204);

    // Cookie should still be removed even if revocation fails
    const setCookie = resp.headers.get('Set-Cookie');
    assert.ok(setCookie.includes('Max-Age=0'), 'should expire cookie');
  });
});
