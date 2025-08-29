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
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';
import handleProductSaveRequest from '../../../src/routes/catalog/update.js';

describe('Product Save Tests', () => {
  /** @type {sinon.SinonStub} */
  let storageStub;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.saveProducts = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleProductSaveRequest', () => {
    it('should return 405 if config.sku is "*" and method is not POST', async () => {
      const ctx = DEFAULT_CONTEXT({ log: { error: sinon.stub() }, config: { sku: '*' }, info: { method: 'PUT' } });
      const request = { json: sinon.stub().resolves({ sku: '1234', urlKey: 'foo', name: 'foo' }) };

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 201 when product is successfully saved and paths are purged', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', urlKey: 'product-url-key', name: 'product-name' },
        config: {
          sku: '1234',
        },
        attributes: {
          storageClient: storageStub,
        },
      });
      const request = { };

      storageStub.saveProducts.resolves([]);
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      assert(storageStub.saveProducts.calledOnce);
    });
  });
});
