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
import esmock from 'esmock';
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';
import handler from '../../../src/routes/auth/handler.js';

describe('routes/auth handler tests', () => {
  it('should 404 on invalid route', async () => {
    const ctx = DEFAULT_CONTEXT({
      url: { pathname: '/org/site/auth/invalid' },
      requestInfo: {
        variables: { subRoute: 'invalid' },
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 404);
  });

  it('should respond on valid route', async () => {
    const mocked = await esmock('../../../src/routes/auth/handler.js', {
      '../../../src/routes/auth/token/retrieve.js': async () => ({ status: 200 }),
    });
    const ctx = DEFAULT_CONTEXT({
      url: { pathname: '/org/site/auth/token' },
      requestInfo: {
        variables: { subRoute: 'token' },
      },
    });
    const resp = await mocked.default(ctx);
    assert.equal(resp.status, 200);
  });

  describe('PUT /{org}/sites/{site}/auth', () => {
    it('should require superuser permission', async () => {
      const ctx = DEFAULT_CONTEXT({
        url: { pathname: '/testorg/sites/testsite/auth' },
        requestInfo: {
          org: 'testorg',
          site: 'testsite',
          method: 'PUT',
          getVariable: (name) => {
            if (name === 'subRoute') return 'auth';
            return null;
          },
        },
        authInfo: {
          isSuperuser: () => false, // Not a superuser
          email: 'user@example.com',
        },
        env: {
          AUTH_BUCKET: {
            head: async () => null,
            put: async () => {},
          },
        },
      });

      const resp = await handler(ctx);
      // Should route to a 404 since superuser check fails and no handler matches
      assert.equal(resp.status, 404);
    });

    it('should create sitefile when it does not exist', async () => {
      let putCalled = false;
      let putKey = null;
      let putMetadata = null;

      const ctx = DEFAULT_CONTEXT({
        url: { pathname: '/testorg/sites/testsite/auth' },
        requestInfo: {
          org: 'testorg',
          site: 'testsite',
          method: 'PUT',
          getVariable: (name) => {
            if (name === 'subRoute') return 'auth';
            return null;
          },
        },
        authInfo: {
          isSuperuser: () => true,
          email: 'superuser@example.com',
        },
        env: {
          AUTH_BUCKET: {
            head: async (key) => {
              if (key === 'sites/testorg/testsite') return null; // Does not exist
              return null;
            },
            put: async (key, value, options) => {
              putCalled = true;
              putKey = key;
              putMetadata = options.customMetadata;
            },
          },
        },
      });

      const resp = await handler(ctx);

      assert.ok(putCalled, 'Should have called AUTH_BUCKET.put');
      assert.equal(putKey, 'sites/testorg/testsite', 'Should use correct key');
      assert.ok(putMetadata.createdAt, 'Should have createdAt metadata');
      assert.equal(putMetadata.createdBy, 'superuser@example.com', 'Should have createdBy metadata');

      // Response should be 404 as there's no handler for PUT /auth beyond sitefile creation
      assert.equal(resp.status, 404);
    });

    it('should return 409 if sitefile already exists', async () => {
      const ctx = DEFAULT_CONTEXT({
        url: { pathname: '/testorg/sites/testsite/auth' },
        requestInfo: {
          org: 'testorg',
          site: 'testsite',
          method: 'PUT',
          getVariable: (name) => {
            if (name === 'subRoute') return 'auth';
            return null;
          },
        },
        authInfo: {
          isSuperuser: () => true,
          email: 'superuser@example.com',
        },
        env: {
          AUTH_BUCKET: {
            head: async (key) => {
              if (key === 'sites/testorg/testsite') {
                // Site file exists
                return { customMetadata: { createdAt: '2025-01-01T00:00:00Z' } };
              }
              return null;
            },
            put: async () => {
              throw new Error('Should not be called');
            },
          },
        },
      });

      const resp = await handler(ctx);

      assert.equal(resp.status, 409, 'Should return 409 Conflict');
      const body = await resp.text();
      assert.ok(body.includes('sitefile already exists') || resp.headers.get('x-error') === 'sitefile already exists');
    });

    it('should use "unknown" as createdBy when email is not available', async () => {
      let putMetadata = null;

      const ctx = DEFAULT_CONTEXT({
        url: { pathname: '/testorg/sites/testsite/auth' },
        requestInfo: {
          org: 'testorg',
          site: 'testsite',
          method: 'PUT',
          getVariable: (name) => {
            if (name === 'subRoute') return 'auth';
            return null;
          },
        },
        authInfo: {
          isSuperuser: () => true,
          email: null, // No email available
        },
        env: {
          AUTH_BUCKET: {
            head: async () => null,
            put: async (key, value, options) => {
              putMetadata = options.customMetadata;
            },
          },
        },
      });

      await handler(ctx);

      assert.ok(putMetadata, 'Should have called put');
      assert.equal(putMetadata.createdBy, 'unknown', 'Should use "unknown" when email is not available');
    });
  });
});
