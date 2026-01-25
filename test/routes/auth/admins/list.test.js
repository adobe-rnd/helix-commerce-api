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
import handler from '../../../../src/routes/auth/admins/list.js';

describe('routes/auth/admins list tests', () => {
  it('should reject non-superuser requests', async () => {
    const ctx = DEFAULT_CONTEXT({
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

  it('should return empty list when no admins exist', async () => {
    const ctx = SUPERUSER_CONTEXT({
      env: {
        AUTH_BUCKET: {
          // eslint-disable-next-line no-unused-vars
          list: async ({ prefix }) => ({
            objects: [],
          }),
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');

    const data = await resp.json();
    assert.ok(Array.isArray(data.admins));
    assert.equal(data.admins.length, 0);
  });

  it('should return list of admins with metadata', async () => {
    const ctx = SUPERUSER_CONTEXT({
      env: {
        AUTH_BUCKET: {
          // eslint-disable-next-line no-unused-vars
          list: async ({ prefix }) => ({
            objects: [
              {
                key: 'org/site/admins/admin1@example.com',
                customMetadata: {
                  dateAdded: '2025-01-21T12:00:00Z',
                  addedBy: '192.168.1.1',
                },
              },
              {
                key: 'org/site/admins/admin2@example.com',
                customMetadata: {
                  dateAdded: '2025-01-21T13:00:00Z',
                  addedBy: '192.168.1.2',
                },
              },
            ],
          }),
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 200);

    const data = await resp.json();
    assert.equal(data.admins.length, 2);
    assert.equal(data.admins[0].email, 'admin1@example.com');
    assert.equal(data.admins[0].dateAdded, '2025-01-21T12:00:00Z');
    assert.equal(data.admins[0].addedBy, '192.168.1.1');
    assert.equal(data.admins[1].email, 'admin2@example.com');
    assert.equal(data.admins[1].dateAdded, '2025-01-21T13:00:00Z');
    assert.equal(data.admins[1].addedBy, '192.168.1.2');
  });

  it('should handle admins with missing metadata', async () => {
    const ctx = SUPERUSER_CONTEXT({
      env: {
        AUTH_BUCKET: {
          // eslint-disable-next-line no-unused-vars
          list: async ({ prefix }) => ({
            objects: [
              {
                key: 'org/site/admins/admin@example.com',
                customMetadata: {},
              },
            ],
          }),
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 200);

    const data = await resp.json();
    assert.equal(data.admins.length, 1);
    assert.equal(data.admins[0].email, 'admin@example.com');
    assert.equal(data.admins[0].dateAdded, undefined);
    assert.equal(data.admins[0].addedBy, undefined);
  });

  it('should use correct prefix for org/site', async () => {
    let capturedPrefix;
    const ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        org: 'testorg',
        site: 'testsite',
      },
      env: {
        AUTH_BUCKET: {
          list: async ({ prefix }) => {
            capturedPrefix = prefix;
            return { objects: [] };
          },
        },
      },
    });

    await handler(ctx);
    assert.equal(capturedPrefix, 'testorg/testsite/admins/');
  });
});
