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
import { DEFAULT_CONTEXT, SUPERUSER_CONTEXT } from '../../fixtures/context.js';
import handler from '../../../src/routes/auth/rotate.js';

describe('routes/auth rotate tests', () => {
  let ogUUID;
  beforeEach(() => {
    ogUUID = crypto.randomUUID;
    crypto.randomUUID = () => 'foo-uuid';
  });
  afterEach(() => {
    crypto.randomUUID = ogUUID;
  });

  it('should reject body with token', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { token: '123' },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'token can not be provided on rotate');
  });

  it('rotates token', async () => {
    const mocked = await esmock('../../../src/routes/auth/rotate.js', {
      '../../../src/routes/auth/update.js': { updateToken: async () => 'foo' },
    });
    const ctx = SUPERUSER_CONTEXT({
      env: {
        KEYS: {
          get: async () => 'test-key',
          put: async () => undefined,
        },
      },
    });
    const resp = await mocked.default(ctx);
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');
    const { token } = await resp.json();
    assert.equal(token, 'foo');
  });
});
