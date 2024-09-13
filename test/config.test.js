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

import assert from 'node:assert';
import { resolveConfig } from '../src/config.js';

/**
 * @param {string} path
 * @returns {Context}
 */
const TEST_CONTEXT = (path) => ({
  env: {},
  log: console,
  url: new URL(`https://www.example.com/tenant/content${path}`),
  info: {
    method: 'GET',
    headers: {},
  },
});

describe('config tests', () => {
  it('should extract path params', () => {
    const tenantConfigs = {
      'test-tenant': {
        base: {
          apiKey: 'bad',
        },
        '/us/p/{{urlkey}}/{{sku}}': {
          pageType: 'product',
          apiKey: 'good',
        },
      },
    };
    const config = resolveConfig(TEST_CONTEXT('/us/p/my-url-key/some-sku'), 'test-tenant', undefined, tenantConfigs);
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { urlkey: 'my-url-key', sku: 'some-sku' },
      pageType: 'product',
    });
  });

  it('should allow wildcard path segments', () => {
    const tenantConfigs = {
      'test-tenant': {
        base: {
          apiKey: 'bad',
        },
        '/us/p/*/{{sku}}': {
          pageType: 'product',
          apiKey: 'good',
        },
      },
    };
    const config = resolveConfig(TEST_CONTEXT('/us/p/something-here/some-sku'), 'test-tenant', undefined, tenantConfigs);
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { sku: 'some-sku' },
      pageType: 'product',
    });
  });

  it('should allow overrides', () => {
    const tenantConfigs = {
      'test-tenant': {
        base: {
          apiKey: 'bad1',
        },
        '/us/p/{{sku}}': {
          pageType: 'product',
          apiKey: 'bad2',
        },
      },
    };
    const config = resolveConfig(TEST_CONTEXT('/us/p/some-sku'), 'test-tenant', { apiKey: 'good' }, tenantConfigs);
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { sku: 'some-sku' },
      pageType: 'product',
    });
  });
});
