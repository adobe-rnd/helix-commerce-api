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
import { DEFAULT_CONTEXT, createAuthInfoMock } from '../../fixtures/context.js';
import handleProductRemoveRequest from '../../../src/routes/catalog/remove.js';

describe('Catalog Remove Tests', () => {
  /** @type {sinon.SinonStub} */
  let storageStub;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.deleteProductsByPath = sinon.stub();
    storageStub.deleteProductsByPath.resolves([{ success: true, path: '/products/test-product' }]);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleProductRemoveRequest', () => {
    it('should return 400 if path is "/*" (wildcard)', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        requestInfo: {
          org: 'org',
          site: 'site',
          path: '/*',
          method: 'DELETE',
        },
        attributes: {
          storageClient: storageStub,
          key: 'test-key',
        },
      }, { path: '/*' });

      const response = await handleProductRemoveRequest(ctx, storageStub);
      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'Wildcard path deletions not supported');
    });

    it('should successfully delete a product and return 200 with results', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        requestInfo: {
          org: 'org',
          site: 'site',
          path: '/products/test-product.json',
          method: 'DELETE',
        },
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        attributes: {
          storageClient: storageStub,
          key: 'test-key',
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });
      const deleteResults = [{ success: true, path: '/products/test-product' }];
      storageStub.deleteProductsByPath.resolves(deleteResults);

      const response = await handleProductRemoveRequest(ctx, storageStub);

      assert(storageStub.deleteProductsByPath.calledOnceWithExactly(['/products/test-product.json']));

      assert(ctx.log.info.calledOnce);
      const logArgs = ctx.log.info.getCall(0).args[0];
      assert.strictEqual(logArgs.action, 'delete_products');
      assert.strictEqual(logArgs.result, JSON.stringify(deleteResults));
      assert.ok(new Date(logArgs.timestamp).toString() !== 'Invalid Date');

      assert.strictEqual(response.status, 200);
      const responseBody = await response.text();
      assert.strictEqual(responseBody, JSON.stringify(deleteResults));
    });

    it('should propagate error thrown by deleteProductsByPath', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        requestInfo: {
          org: 'org',
          site: 'site',
          path: '/products/test-product.json',
          method: 'DELETE',
        },
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        attributes: {
          storageClient: storageStub,
          key: 'test-key',
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });
      const error = new Error('Deletion failed');

      storageStub.deleteProductsByPath.rejects(error);

      let thrownError;
      try {
        await handleProductRemoveRequest(ctx, storageStub);
      } catch (e) {
        thrownError = e;
      }

      assert(storageStub.deleteProductsByPath.calledOnceWithExactly(['/products/test-product.json']));
      assert.strictEqual(thrownError, error);
      assert(ctx.log.info.notCalled);
    });

    it('should handle deleteProductsByPath returning unexpected results', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        requestInfo: {
          org: 'org',
          site: 'site',
          path: '/products/test-product.json',
          method: 'DELETE',
        },
        log: {
          info: sinon.stub(),
          error: sinon.stub(),
        },
        attributes: {
          storageClient: storageStub,
          key: 'test-key',
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });
      const deleteResults = [{ success: false, path: '/products/test-product', reason: 'Not found' }];

      storageStub.deleteProductsByPath.resolves(deleteResults);

      const response = await handleProductRemoveRequest(ctx, storageStub);

      assert(storageStub.deleteProductsByPath.calledOnceWithExactly(['/products/test-product.json']));

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
