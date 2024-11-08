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

describe('Product Delete Tests', () => {
  let handleProductDeleteRequest;
  let lookupUrlKeyStub;
  let callAdminStub;
  let errorResponseStub;

  beforeEach(async () => {
    deleteProductsStub = sinon.stub();
    lookupUrlKeyStub = sinon.stub();
    callAdminStub = sinon.stub();
    errorResponseStub = sinon.stub();

    const mocks = {
      '../../src/utils/r2.js': {
        deleteProducts: deleteProductsStub,
        lookupUrlKey: lookupUrlKeyStub,
      },
      '../../src/utils/admin.js': {
        callAdmin: callAdminStub,
      },
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

  it('should return 400 if SKU is missing', async () => {
    const config = {};
    const ctx = { log: { error: sinon.stub(), info: sinon.stub() } };

    errorResponseStub.withArgs(400, 'Invalid or missing SKU').returns(new Response('Invalid or missing SKU', { status: 400 }));

    const response = await handleProductDeleteRequest(ctx, config);

    assert(errorResponseStub.calledOnceWithExactly(400, 'Invalid or missing SKU'));
    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Invalid or missing SKU');
  });

  it('should return 400 if SKU is "*" (wildcard)', async () => {
    const config = { sku: '*' };
    const ctx = { log: { error: sinon.stub(), info: sinon.stub() } };

    errorResponseStub.withArgs(400, 'Wildcard SKU deletions is not currently supported').returns(new Response('Wildcard SKU deletions is not currently supported', { status: 400 }));

    const response = await handleProductDeleteRequest(ctx, config);

    assert(errorResponseStub.calledOnceWithExactly(400, 'Wildcard SKU deletions is not currently supported'));
    assert.strictEqual(response.status, 400);
    assert.strictEqual(await response.text(), 'Wildcard SKU deletions is not currently supported');
  });

  it('should successfully delete a product and purge paths', async () => {
    const config = {
      sku: '1234',
      helixApiKey: 'test-api-key',
      storeCode: 'store1',
      storeViewCode: 'view1',
      confMap: {
        '/path/to/{{sku}}': { storeCode: 'store1', storeViewCode: 'view1' },
        '/another/path/{{urlkey}}/{{sku}}': { storeCode: 'store1', storeViewCode: 'view1' },
        base: {},
      },
    };
    const ctx = { log: { error: sinon.stub(), info: sinon.stub() } };
    const sku = '1234';
    const urlKey = 'product-url-key';

    lookupUrlKeyStub.resolves(urlKey);
    deleteProductsStub.resolves([
      {
        sku: '1234',
        status: 200,
        message: 'Product deleted successfully.',
        paths: {
          '/products/bella-tank/wt01': {
            preview: {
              status: 204,
              method: 'DELETE',
              message: 'No Content',
              path: '/products/bella-tank/wt01',
            },
            live: {
              status: 204,
              method: 'DELETE',
              message: 'No Content',
              path: '/products/bella-tank/wt01',
            },
          },
        },
      },
    ]);

    callAdminStub.resolves(new Response(null, { status: 200 }));

    const response = await handleProductDeleteRequest(ctx, config);

    assert(deleteProductsStub.calledOnceWithExactly(ctx, config, [sku]));

    const deleteResults = await response.json();
    console.log(deleteResults);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(deleteResults, '');
  });

  it('should handle lookupUrlKey throwing an error with response', async () => {
    const config = { sku: '1234' };
    const ctx = { log: { error: sinon.stub(), info: sinon.stub() } };
    const errorResponse = new Response('Lookup error', { status: 502 });

    const error = new Error('Lookup failed');
    error.response = errorResponse;

    lookupUrlKeyStub.rejects(error);

    const response = await handleProductDeleteRequest(ctx, config);

    assert.strictEqual(response, errorResponse);
    assert(ctx.log.error.notCalled);
  });

  it('should handle lookupUrlKey throwing an error without response', async () => {
    const config = { sku: '1234' };
    const ctx = { log: { error: sinon.stub(), info: sinon.stub() } };
    const error = new Error('Unexpected error');

    lookupUrlKeyStub.rejects(error);

    errorResponseStub.withArgs(500, 'Internal Server Error').returns(new Response('Internal Server Error', { status: 500 }));

    const response = await handleProductDeleteRequest(ctx, config);

    assert(errorResponseStub.calledOnceWithExactly(500, 'Internal Server Error'));
    assert(ctx.log.error.calledOnceWithExactly({
      message: error.message,
      stack: error.stack,
      timestamp: sinon.match.string,
    }));
    assert.strictEqual(response.status, 500);
    assert.strictEqual(await response.text(), 'Internal Server Error');
  });

  it('should handle deleteProducts throwing an error with response', async () => {
    const config = { sku: '1234' };
    const ctx = { log: { error: sinon.stub(), info: sinon.stub() } };
    const errorResponse = new Response('Delete error', { status: 503 });

    const error = new Error('Delete failed');
    error.response = errorResponse;

    lookupUrlKeyStub.resolves('url-key');
    deleteProductsStub.rejects(error);

    const response = await handleProductDeleteRequest(ctx, config);

    assert.strictEqual(response, errorResponse);
    assert(ctx.log.error.notCalled);
  });

  it('should handle deleteProducts throwing an error without response', async () => {
    const config = { sku: '1234' };
    const ctx = { log: { error: sinon.stub(), info: sinon.stub() } };
    const error = new Error('Unexpected delete error');

    lookupUrlKeyStub.resolves('url-key');
    deleteProductsStub.rejects(error);

    errorResponseStub.withArgs(500, 'Internal Server Error').returns(new Response('Internal Server Error', { status: 500 }));

    const response = await handleProductDeleteRequest(ctx, config);

    assert(errorResponseStub.calledOnceWithExactly(500, 'Internal Server Error'));
    assert(ctx.log.error.calledOnceWithExactly({
      message: error.message,
      stack: error.stack,
      timestamp: sinon.match.string,
    }));
    assert.strictEqual(response.status, 500);
    assert.strictEqual(await response.text(), 'Internal Server Error');
  });

  it('should handle callAdmin failures and still return 204', async () => {
    const config = {
      sku: '1234',
      helixApiKey: 'test-api-key',
      storeCode: 'store1',
      storeViewCode: 'view1',
      confMap: {
        '/path/to/{{sku}}': { storeCode: 'store1', storeViewCode: 'view1' },
      },
    };
    const ctx = { log: { error: sinon.stub(), info: sinon.stub() } };
    const sku = '1234';
    const urlKey = 'product-url-key';

    lookupUrlKeyStub.resolves(urlKey);
    deleteProductsStub.resolves();

    callAdminStub.onFirstCall().resolves(new Response(null, { status: 200 }));
    callAdminStub.onSecondCall().resolves(new Response('Deletion failed', { status: 500, headers: { 'x-error': 'Deletion failed' } }));

    const response = await handleProductDeleteRequest(ctx, config);

    assert(lookupUrlKeyStub.calledOnceWithExactly(ctx, config, sku));
    assert(deleteProductsStub.calledOnceWithExactly(ctx, config, [sku]));

    const expectedCallAdminCalls = [
      [config, 'preview', '/path/to/1234', {
        method: 'DELETE',
        headers: { authorization: `token ${config.helixApiKey}` },
      }],
      [config, 'live', '/path/to/1234', {
        method: 'DELETE',
        headers: { authorization: `token ${config.helixApiKey}` },
      }],
    ];

    assert.strictEqual(callAdminStub.callCount, expectedCallAdminCalls.length);
    expectedCallAdminCalls.forEach((callArgs, index) => {
      assert(callAdminStub.getCall(index).calledWithExactly(...callArgs));
    });

    assert(ctx.log.info.calledOnce);
    const logArgs = ctx.log.info.getCall(0).args[0];
    assert.strictEqual(logArgs.action, 'product_deletion');
    assert.strictEqual(logArgs.sku, sku);
    assert.ok(new Date(logArgs.timestamp).toString() !== 'Invalid Date');

    assert.strictEqual(response.status, 204);
    assert.strictEqual(await response.text(), '');
  });
});
