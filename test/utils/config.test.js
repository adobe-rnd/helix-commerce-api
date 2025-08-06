/*
 * Copyright 2024 Adobe. All rights reserved.
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
import { resolveConfig } from '../../src/utils/config.js';
import { TEST_CONTEXT } from '../fixtures/context.js';

describe('config tests', () => {
  it('should throw if org is missing', async () => {
    await assert.rejects(
      resolveConfig(TEST_CONTEXT('', 'http://www.example.com')),
      new Error('missing org'),
    );
  });

  it('should throw if site is missing', async () => {
    await assert.rejects(
      resolveConfig(TEST_CONTEXT('', 'http://www.example.com/org')),
      new Error('missing site'),
    );
  });

  it('should throw if route is missing', async () => {
    await assert.rejects(
      resolveConfig(TEST_CONTEXT('', 'http://www.example.com/org/site')),
      new Error('missing route'),
    );
  });

  it('should resolve config', async () => {
    const config = await resolveConfig(TEST_CONTEXT('/org/site/route', 'http://www.example.com/org/site/route'));
    assert.deepStrictEqual(config, {
      org: 'org',
      site: 'site',
      route: 'route',
      siteKey: 'org--site',
    });
  });
});
