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
import { DEFAULT_CONTEXT } from '../../../fixtures/context.js';
import handler from '../../../../src/routes/auth/token/update.js';

describe('routes/auth update tests', () => {
  it('should reject invalid token', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { token: null },
      env: {
        KEYS: {
          // @ts-ignore
          get: async () => 'test-key',
        },
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'missing or invalid token');
  });

  it('should update token', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { token: 'new-key' },
      env: {
        KEYS: {
          get: async () => 'test-key',
          put: async () => undefined,
        },
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');
    const { token } = await resp.json();
    assert.equal(token, 'new-key');
  });

  it('should handle errors during token put', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { token: 'new-key' },
      env: {
        KEYS: {
          get: async () => 'test-key',
          put: async () => { throw Error('bad'); },
        },
      },
    });

    let e;
    try {
      await handler(ctx);
    } catch (ee) {
      e = ee;
    }
    assert.equal(e.response.status, 503);
    assert.equal(e.response.headers.get('x-error'), 'failed to update token');
  });
});
