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

import { strict as assert } from 'assert';
import sinon from 'sinon';
import esmock from 'esmock';

describe('Product Save Tests', () => {
  let putProduct;
  let handleProductSaveRequest;
  let saveProductsStub;
  let callAdminStub;
  let errorResponseStub;
  let errorWithResponseStub;

  beforeEach(async () => {
    saveProductsStub = sinon.stub();
    callAdminStub = sinon.stub();
    errorResponseStub = sinon.stub();
    errorWithResponseStub = sinon.stub();

    const mocks = {
      '../../src/utils/r2.js': { saveProducts: saveProductsStub },
      '../../src/utils/admin.js': { callAdmin: callAdminStub },
      '../../src/utils/http.js': { errorResponse: errorResponseStub, errorWithResponse: errorWithResponseStub },
    };

    ({ putProduct, handleProductSaveRequest } = await esmock('../../src/catalog/update.js', mocks));
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('putProduct', () => {
    it('should throw error when product SKU is missing', async () => {
      const error = new Error('invalid request body: missing sku');
      errorWithResponseStub.throws(error);

      const product = {};
      await assert.rejects(async () => {
        await putProduct({}, {}, product);
      }, /invalid request body: missing sku/);

      assert(errorWithResponseStub.calledOnce);
      assert(errorWithResponseStub.calledWith(400, 'invalid request body: missing sku'));
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

      const mockResponse = new Response(null, { status: 501, headers: { 'x-error': 'not implemented' } });
      errorResponseStub.returns(mockResponse);

      const response = await handleProductSaveRequest(ctx, config, request);

      assert.equal(response.status, 501);
      assert(errorResponseStub.calledWith(501, 'not implemented'));
      assert.equal(response.headers.get('x-error'), 'not implemented');
    });

    it('should return 201 when product is successfully saved and paths are purged', async () => {
      const config = {
        sku: '1234',
        confEnvMap: {
          test: {
            '/path/to/{{sku}}': { env: 'test' },
            '/path/to/{{urlkey}}/{{sku}}': { env: 'test' },
          },
        },
        env: 'test',
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

    it('should skip calling callAdmin when confMap has no matching env', async () => {
      const config = {
        sku: '1234',
        confEnvMap: {
          prod: {
            base: { },
            '/path/to/{{sku}}': { env: 'other-env' },
          },
        },
        env: 'dev',
      };
      const ctx = { log: { error: sinon.stub() } };
      const request = { json: sinon.stub().resolves({ sku: '1234' }) };

      saveProductsStub.resolves();
      const response = await handleProductSaveRequest(ctx, config, request);

      assert(callAdminStub.notCalled);
      assert.equal(response.status, 201);
    });

    it('should return error when callAdmin fails', async () => {
      const config = {
        sku: '1234',
        confEnvMap: {
          test: {
            '/path/to/{{sku}}': { env: 'test' },
          },
        },
        env: 'test',
      };
      const ctx = { log: { error: sinon.stub() } };
      const request = { json: sinon.stub().resolves({ sku: '1234', urlKey: 'product-url-key' }) };

      saveProductsStub.resolves();
      callAdminStub.onFirstCall().resolves({ ok: false });

      const mockResponse = new Response(null, { status: 400, headers: { 'x-error': 'failed to preview product' } });
      errorResponseStub.returns(mockResponse);

      const response = await handleProductSaveRequest(ctx, config, request);

      assert.equal(response.status, 400);
      assert(callAdminStub.calledOnce);
      assert(errorResponseStub.calledWith(400, 'failed to preview product'));
      assert.equal(response.headers.get('x-error'), 'failed to preview product');
    });

    it('should return 400 if request.json throws a JSON parsing error', async () => {
      const config = { sku: '1234', confEnvMap: {} };
      const ctx = { log: { error: sinon.stub() } };
      const request = { json: sinon.stub().rejects(new Error('Unexpected token < in JSON at position 0')) };

      const mockResponse = new Response(null, { status: 400, headers: { 'x-error': 'invalid JSON' } });
      errorResponseStub.returns(mockResponse);

      const response = await handleProductSaveRequest(ctx, config, request);

      assert.equal(response.status, 400);

      assert(errorResponseStub.calledWith(400, 'invalid JSON'));

      assert.equal(response.headers.get('x-error'), 'invalid JSON');

      assert(ctx.log.error.calledOnce);
      assert(ctx.log.error.calledWith('Invalid JSON in request body:', sinon.match.instanceOf(Error)));
    });
  });
});
