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
      '../../../src/routes/auth/retrieve.js': async () => ({ status: 200 }),
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
});
