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
import { SUPERUSER_CONTEXT } from '../../fixtures/context.js';
import handler from '../../../src/routes/auth/fetch.js';

describe('routes/auth fetch tests', () => {
  it('no token in storage, responds 404', async () => {
    const ctx = SUPERUSER_CONTEXT({
      env: {
        KEYS: {
          get: async () => undefined,
        },
      },
      url: { pathname: '/org/site/auth/token' },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 404);
  });

  it('retrieves token from storage', async () => {
    const ctx = SUPERUSER_CONTEXT({
      env: {
        KEYS: {
          get: async () => 'foo',
        },
      },
      url: { pathname: '/org/site/auth/token' },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');
    const { token } = await resp.json();
    assert.equal(token, 'foo');
  });
});
