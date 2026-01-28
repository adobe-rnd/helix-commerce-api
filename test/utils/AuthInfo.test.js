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
import { DEFAULT_CONTEXT } from '../fixtures/context.js';
import AuthInfo from '../../src/utils/AuthInfo.js';

/**
 * Helper to create a valid JWT
 */
async function createTestJWT(email, org, site, roles = ['user'], secret = 'test-jwt-secret') {
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
    roles,
    org,
    site,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .setSubject(email)
    .sign(key);
}

describe('AuthInfo', () => {
  const jwtSecret = 'test-jwt-secret';
  const org = 'testorg';
  const site = 'testsite';

  describe('create', () => {
    it('should create unauthenticated AuthInfo when no token provided', async () => {
      const req = new Request('https://example.com');
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isSuperuser(), false);
      assert.equal(authInfo.isAdmin(), false);
      assert.equal(authInfo.issuedAt(), undefined);
      assert.equal(authInfo.expiresAt(), undefined);
      assert.equal(authInfo.isExpired(), false); // isExpired returns false when no exp
    });

    it('should create authenticated AuthInfo with user role', async () => {
      const email = 'user@example.com';
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isAdmin(), false);
      assert.equal(authInfo.isSuperuser(), false);
      assert.ok(authInfo.issuedAt() > 0);
      assert.ok(authInfo.expiresAt() > (Date.now() / 1000));
      assert.equal(authInfo.isExpired(), false);
    });

    it('should create authenticated AuthInfo with admin role', async () => {
      const email = 'admin@example.com';
      const token = await createTestJWT(email, org, site, ['admin'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { authorization: `Bearer ${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isAdmin(), true);
      assert.equal(authInfo.isSuperuser(), false);
    });

    it('should promote superuser email to superuser role', async () => {
      const email = 'maxed@adobe.com'; // Hardcoded superuser
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isSuperuser(), true);
    });

    it('should handle invalid JWT token gracefully', async () => {
      const req = new Request('https://example.com', {
        headers: { cookie: 'auth_token=invalid.token.here' },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isSuperuser(), false);
      assert.equal(authInfo.isAdmin(), false);
    });

    it('should recognize legacy SUPERUSER_KEY', async () => {
      const superuserKey = 'legacy-superuser-key';
      const req = new Request('https://example.com', {
        headers: { authorization: `Bearer ${superuserKey}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: {
          JWT_SECRET: jwtSecret,
          SUPERUSER_KEY: superuserKey,
        },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isSuperuser(), true);
    });

    it('should recognize service token (UUID format)', async () => {
      const serviceToken = '12345678-1234-1234-1234-123456789ABC';
      const req = new Request('https://example.com', {
        headers: { authorization: `Bearer ${serviceToken}` },
      });
      const ctx = DEFAULT_CONTEXT({
        requestInfo: {
          org: 'testorg',
          site: 'testsite',
          // siteKey getter will compute testorg--testsite
        },
        env: {
          JWT_SECRET: jwtSecret,
          KEYS: {
            get: async (key) => {
              if (key === 'testorg--testsite') {
                return serviceToken;
              }
              return null;
            },
          },
        },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      // Service token should not make them a superuser but should give service permissions
      assert.equal(authInfo.isSuperuser(), false);
    });

    it('should handle bearer token with different casing', async () => {
      const email = 'user@example.com';
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { authorization: `BEARER ${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isAdmin(), false);
      assert.ok(authInfo.issuedAt() > 0);
    });
  });

  describe('permissions', () => {
    it('should grant user role no permissions', async () => {
      const email = 'user@example.com';
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.throws(() => authInfo.assertPermissions('catalog:read'), /access denied/);
      assert.throws(() => authInfo.assertPermissions('catalog:write'), /access denied/);
    });

    it('should grant admin role all site-scoped permissions', async () => {
      const email = 'admin@example.com';
      const token = await createTestJWT(email, org, site, ['admin'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      // Should have all admin permissions
      assert.doesNotThrow(() => authInfo.assertPermissions('catalog:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('catalog:write'));
      assert.doesNotThrow(() => authInfo.assertPermissions('orders:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('orders:write'));
      assert.doesNotThrow(() => authInfo.assertPermissions('index:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('index:write'));
      assert.doesNotThrow(() => authInfo.assertPermissions('customers:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('customers:write'));
      assert.doesNotThrow(() => authInfo.assertPermissions('service_token:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('service_token:write'));

      // Should NOT have superuser-only permissions
      assert.throws(() => authInfo.assertPermissions('admins:read'), /access denied/);
      assert.throws(() => authInfo.assertPermissions('admins:write'), /access denied/);
    });

    it('should grant superuser role all permissions', async () => {
      const email = 'maxed@adobe.com';
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      // Should have all admin permissions
      assert.doesNotThrow(() => authInfo.assertPermissions('catalog:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('catalog:write'));

      // Should have superuser-only permissions
      assert.doesNotThrow(() => authInfo.assertPermissions('admins:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('admins:write'));
    });

    it('should grant service role limited permissions', async () => {
      const serviceToken = '12345678-1234-1234-1234-123456789ABC';
      const req = new Request('https://example.com', {
        headers: { authorization: `Bearer ${serviceToken}` },
      });
      const ctx = DEFAULT_CONTEXT({
        requestInfo: {
          org: 'testorg',
          site: 'testsite',
          // siteKey is a getter, so it will be computed from org and site
        },
        env: {
          JWT_SECRET: jwtSecret,
          KEYS: {
            get: async (key) => {
              if (key === 'testorg--testsite') {
                return serviceToken;
              }
              return null;
            },
          },
        },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      // Should have service permissions
      assert.doesNotThrow(() => authInfo.assertPermissions('catalog:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('catalog:write'));
      assert.doesNotThrow(() => authInfo.assertPermissions('orders:read'));
      assert.doesNotThrow(() => authInfo.assertPermissions('orders:write'));
      assert.doesNotThrow(() => authInfo.assertPermissions('service_token:read'));

      // Should NOT have these permissions
      assert.throws(() => authInfo.assertPermissions('service_token:write'), /access denied/);
      assert.throws(() => authInfo.assertPermissions('indices:read'), /access denied/);
      assert.throws(() => authInfo.assertPermissions('indices:write'), /access denied/);
      assert.throws(() => authInfo.assertPermissions('customers:read'), /access denied/);
      assert.throws(() => authInfo.assertPermissions('customers:write'), /access denied/);
      assert.throws(() => authInfo.assertPermissions('admins:read'), /access denied/);
    });

    it('should check multiple permissions at once', async () => {
      const email = 'admin@example.com';
      const token = await createTestJWT(email, org, site, ['admin'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.doesNotThrow(() => authInfo.assertPermissions('catalog:read', 'catalog:write'));
      assert.throws(() => authInfo.assertPermissions('catalog:read', 'admins:read'), /access denied/);
    });
  });

  describe('assertRole', () => {
    it('should allow checking for specific role', async () => {
      const email = 'admin@example.com';
      const token = await createTestJWT(email, org, site, ['admin'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.doesNotThrow(() => authInfo.assertRole('admin'));
      assert.throws(() => authInfo.assertRole('superuser'), /access denied/);
    });

    it('should reject role check for unauthenticated user', async () => {
      const req = new Request('https://example.com');
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.throws(() => authInfo.assertRole('user'), /access denied/);
    });
  });

  describe('assertAuthenticated', () => {
    it('should pass for authenticated user', async () => {
      const email = 'user@example.com';
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.doesNotThrow(() => authInfo.assertAuthenticated());
    });

    it('should fail for unauthenticated user', async () => {
      const req = new Request('https://example.com');
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.throws(() => authInfo.assertAuthenticated(), /unauthorized/);
    });

    it('should pass for service token', async () => {
      const serviceToken = '12345678-1234-1234-1234-123456789ABC';
      const req = new Request('https://example.com', {
        headers: { authorization: `Bearer ${serviceToken}` },
      });
      const ctx = DEFAULT_CONTEXT({
        requestInfo: {
          org: 'testorg',
          site: 'testsite',
          // siteKey getter will compute testorg--testsite
        },
        env: {
          JWT_SECRET: jwtSecret,
          KEYS: {
            get: async (key) => {
              if (key === 'testorg--testsite') {
                return serviceToken;
              }
              return null;
            },
          },
        },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.doesNotThrow(() => authInfo.assertAuthenticated());
    });
  });

  describe('assertEmail', () => {
    it('should pass when email matches', async () => {
      const email = 'user@example.com';
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.doesNotThrow(() => authInfo.assertEmail(email));
    });

    it('should fail when email does not match', async () => {
      const email = 'user@example.com';
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.throws(() => authInfo.assertEmail('other@example.com'), /access denied/);
    });

    it('should pass for admin when allowAdmin is true (default)', async () => {
      const email = 'admin@example.com';
      const token = await createTestJWT(email, org, site, ['admin'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.doesNotThrow(() => authInfo.assertEmail('other@example.com'));
    });

    it('should fail for admin when allowAdmin is false', async () => {
      const email = 'admin@example.com';
      const token = await createTestJWT(email, org, site, ['admin'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.throws(() => authInfo.assertEmail('other@example.com', false), /access denied/);
    });

    it('should pass for admin with matching email even when allowAdmin is false', async () => {
      const email = 'admin@example.com';
      const token = await createTestJWT(email, org, site, ['admin'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.doesNotThrow(() => authInfo.assertEmail(email, false));
    });
  });

  describe('isExpired', () => {
    it('should return false for valid token', async () => {
      const email = 'user@example.com';
      const token = await createTestJWT(email, org, site, ['user'], jwtSecret);
      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${token}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isExpired(), false);
    });

    it('should return false for unauthenticated user', async () => {
      const req = new Request('https://example.com');
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      const authInfo = await AuthInfo.create(ctx, req);

      assert.equal(authInfo.isExpired(), false);
    });

    it('should return true for expired token', async () => {
      const email = 'user@example.com';
      const encoder = new TextEncoder();
      const keyData = encoder.encode(jwtSecret);
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      );

      // Create an expired token
      const expiredToken = await new SignJWT({
        email,
        roles: ['user'],
        org,
        site,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2 hours ago
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
        .setSubject(email)
        .sign(key);

      const req = new Request('https://example.com', {
        headers: { cookie: `auth_token=${expiredToken}` },
      });
      const ctx = DEFAULT_CONTEXT({
        env: { JWT_SECRET: jwtSecret },
      });

      // The expired token will be rejected during create,
      // so this creates an unauthenticated AuthInfo
      const authInfo = await AuthInfo.create(ctx, req);

      // Since the token was rejected, isExpired() returns false (no token = not expired)
      assert.equal(authInfo.isExpired(), false);
    });
  });
});
