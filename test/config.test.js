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
 * @param {Record<string, Config>} configMap
 * @returns {Context}
 */
const TEST_CONTEXT = (path, configMap) => ({
  env: {
    CONFIGS: {
      get: async (tenant) => configMap[tenant],
    },
  },
  log: console,
  url: new URL(`https://www.example.com/owner--repo/content${path}`),
  info: {
    method: 'GET',
    headers: {},
  },
});

describe('config tests', () => {
  it('should extract path params', async () => {
    const tenantConfigs = {
      'owner--repo': {
        base: {
          apiKey: 'bad',
        },
        '/us/p/{{urlkey}}/{{sku}}': {
          pageType: 'product',
          apiKey: 'good',
        },
      },
    };
    const config = await resolveConfig(
      TEST_CONTEXT('/us/p/my-url-key/some-sku', tenantConfigs),
      'owner--repo',
    );
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { urlkey: 'my-url-key', sku: 'some-sku' },
      headers: {},
      pageType: 'product',
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('should combine headers objects', async () => {
    const tenantConfigs = {
      'owner--repo': {
        base: {
          apiKey: 'bad',
          headers: {
            foo: '1',
            baz: '1',
          },
        },
        '/us/p/{{urlkey}}/{{sku}}': {
          pageType: 'product',
          apiKey: 'good',
          headers: {
            foo: '2',
            bar: '2',
          },
        },
      },
    };
    const config = await resolveConfig(
      TEST_CONTEXT('/us/p/my-url-key/some-sku', tenantConfigs),
      'owner--repo',
    );
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { urlkey: 'my-url-key', sku: 'some-sku' },
      headers: { foo: '2', baz: '1', bar: '2' },
      pageType: 'product',
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('should allow wildcard path segments', async () => {
    const tenantConfigs = {
      'owner--repo': {
        base: {
          apiKey: 'bad',
        },
        '/us/p/*/{{sku}}': {
          pageType: 'product',
          apiKey: 'good',
        },
      },
    };
    const config = await resolveConfig(
      TEST_CONTEXT('/us/p/something-here/some-sku', tenantConfigs),
      'owner--repo',
    );
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { sku: 'some-sku' },
      headers: {},
      pageType: 'product',
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('should allow overrides', async () => {
    const tenantConfigs = {
      'owner--repo': {
        base: {
          apiKey: 'bad1',
        },
        '/us/p/{{sku}}': {
          pageType: 'product',
          apiKey: 'bad2',
        },
      },
    };
    const config = await resolveConfig(
      TEST_CONTEXT('/us/p/some-sku', tenantConfigs),
      'owner--repo',
      { apiKey: 'good' },
    );
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { sku: 'some-sku' },
      pageType: 'product',
      headers: {},
      owner: 'owner',
      repo: 'repo',
    });
  });
});
