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
import { DEFAULT_CONTEXT, createAuthInfoMock } from '../../fixtures/context.js';
import handler from '../../../src/routes/customers/addresses.js';

const VALID_ADDRESS = {
  name: 'John Doe',
  email: 'john@example.com',
  address1: '123 Main St',
  city: 'Anytown',
  state: 'CA',
  zip: '12345',
  country: 'US',
};

describe('routes/customers/addresses tests', () => {
  describe('GET /customers/:email/addresses (list)', () => {
    it('should return list of addresses', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:read'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'GET',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses'),
        attributes: {
          storageClient: {
            listAddresses: async (email) => {
              assert.equal(email, 'user@example.com');
              return [
                { id: 'addr1', email: 'user@example.com' },
                { id: 'addr2', email: 'user@example.com' },
              ];
            },
          },
        },
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 200);
      const body = await resp.json();
      assert.equal(body.addresses.length, 2);
      assert.equal(body.addresses[0].id, 'addr1');
      assert.equal(body.addresses[1].id, 'addr2');
    });

    it('should return empty array when no addresses', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:read'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'GET',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses'),
        attributes: {
          storageClient: {
            listAddresses: async () => [],
          },
        },
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 200);
      const body = await resp.json();
      assert.deepStrictEqual(body.addresses, []);
    });
  });

  describe('GET /customers/:email/addresses/:id (retrieve)', () => {
    it('should return a specific address', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:read'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'GET',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses/addr1'),
        attributes: {
          storageClient: {
            getAddress: async (email, addressId) => {
              assert.equal(email, 'user@example.com');
              assert.equal(addressId, 'addr1');
              return { ...VALID_ADDRESS, id: 'addr1' };
            },
          },
        },
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 200);
      const body = await resp.json();
      assert.equal(body.address.id, 'addr1');
      assert.equal(body.address.name, 'John Doe');
    });

    it('should return 404 when address not found', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:read'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'GET',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses/nonexistent'),
        attributes: {
          storageClient: {
            getAddress: async () => null,
          },
        },
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 404);
    });
  });

  describe('POST /customers/:email/addresses (create)', () => {
    it('should create a new address', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:write'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'POST',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses'),
        data: { ...VALID_ADDRESS },
        attributes: {
          storageClient: {
            getAddressHashTable: async () => ({}),
            saveAddress: async (hash, email, address) => {
              assert.equal(email, 'user@example.com');
              assert.ok(hash);
              return { ...address, id: 'new-id' };
            },
            saveAddressHashTable: async () => {},
          },
        },
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 200);
      const body = await resp.json();
      assert.equal(body.address.id, 'new-id');
      assert.equal(body.address.name, 'John Doe');
    });

    it('should return 400 for invalid address', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:write'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'POST',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses'),
        data: { name: 'John' }, // missing required fields
      });

      try {
        await handler(ctx);
        assert.fail('should have thrown');
      } catch (err) {
        assert.equal(err.response.status, 400);
      }
    });

    it('should return 501 for update (POST with addressId)', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:write'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'POST',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses/addr1'),
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 501);
    });
  });

  describe('DELETE /customers/:email/addresses/:id', () => {
    it('should delete an address', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:write'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'DELETE',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses/addr1'),
        attributes: {
          storageClient: {
            deleteAddress: async (email, addressId) => {
              assert.equal(email, 'user@example.com');
              assert.equal(addressId, 'addr1');
              return true;
            },
          },
        },
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 200);
      const body = await resp.json();
      assert.equal(body.success, true);
    });

    it('should return 404 when address does not exist', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:write'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'DELETE',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses/nonexistent'),
        attributes: {
          storageClient: {
            deleteAddress: async () => false,
          },
        },
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 404);
    });

    it('should return 400 when no addressId provided', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['customers:write'], 'user@example.com'),
        requestInfo: {
          email: 'user@example.com',
          method: 'DELETE',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses'),
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 400);
    });
  });

  describe('unsupported methods', () => {
    it('should return 405 for PATCH', async () => {
      const ctx = DEFAULT_CONTEXT({
        requestInfo: {
          email: 'user@example.com',
          method: 'PATCH',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses'),
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 405);
    });

    it('should return 405 for PUT', async () => {
      const ctx = DEFAULT_CONTEXT({
        requestInfo: {
          email: 'user@example.com',
          method: 'PUT',
          org: 'org',
          site: 'site',
        },
        url: new URL('https://example.com/org/site/customers/user@example.com/addresses'),
      });

      const resp = await handler(ctx);
      assert.equal(resp.status, 405);
    });
  });
});
