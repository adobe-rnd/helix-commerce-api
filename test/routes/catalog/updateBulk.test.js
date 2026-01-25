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
import sinon from 'sinon';
import esmock from 'esmock';
import { DEFAULT_CONTEXT, createAuthInfoMock } from '../../fixtures/context.js';
import { createProductFixture } from '../../fixtures/product.js';

describe('Product Bulk Save Tests', () => {
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

  describe('handleProductSaveRequest (bulk)', () => {
    it('should return 405 if path is "/*" and method is not POST', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
      }, { path: '/*' });
      ctx.log = { error: sinon.stub() };
      ctx.requestInfo.method = 'PUT';
      const request = { json: sinon.stub().resolves([createProductFixture(), createProductFixture({ sku: '1234-2', path: '/products/test-2' })]) };

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 400 if data is not an array', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub() },
        data: { sku: '1234', path: '/products/test-product', name: 'product-name' },
        requestInfo: {
          path: '/*',
          method: 'POST',
        },
      }, { path: '/*' });
      const request = {};

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'data must be an array');
    });

    it('should return 400 if data exceeds max bulk size', async () => {
      const products = Array.from({ length: 51 }, (_, i) => ({ sku: `bulk-${i}`, path: `/products/bulk-${i}`, name: `Bulk ${i}` }));
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'data must be an array of 50 or fewer products');
    });

    it('should return 201 when products are successfully saved (bulk)', async () => {
      const products = [
        { sku: '1234', path: '/products/product-1', name: 'product-name' },
        { sku: '5678', path: '/products/product-2', name: 'product-name-2' },
      ];
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      assert(storageStub.saveProductsByPath.calledOnce);
    });

    it('should select async image processing when product list is large', async () => {
      const products = Array.from({ length: 11 }, (_, i) => ({ sku: `sku-${i}`, path: `/products/sku-${i}`, name: `Name ${i}` }));
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
          IMAGE_COLLECTOR_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      // called with asyncImages = true due to >10 products
      assert(storageStub.saveProductsByPath.calledOnce);
      const [, asyncImagesFlag] = storageStub.saveProductsByPath.firstCall.args;
      assert.equal(asyncImagesFlag, true);
    });

    it('should return 400 when a product in bulk array is missing path field', async () => {
      const products = [
        { sku: '1234', path: '/products/product-1', name: 'product-name' },
        { sku: '5678', name: 'product-name-2' }, // Missing path
      ];
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'each product must have a path field for bulk operations');
    });

    it('should handle errors during save and still return 201 with results', async () => {
      const products = [
        { sku: '1234', path: '/products/product-1', name: 'product-name' },
      ];
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().rejects(new Error('Queue error')),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      // Should still return 201 even though there was an error
      assert.equal(response.status, 201);
      // Verify error was logged
      assert(ctx.log.error.calledOnce);
    });
  });
});
