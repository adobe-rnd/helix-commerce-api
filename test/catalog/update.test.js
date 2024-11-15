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
  /** @type {import('../../src/catalog/update.js').handleProductSaveRequest} */
  let handleProductSaveRequest;
  /** @type {sinon.SinonStub} */
  let callAdminStub;
  /** @type {sinon.SinonStub} */
  let storageStub;

  beforeEach(async () => {
    callAdminStub = sinon.stub();
    storageStub = sinon.stub();
    storageStub.saveProducts = sinon.stub();

    const mocks = {
      '../../src/utils/admin.js': { callAdmin: callAdminStub },
    };

    ({ handleProductSaveRequest } = await esmock('../../src/catalog/update.js', mocks));
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleProductSaveRequest', () => {
    it('should return 501 if config.sku is "*"', async () => {
      const ctx = { log: { error: sinon.stub() }, config: { sku: '*' } };
      const request = { json: sinon.stub().resolves({ sku: '1234' }) };

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 501);
      assert.equal(response.headers.get('x-error'), 'not implemented');
    });

    it('should return 201 when product is successfully saved and paths are purged', async () => {
      const ctx = {
        log: { error: sinon.stub(), info: sinon.stub() },
        config: {
          sku: '1234',
          confMap: {
            '/path/to/{{sku}}': {},
            '/path/to/{{urlkey}}/{{sku}}': {},
          },
        },
      };
      const request = { json: sinon.stub().resolves({ sku: '1234', urlKey: 'product-url-key' }) };

      storageStub.saveProducts.resolves();
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      assert(storageStub.saveProducts.calledOnce);
    });

    it('should return 400 if request.json throws a JSON parsing error', async () => {
      const ctx = { log: { error: sinon.stub() }, config: { sku: '1234', confEnvMap: {} } };
      const request = { json: sinon.stub().rejects(new Error('Unexpected token < in JSON at position 0')) };

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'invalid JSON');

      assert(ctx.log.error.calledOnce);
      assert(ctx.log.error.calledWith('Invalid JSON in request body:', sinon.match.instanceOf(Error)));
    });
  });
});
