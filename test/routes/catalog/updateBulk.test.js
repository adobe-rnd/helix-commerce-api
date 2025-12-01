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
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';
import { createProductFixture } from '../../fixtures/product.js';

describe('Product Bulk Save Tests', () => {
  /** @type {sinon.SinonStub} */
  let storageStub;
  let fetchHelixConfigStub;
  let handleProductSaveRequest;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.saveProducts = sinon.stub();
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
    it('should return 405 if config.sku is "*" and method is not POST', async () => {
      const ctx = DEFAULT_CONTEXT({ log: { error: sinon.stub() }, config: { sku: '*' }, info: { method: 'PUT' } });
      const request = { json: sinon.stub().resolves([createProductFixture(), createProductFixture({ sku: '1234-2' })]) };

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 400 if data is not an array', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub() },
        data: { sku: '1234', urlKey: 'product-url-key', name: 'product-name' },
        config: { sku: '*' },
        info: { method: 'POST' },
      });
      const request = {};

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'data must be an array');
    });

    it('should return 400 if data exceeds max bulk size', async () => {
      const products = Array.from({ length: 51 }, (_, i) => ({ sku: `bulk-${i}`, name: `Bulk ${i}` }));
      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub() },
        config: { sku: '*' },
        info: { method: 'POST' },
      });
      ctx.data = products;
      const request = {};

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'data must be an array of 50 or fewer products');
    });

    it('should return 201 when products are successfully saved (bulk)', async () => {
      const products = [
        { sku: '1234', name: 'product-name' },
        { sku: '5678', name: 'product-name-2' },
      ];
      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub(), info: sinon.stub() },
        config: { sku: '*', org: 'myorg', site: 'mysite' },
        attributes: { storageClient: storageStub },
        info: { method: 'POST' },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      });
      ctx.data = products;
      const request = {};

      storageStub.saveProducts.resolves(products.map((p) => ({ sku: p.sku, sluggedSku: p.sku })));
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      assert(storageStub.saveProducts.calledOnce);
    });

    it('should select async image processing when product list is large', async () => {
      const products = Array.from({ length: 11 }, (_, i) => ({ sku: `sku-${i}`, name: `Name ${i}` }));
      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub(), info: sinon.stub() },
        config: { sku: '*', org: 'myorg', site: 'mysite' },
        attributes: { storageClient: storageStub },
        info: { method: 'POST' },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
          IMAGE_COLLECTOR_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      });
      ctx.data = products;
      const request = {};

      storageStub.saveProducts.resolves(products.map((p) => ({ sku: p.sku, sluggedSku: p.sku })));
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      // called with asyncImages = true due to >10 products
      assert(storageStub.saveProducts.calledOnce);
      const [, asyncImagesFlag] = storageStub.saveProducts.firstCall.args;
      assert.equal(asyncImagesFlag, true);
    });
  });
});
