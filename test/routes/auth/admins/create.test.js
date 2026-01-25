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
import { DEFAULT_CONTEXT, SUPERUSER_CONTEXT } from '../../../fixtures/context.js';
import handler from '../../../../src/routes/auth/admins/create.js';

describe('routes/auth/admins create tests', () => {
  it('should reject non-superuser requests', async () => {
    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        variables: { email: 'admin@example.com' },
      },
      env: {
        KEYS: {
          get: async () => 'test-key',
        },
      },
    });

    let error;
    try {
      await handler(ctx);
    } catch (e) {
      error = e;
    }

    assert.ok(error);
    assert.equal(error.response.status, 404);
    assert.equal(error.response.headers.get('x-error'), 'not found');
  });

  it('should return 400 when email is missing', async () => {
    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: {},
        getVariable: () => undefined,
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'missing email');
  });

  it('should return 409 when admin already exists', async () => {
    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: { email: 'existing@example.com' },
        getVariable: (name) => (name === 'email' ? 'existing@example.com' : undefined),
        getHeader: () => null,
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => ({
            customMetadata: {
              dateAdded: '2025-01-21T12:00:00Z',
              addedBy: '192.168.1.1',
            },
          }),
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 409);
    assert.equal(resp.headers.get('x-error'), 'admin already exists');
  });

  it('should create admin with metadata and return 201', async () => {
    let capturedKey;
    let capturedMetadata;

    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: { email: 'newadmin@example.com' },
        getVariable: (name) => (name === 'email' ? 'newadmin@example.com' : undefined),
        getHeader: (name) => (name === 'cf-connecting-ip' ? '192.168.1.100' : null),
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => null, // Not exists
          put: async (key, _value, options) => {
            capturedKey = key;
            capturedMetadata = options.customMetadata;
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 201);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');

    const data = await resp.json();
    assert.equal(data.email, 'newadmin@example.com');
    assert.ok(data.dateAdded);
    assert.equal(data.addedBy, '192.168.1.100');

    // Check the correct key was used
    assert.equal(capturedKey, 'org/site/admins/newadmin@example.com');

    // Check metadata was stored
    assert.ok(capturedMetadata.dateAdded);
    assert.equal(capturedMetadata.addedBy, '192.168.1.100');
  });

  it('should use "unknown" as addedBy when IP is not available', async () => {
    let capturedMetadata;

    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: { email: 'admin@example.com' },
        getVariable: (name) => (name === 'email' ? 'admin@example.com' : undefined),
        getHeader: () => null, // No IP header
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => null,
          put: async (_key, _value, options) => {
            capturedMetadata = options.customMetadata;
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 201);

    const data = await resp.json();
    assert.equal(data.addedBy, 'unknown');
    assert.equal(capturedMetadata.addedBy, 'unknown');
  });

  it('should store dateAdded in ISO8601 format', async () => {
    let capturedMetadata;

    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: { email: 'admin@example.com' },
        getVariable: (name) => (name === 'email' ? 'admin@example.com' : undefined),
        getHeader: () => '192.168.1.1',
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => null,
          put: async (_key, _value, options) => {
            capturedMetadata = options.customMetadata;
          },
        },
      },
    });

    await handler(ctx);

    // Check ISO8601 format (e.g., 2025-01-21T12:00:00.000Z)
    assert.ok(capturedMetadata.dateAdded);
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capturedMetadata.dateAdded));
  });

  it('should use correct key format with org/site', async () => {
    let capturedKey;

    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        org: 'myorg',
        site: 'mysite',
        variables: { email: 'test@example.com' },
        getVariable: (name) => (name === 'email' ? 'test@example.com' : undefined),
        getHeader: () => '192.168.1.1',
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => null,
          put: async (key, _value, _options) => {
            capturedKey = key;
          },
        },
      },
    });

    await handler(ctx);
    assert.equal(capturedKey, 'myorg/mysite/admins/test@example.com');
  });
});
