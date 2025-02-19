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
import handleProductRemoveRequest from '../../../src/routes/catalog/remove.js';

describe('Catalog Remove Tests', () => {
  /** @type {sinon.SinonStub} */
  let storageStub;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.deleteProducts = sinon.stub();
    storageStub.deleteProducts.resolves({ success: true, sku: '12345' });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleProductRemoveRequest', () => {
    it('should return 400 if SKU is "*" (wildcard)', async () => {
      const config = { sku: '*' };
      const ctx = DEFAULT_CONTEXT({
        config,
        attributes: {
          storageClient: storageStub,
        },
      });

      const response = await handleProductRemoveRequest(ctx, storageStub);
      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'Wildcard SKU deletions is not currently supported');
    });

    it('should throw 400 error if helixApiKey is missing', async () => {
      const config = { sku: '12345' }; // helixApiKey is missing
      const ctx = DEFAULT_CONTEXT({
        config,
        attributes: {
          storageClient: storageStub,
        },
      });

      let thrownError;
      try {
        await handleProductRemoveRequest(ctx);
      } catch (e) {
        thrownError = e;
      }

      assert.strictEqual(thrownError.response.headers.get('x-error'), 'Helix API key is required to delete or unpublish products.');
    });

    it('should successfully delete a product and return 200 with results', async () => {
      const config = {
        sku: '12345',
        helixApiKey: 'test-helix-api-key',
      };
      const ctx = DEFAULT_CONTEXT({
        config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        attributes: {
          storageClient: storageStub,
        },
      });
      const deleteResults = { success: true, sku: '12345' };
      const response = await handleProductRemoveRequest(ctx, storageStub);

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
      const ctx = DEFAULT_CONTEXT({
        config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        attributes: {
          storageClient: storageStub,
        },
      });
      const error = new Error('Deletion failed');

      storageStub.deleteProducts.rejects(error);

      let thrownError;
      try {
        await handleProductRemoveRequest(ctx, storageStub);
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
      const ctx = DEFAULT_CONTEXT({
        config,
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        attributes: {
          storageClient: storageStub,
        },
      });
      const deleteResults = { success: false, sku: '12345', reason: 'Not found' };

      storageStub.deleteProducts.resolves(deleteResults);

      const response = await handleProductRemoveRequest(ctx, storageStub);

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
