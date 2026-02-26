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

describe('routes/auth/service-token/create tests', () => {
  let handler;

  beforeEach(async () => {
    handler = await esmock('../../../../src/routes/auth/service-token/create.js', {
      '../../../../src/utils/jwt.js': {
        createServiceToken: async () => 'mock-service-token-jwt',
      },
    });
  });

  it('should reject unauthenticated requests', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { permissions: ['catalog:read'], ttl: 3600 },
    });
    await assert.rejects(
      () => handler.default(ctx),
      (err) => err.response?.status === 403,
    );
  });

  it('should reject requests without service_token:create permission', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { permissions: ['catalog:read'], ttl: 3600 },
      authInfo: createAuthInfoMock(['catalog:read', 'catalog:write']),
    });
    await assert.rejects(
      () => handler.default(ctx),
      (err) => err.response?.status === 403,
    );
  });

  it('should reject requests from service tokens', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { permissions: ['catalog:read'], ttl: 3600 },
      authInfo: createAuthInfoMock(
        ['service_token:create'],
        null,
        { isServiceToken: true },
      ),
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 403);
    assert.equal(resp.headers.get('x-error'), 'service tokens cannot create service tokens');
  });

  it('should reject empty permissions array', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: [], ttl: 3600 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'permissions must be a non-empty array');
  });

  it('should reject non-array permissions', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: 'catalog:read', ttl: 3600 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'permissions must be a non-empty array');
  });

  it('should reject missing ttl', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['catalog:read'] },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'ttl must be a positive integer (seconds)');
  });

  it('should reject zero ttl', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['catalog:read'], ttl: 0 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'ttl must be a positive integer (seconds)');
  });

  it('should reject negative ttl', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['catalog:read'], ttl: -100 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'ttl must be a positive integer (seconds)');
  });

  it('should reject ttl exceeding maximum', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['catalog:read'], ttl: 365 * 24 * 60 * 60 + 1 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.ok(resp.headers.get('x-error').includes('ttl exceeds maximum'));
  });

  it('should reject disallowed permissions', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['admins:write'], ttl: 3600 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.ok(resp.headers.get('x-error').includes('permission not allowed'));
  });

  it('should reject service_token:create in delegated permissions', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['service_token:create'], ttl: 3600 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.ok(resp.headers.get('x-error').includes('permission not allowed'));
  });

  it('should reject email scopes without base emails:send permission', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['emails:send:user@example.com'], ttl: 3600 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'emails:send permission required when email scopes are defined');
  });

  it('should reject invalid email scope patterns', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['emails:send', 'emails:send:not-an-email'], ttl: 3600 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.ok(resp.headers.get('x-error').includes('invalid email scope pattern'));
  });

  it('should reject invalid wildcard scope patterns', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['emails:send', 'emails:send:*@*'], ttl: 3600 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.ok(resp.headers.get('x-error').includes('invalid email scope pattern'));
  });

  it('should create service token with valid permissions', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: { permissions: ['catalog:read', 'catalog:write'], ttl: 3600 },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 201);
    const body = await resp.json();
    assert.equal(body.token, 'mock-service-token-jwt');
    assert.equal(body.ttl, 3600);
  });

  it('should create service token with email permissions and scopes', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: {
        permissions: ['emails:send', 'emails:send:*@example.com', 'emails:send:foo@bar.com'],
        ttl: 86400,
      },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 201);
    const body = await resp.json();
    assert.equal(body.token, 'mock-service-token-jwt');
    assert.equal(body.ttl, 86400);
  });

  it('should accept wildcard email scope', async () => {
    const ctx = SUPERUSER_CONTEXT({
      data: {
        permissions: ['emails:send', 'emails:send:*@newsletter.example.com'],
        ttl: 3600,
      },
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 201);
  });
});
