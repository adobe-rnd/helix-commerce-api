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
import { resolveConfig } from '../src/config.js';
import { TEST_CONTEXT } from './utils/context.js';
import { defaultTenantConfigs } from './utils/kv.js';

describe('config tests', () => {
  it('should extract path params', async () => {
    const tenantConfigs = {
      'org--site': {
        env: {
          base: {
            apiKey: 'bad',
          },
          '/us/p/{{urlkey}}/{{sku}}': {
            pageType: 'product',
            apiKey: 'good',
          },
        },
      },
    };
    const config = await resolveConfig(TEST_CONTEXT('/us/p/my-url-key/some-sku', tenantConfigs));
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { urlkey: 'my-url-key', sku: 'some-sku' },
      headers: {},
      pageType: 'product',
      org: 'org',
      site: 'site',
      env: 'env',
      route: 'content',
      confEnvMap: {
        env: {
          '/us/p/{{urlkey}}/{{sku}}': {
            apiKey: 'good',
            pageType: 'product',
          },
          base: {
            apiKey: 'bad',
          },
        },
      },
    });
  });

  it('should combine headers objects', async () => {
    const tenantConfigs = {
      'org--site': {
        env: {
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
      },
    };
    const config = await resolveConfig(TEST_CONTEXT('/us/p/my-url-key/some-sku', tenantConfigs));
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { urlkey: 'my-url-key', sku: 'some-sku' },
      headers: { foo: '2', baz: '1', bar: '2' },
      pageType: 'product',
      org: 'org',
      site: 'site',
      env: 'env',
      route: 'content',
      confEnvMap: {
        env: {
          '/us/p/{{urlkey}}/{{sku}}': {
            apiKey: 'good',
            headers: {
              bar: '2',
              foo: '2',
            },
            pageType: 'product',
          },
          base: {
            apiKey: 'bad',
            headers: {
              baz: '1',
              foo: '1',
            },
          },
        },
      },
    });
  });

  it('should allow wildcard path segments', async () => {
    const tenantConfigs = {
      'org--site': {
        env: {
          base: {
            apiKey: 'bad',
          },
          '/us/p/*/{{sku}}': {
            pageType: 'product',
            apiKey: 'good',
          },
        },
      },
    };
    const config = await resolveConfig(TEST_CONTEXT('/us/p/something-here/some-sku', tenantConfigs));
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { sku: 'some-sku' },
      headers: {},
      pageType: 'product',
      org: 'org',
      site: 'site',
      env: 'env',
      route: 'content',
      confEnvMap: {
        env: {
          '/us/p/*/{{sku}}': {
            apiKey: 'good',
            pageType: 'product',
          },
          base: {
            apiKey: 'bad',
          },
        },
      },
    });
  });

  it('should allow overrides', async () => {
    const tenantConfigs = {
      'org--site': {
        env: {
          base: {
            apiKey: 'bad1',
          },
          '/us/p/{{sku}}': {
            pageType: 'product',
            apiKey: 'bad2',
          },
        },
      },
    };
    const config = await resolveConfig(
      TEST_CONTEXT('/us/p/some-sku', tenantConfigs),
      { apiKey: 'good' },
    );
    assert.deepStrictEqual(config, {
      apiKey: 'good',
      params: { sku: 'some-sku' },
      pageType: 'product',
      headers: {},
      org: 'org',
      site: 'site',
      env: 'env',
      route: 'content',
      confEnvMap: {
        env: {
          '/us/p/{{sku}}': {
            apiKey: 'bad2',
            pageType: 'product',
          },
          base: {
            apiKey: 'bad1',
          },
        },
      },
    });
  });

  it('should throw if org is missing', async () => {
    await assert.rejects(
      resolveConfig(TEST_CONTEXT('', defaultTenantConfigs, 'http://www.example.com')),
      new Error('missing org'),
    );
  });

  it('should throw if site is missing', async () => {
    await assert.rejects(
      resolveConfig(TEST_CONTEXT('', defaultTenantConfigs, 'http://www.example.com/org')),
      new Error('missing site'),
    );
  });

  it('should throw if env is missing', async () => {
    await assert.rejects(
      resolveConfig(TEST_CONTEXT('', defaultTenantConfigs, 'http://www.example.com/org/site')),
      new Error('missing env'),
    );
  });

  it('should throw if route is missing', async () => {
    await assert.rejects(
      resolveConfig(TEST_CONTEXT('', defaultTenantConfigs, 'http://www.example.com/org/site/env')),
      new Error('missing route'),
    );
  });

  it('should return null for invalid config', async () => {
    const config = await resolveConfig(TEST_CONTEXT('/us/p/some-sku', {}));
    assert.deepStrictEqual(config, null);
  });

  it('should return null if config is not an object', async () => {
    const ctx = TEST_CONTEXT('/us/p/some-sku', {});
    ctx.env.CONFIGS.get = async () => 'not an object';
    const config = await resolveConfig(ctx);
    assert.deepStrictEqual(config, null);
  });
});
