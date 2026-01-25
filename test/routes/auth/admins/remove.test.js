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
import handler from '../../../../src/routes/auth/admins/remove.js';

describe('routes/auth/admins remove tests', () => {
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

  it('should return 404 when admin does not exist', async () => {
    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: { email: 'notfound@example.com' },
        getVariable: (name) => (name === 'email' ? 'notfound@example.com' : undefined),
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => null, // Not exists
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 404);
    assert.equal(resp.headers.get('x-error'), 'admin not found');
  });

  it('should delete admin and return success', async () => {
    let deletedKey;

    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: { email: 'admin@example.com' },
        getVariable: (name) => (name === 'email' ? 'admin@example.com' : undefined),
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => ({
            customMetadata: {
              dateAdded: '2025-01-21T12:00:00Z',
              addedBy: '192.168.1.1',
            },
          }),
          delete: async (key) => {
            deletedKey = key;
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');

    const data = await resp.json();
    assert.equal(data.email, 'admin@example.com');
    assert.equal(data.removed, true);

    // Check the correct key was deleted
    assert.equal(deletedKey, 'org/site/admins/admin@example.com');
  });

  it('should use correct key format with org/site', async () => {
    let capturedKey;

    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        org: 'testorg',
        site: 'testsite',
        variables: { email: 'test@example.com' },
        getVariable: (name) => (name === 'email' ? 'test@example.com' : undefined),
      },
      env: {
        AUTH_BUCKET: {
          head: async (key) => {
            capturedKey = key;
            return {
              customMetadata: {
                dateAdded: '2025-01-21T12:00:00Z',
                addedBy: '192.168.1.1',
              },
            };
          },
          delete: async (_key) => {
            // Already captured in head
          },
        },
      },
    });

    await handler(ctx);
    assert.equal(capturedKey, 'testorg/testsite/admins/test@example.com');
  });

  it('should handle deletion after checking existence', async () => {
    let headCalled = false;
    let deleteCalled = false;

    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: { email: 'admin@example.com' },
        getVariable: (name) => (name === 'email' ? 'admin@example.com' : undefined),
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => {
            headCalled = true;
            return {
              customMetadata: {
                dateAdded: '2025-01-21T12:00:00Z',
                addedBy: '192.168.1.1',
              },
            };
          },
          delete: async (_key) => {
            deleteCalled = true;
          },
        },
      },
    });

    await handler(ctx);
    assert.ok(headCalled, 'head should be called to check existence');
    assert.ok(deleteCalled, 'delete should be called after existence check');
  });

  it('should not call delete when admin does not exist', async () => {
    let deleteCalled = false;

    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        variables: { email: 'notfound@example.com' },
        getVariable: (name) => (name === 'email' ? 'notfound@example.com' : undefined),
      },
      env: {
        AUTH_BUCKET: {
          head: async (_key) => null,
          delete: async (_key) => {
            deleteCalled = true;
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 404);
    assert.ok(!deleteCalled, 'delete should not be called when admin does not exist');
  });
});
