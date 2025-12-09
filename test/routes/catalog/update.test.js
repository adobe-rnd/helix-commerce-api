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
import sinon from 'sinon';
import esmock from 'esmock';
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';

describe('Product Save Tests', () => {
  /** @type {sinon.SinonStub} */
  let storageStub;
  let fetchHelixConfigStub;
  let handleProductSaveRequest;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.saveProductsByPath = sinon.stub();
    fetchHelixConfigStub = sinon.stub().resolves({});

    // Mock the module with fetchHelixConfig stub
    handleProductSaveRequest = await esmock('../../../src/routes/catalog/update.js', {
      '../../../src/utils/config.js': {
        fetchHelixConfig: fetchHelixConfigStub,
      },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleProductSaveRequest', () => {
    it('should return 405 if path is "/*" and method is not POST', async () => {
      const ctx = DEFAULT_CONTEXT({}, { path: '/*' });
      ctx.log = { error: sinon.stub() };
      ctx.requestInfo.method = 'PUT';
      const request = { json: sinon.stub().resolves({ sku: '1234', path: '/products/foo', name: 'foo' }) };

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 201 when product is successfully saved and paths are purged', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', path: '/products/test-product', name: 'product-name' },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });
      const request = { };

      storageStub.saveProductsByPath.resolves([{ sku: '1234', path: '/products/test-product' }]);
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      assert(storageStub.saveProductsByPath.calledOnce);
    });

    it('should fetch helix config and cache it in context attributes for bulk operations', async () => {
      const mockHelixConfig = {
        cdn: {
          prod: {
            type: 'fastly',
            host: 'cdn.example.com',
            serviceId: 'service123',
            authToken: 'token123',
          },
        },
        content: {
          contentBusId: 'content-bus-123',
        },
      };
      fetchHelixConfigStub.resolves(mockHelixConfig);

      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', path: '/products/test-product', name: 'product-name' },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });

      storageStub.saveProductsByPath.resolves([{ sku: '1234', path: '/products/test-product' }]);
      const response = await handleProductSaveRequest(ctx);

      // Verify config was fetched
      assert(fetchHelixConfigStub.calledOnceWith(ctx, 'myorg', 'mysite'));

      // Verify config was cached in context
      assert.strictEqual(ctx.attributes.helixConfigCache, mockHelixConfig);

      // Verify response was successful
      assert.equal(response.status, 201);
    });

    it('should return 400 when path in body does not match URL path', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', path: '/products/different-product', name: 'product-name' },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
      }, { path: '/products/test-product.json' });

      const response = await handleProductSaveRequest(ctx);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'path in body (/products/different-product) must match path in URL (/products/test-product)');
    });

    it('should add path from URL when not present in body', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', name: 'product-name' }, // No path in body
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });

      storageStub.saveProductsByPath.resolves([{ sku: '1234', path: '/products/test-product' }]);
      const response = await handleProductSaveRequest(ctx);

      assert.equal(response.status, 201);
      // Verify path was added from URL (without .json)
      assert.equal(ctx.data.path, '/products/test-product');
    });
  });
});
