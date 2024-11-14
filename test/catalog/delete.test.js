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

describe('handleProductDeleteRequest Tests', () => {
  let handleProductDeleteRequest;
  /** @type {sinon.SinonStub} */
  let errorResponseStub;
  /** @type {sinon.SinonStub} */
  let storageStub;

  beforeEach(async () => {
    errorResponseStub = sinon.stub();
    storageStub = sinon.stub();
    storageStub.deleteProducts = sinon.stub();
    storageStub.deleteProducts.resolves({ success: true, sku: '12345' });

    const mocks = {
      '../../src/utils/http.js': {
        errorResponse: errorResponseStub,
      },
    };

    const module = await esmock('../../src/catalog/delete.js', mocks);
    handleProductDeleteRequest = module.handleProductDeleteRequest;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleProductDeleteRequest', () => {
    it('should return 400 if SKU is "*" (wildcard)', async () => {
      const config = { sku: '*' };
      const ctx = {
        config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
      };

      const mockResponse = new Response('Wildcard SKU deletions is not currently supported', { status: 400 });
      errorResponseStub.withArgs(400, 'Wildcard SKU deletions is not currently supported').returns(mockResponse);

      const response = await handleProductDeleteRequest(ctx, storageStub);

      assert(errorResponseStub.calledOnceWithExactly(400, 'Wildcard SKU deletions is not currently supported'));
      assert.strictEqual(response.status, 400);
      const responseText = await response.text();
      assert.strictEqual(responseText, 'Wildcard SKU deletions is not currently supported');
      assert(ctx.log.info.notCalled);
    });

    it('should throw 400 error if helixApiKey is missing', async () => {
      const config = { sku: '12345' }; // helixApiKey is missing
      const ctx = {
        config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
      };

      const mockErrorResponse = new Response('Helix API key is required to delete or unpublish products.', { status: 400 });
      errorResponseStub.withArgs(400, 'Helix API key is required to delete or unpublish products.').returns(mockErrorResponse);

      let thrownError;
      try {
        await handleProductDeleteRequest(ctx, storageStub);
      } catch (e) {
        thrownError = e;
      }

      assert(errorResponseStub.calledOnceWithExactly(400, 'Helix API key is required to delete or unpublish products.'));
      assert.strictEqual(thrownError, mockErrorResponse);
      assert(ctx.log.info.notCalled);
    });

    it('should successfully delete a product and return 200 with results', async () => {
      const config = {
        sku: '12345',
        helixApiKey: 'test-helix-api-key',
      };
      const ctx = {
        config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
      };
      const deleteResults = { success: true, sku: '12345' };
      const response = await handleProductDeleteRequest(ctx, storageStub);

      assert(storageStub.deleteProducts.calledOnceWithExactly(['12345']));

      assert(ctx.log.info.calledOnce);
      const logArgs = ctx.log.info.getCall(0).args[0];
      assert.strictEqual(logArgs.action, 'delete_products');
      assert.strictEqual(logArgs.result, JSON.stringify(deleteResults));
      assert.ok(new Date(logArgs.timestamp).toString() !== 'Invalid Date');

      assert.strictEqual(response.status, 200);
      const responseBody = await response.text();
      assert.strictEqual(responseBody, JSON.stringify(deleteResults));
    });

    it('should propagate error thrown by deleteProducts', async () => {
      const config = {
        sku: '12345',
        helixApiKey: 'test-helix-api-key',
      };
      const ctx = {
        config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
      };
      const error = new Error('Deletion failed');

      storageStub.deleteProducts.rejects(error);

      let thrownError;
      try {
        await handleProductDeleteRequest(ctx, storageStub);
      } catch (e) {
        thrownError = e;
      }

      assert(storageStub.deleteProducts.calledOnceWithExactly(['12345']));
      assert.strictEqual(thrownError, error);
      assert(ctx.log.info.notCalled);
    });

    it('should handle deleteProducts returning unexpected results', async () => {
      const config = {
        sku: '12345',
        helixApiKey: 'test-helix-api-key',
      };
      const ctx = {
        config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
      };
      const deleteResults = { success: false, sku: '12345', reason: 'Not found' };

      storageStub.deleteProducts.resolves(deleteResults);

      const response = await handleProductDeleteRequest(ctx, storageStub);

      assert(storageStub.deleteProducts.calledOnceWithExactly(['12345']));

      assert(ctx.log.info.calledOnce);
      const logArgs = ctx.log.info.getCall(0).args[0];
      assert.strictEqual(logArgs.action, 'delete_products');
      assert.strictEqual(logArgs.result, JSON.stringify(deleteResults));
      assert.ok(new Date(logArgs.timestamp).toString() !== 'Invalid Date');

      assert.strictEqual(response.status, 200);
      const responseBody = await response.text();
      assert.strictEqual(responseBody, JSON.stringify(deleteResults));
    });
  });
});
