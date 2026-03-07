/*
 * Copyright 2026 Adobe. All rights reserved.
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
import sinon from 'sinon';
import StorageClient from '../../src/utils/StorageClient.js';
import { DEFAULT_CONTEXT, TEST_SECRETS_PK } from '../fixtures/context.js';
import { deriveKey, encrypt } from '../../src/utils/encryption.js';

async function encryptPayload(org, site, payload) {
  const key = await deriveKey(TEST_SECRETS_PK, org, site);
  return encrypt(key, JSON.stringify(payload));
}

function makeR2Object(text) {
  return { text: sinon.stub().resolves(text) };
}

function createClient(secretsBucketOverrides = {}) {
  const secretsBucket = {
    get: sinon.stub().resolves(null),
    put: sinon.stub().resolves(),
    ...secretsBucketOverrides,
  };

  const ctx = DEFAULT_CONTEXT({
    requestInfo: { org: 'myorg', site: 'mysite' },
    env: {
      SECRETS_BUCKET: secretsBucket,
      SECRETS_PK: TEST_SECRETS_PK,
      CATALOG_BUCKET: { get: sinon.stub(), put: sinon.stub() },
    },
  });

  return { client: new StorageClient(ctx), secretsBucket };
}

describe('StorageClient#getSecrets', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should return null when no secrets exist at either location', async () => {
    const { client } = createClient();
    const result = await client.getSecrets('/en/us/payments-chase.json');
    assert.strictEqual(result, null);
  });

  it('should return root secrets only for a root path', async () => {
    const rootPayload = {
      username: 'root-user',
      password: 'root-pass',
      merchantId: 'root-merchant',
      terminalId: 'root-terminal',
    };
    const encrypted = await encryptPayload('myorg', 'mysite', rootPayload);

    const { client } = createClient({
      get: sinon.stub().callsFake(async (key) => {
        if (key === 'myorg/mysite/secrets/payments-chase.json') {
          return makeR2Object(encrypted);
        }
        return null;
      }),
    });

    const result = await client.getSecrets('/payments-chase.json');
    assert.deepStrictEqual(result, rootPayload);
  });

  it('should return locale secrets only when no root secrets exist', async () => {
    const localePayload = {
      username: 'locale-user',
      password: 'locale-pass',
      merchantId: 'locale-merchant',
      terminalId: 'locale-terminal',
    };
    const encrypted = await encryptPayload('myorg', 'mysite', localePayload);

    const { client } = createClient({
      get: sinon.stub().callsFake(async (key) => {
        if (key === 'myorg/mysite/secrets/en/us/payments-chase.json') {
          return makeR2Object(encrypted);
        }
        return null;
      }),
    });

    const result = await client.getSecrets('/en/us/payments-chase.json');
    assert.deepStrictEqual(result, localePayload);
  });

  it('should merge root and locale secrets with locale taking precedence', async () => {
    const rootPayload = {
      username: 'root-user',
      password: 'root-pass',
      merchantId: 'root-merchant',
      terminalId: 'root-terminal',
    };
    const localePayload = {
      username: 'locale-user',
      password: 'locale-pass',
      merchantId: 'locale-merchant',
      terminalId: 'locale-terminal',
    };

    const rootEncrypted = await encryptPayload('myorg', 'mysite', rootPayload);
    const localeEncrypted = await encryptPayload('myorg', 'mysite', localePayload);

    const { client } = createClient({
      get: sinon.stub().callsFake(async (key) => {
        if (key === 'myorg/mysite/secrets/payments-chase.json') {
          return makeR2Object(rootEncrypted);
        }
        if (key === 'myorg/mysite/secrets/en/us/payments-chase.json') {
          return makeR2Object(localeEncrypted);
        }
        return null;
      }),
    });

    const result = await client.getSecrets('/en/us/payments-chase.json');
    assert.deepStrictEqual(result, {
      ...rootPayload,
      ...localePayload,
    });
  });

  it('should merge with locale overriding only specific fields', async () => {
    const rootPayload = {
      username: 'root-user',
      password: 'root-pass',
      merchantId: 'root-merchant',
      terminalId: 'root-terminal',
    };
    const localePayload = {
      merchantId: 'ca-merchant',
    };

    const rootEncrypted = await encryptPayload('myorg', 'mysite', rootPayload);
    const localeEncrypted = await encryptPayload('myorg', 'mysite', localePayload);

    const { client } = createClient({
      get: sinon.stub().callsFake(async (key) => {
        if (key === 'myorg/mysite/secrets/payments-chase.json') {
          return makeR2Object(rootEncrypted);
        }
        if (key === 'myorg/mysite/secrets/ca/payments-chase.json') {
          return makeR2Object(localeEncrypted);
        }
        return null;
      }),
    });

    const result = await client.getSecrets('/ca/payments-chase.json');
    assert.deepStrictEqual(result, {
      username: 'root-user',
      password: 'root-pass',
      merchantId: 'ca-merchant',
      terminalId: 'root-terminal',
    });
  });
});
