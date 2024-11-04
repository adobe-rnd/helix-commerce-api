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

describe('Product Save Tests', () => {
  let putProduct;
  /** @type {import('../../src/catalog/update.js').handleProductSaveRequest} */
  let handleProductSaveRequest;
  /** @type {sinon.SinonStub} */
  let saveProductsStub;
  /** @type {sinon.SinonStub} */
  let callAdminStub;

  beforeEach(async () => {
    saveProductsStub = sinon.stub();
    callAdminStub = sinon.stub();

    const mocks = {
      '../../src/utils/r2.js': { saveProducts: saveProductsStub },
      '../../src/utils/admin.js': { callAdmin: callAdminStub },
    };

    ({ putProduct, handleProductSaveRequest } = await esmock('../../src/catalog/update.js', mocks));
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('putProduct', () => {
    it('should throw error when product SKU is missing', async () => {
      const product = {};
      await assert.rejects(async () => {
        await putProduct({}, {}, product);
      }, /invalid request body: missing sku/);
    });

    it('should save the product when SKU is present', async () => {
      const product = { sku: '1234' };
      saveProductsStub.resolves();

      const result = await putProduct({}, {}, product);

      assert(saveProductsStub.calledOnce);
      assert.deepEqual(result, product);
    });
  });

  describe('handleProductSaveRequest', () => {
    it('should return 501 if config.sku is "*"', async () => {
      const config = { sku: '*' };
      const ctx = { log: { error: sinon.stub() } };
      const request = { json: sinon.stub().resolves({ sku: '1234' }) };

      const response = await handleProductSaveRequest(ctx, config, request);

      assert.equal(response.status, 501);
      assert.equal(response.headers.get('x-error'), 'not implemented');
    });

    it('should return 201 when product is successfully saved and paths are purged', async () => {
      const config = {
        sku: '1234',
        confMap: {
          '/path/to/{{sku}}': {},
          '/path/to/{{urlkey}}/{{sku}}': {},
        },
      };
      const ctx = { log: { error: sinon.stub() } };
      const request = { json: sinon.stub().resolves({ sku: '1234', urlKey: 'product-url-key' }) };

      saveProductsStub.resolves();
      callAdminStub.resolves({ ok: true });

      const response = await handleProductSaveRequest(ctx, config, request);

      assert.equal(response.status, 201);
      assert(saveProductsStub.calledOnce);
      assert.equal(callAdminStub.callCount, 4);
    });

    it('should return 404 when no matching path patterns found', async () => {
      const config = {
        sku: '1234',
        confMap: {
          base: {},
        },
      };
      const ctx = { log: { error: sinon.stub() } };
      const request = { json: sinon.stub().resolves({ sku: '1234' }) };

      saveProductsStub.resolves();
      const response = await handleProductSaveRequest(ctx, config, request);

      assert(callAdminStub.notCalled);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('x-error'), 'no path patterns found');
    });

    it('should return error when purging fails', async () => {
      const config = {
        sku: '1234',
        confMap: {
          '/path/to/{{sku}}': {},
        },
      };
      const ctx = { log: console };
      const request = { json: sinon.stub().resolves({ sku: '1234', urlKey: 'product-url-key' }) };

      saveProductsStub.resolves();
      callAdminStub.onFirstCall().resolves(new Response('', { status: 500, headers: { 'x-error': 'bad thing happen' } }));

      const response = await handleProductSaveRequest(ctx, config, request);

      assert.equal(response.status, 500);
      assert.ok(callAdminStub.calledOnce);
      assert.equal(response.headers.get('x-error'), 'purge errors');
      const respBody = await response.json();
      assert.deepStrictEqual(respBody, {
        errors: [
          {
            op: 'preview',
            path: '/path/to/1234',
            status: 500,
            message: 'bad thing happen',
          },
        ],
      });
    });

    it('should return 400 if request.json throws a JSON parsing error', async () => {
      const config = { sku: '1234', confEnvMap: {} };
      const ctx = { log: { error: sinon.stub() } };
      const request = { json: sinon.stub().rejects(new Error('Unexpected token < in JSON at position 0')) };

      const response = await handleProductSaveRequest(ctx, config, request);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'invalid JSON');

      assert(ctx.log.error.calledOnce);
      assert(ctx.log.error.calledWith('Invalid JSON in request body:', sinon.match.instanceOf(Error)));
    });
  });
});
