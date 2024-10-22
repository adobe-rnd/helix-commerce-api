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
import { ResponseError } from '../../src/utils/http.js';

describe('handleProductLookupRequest Tests', () => {
  let handleProductLookupRequest;
  let lookupSkuStub;
  let fetchProductStub;
  let listAllProductsStub;
  let errorResponseStub;

  beforeEach(async () => {
    lookupSkuStub = sinon.stub();
    fetchProductStub = sinon.stub();
    listAllProductsStub = sinon.stub();
    errorResponseStub = sinon.stub();

    handleProductLookupRequest = (await esmock('../../src/catalog/lookup.js', {
      '../../src/utils/r2.js': {
        lookupSku: lookupSkuStub,
        fetchProduct: fetchProductStub,
        listAllProducts: listAllProductsStub,
      },
      '../../src/utils/http.js': { errorResponse: errorResponseStub },
    })).handleProductLookupRequest;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return a product when urlkey is provided', async () => {
    const ctx = {
      url: { origin: 'https://test-origin', search: '?urlkey=some-url-key' },
      log: { error: sinon.stub() },
    };
    const config = {
      org: 'test-org',
      site: 'test-site',
      env: 'test-env',
      storeCode: 'test-store-code',
      storeViewCode: 'test-store-view-code',
    };

    lookupSkuStub.resolves('1234');
    fetchProductStub.resolves({ sku: '1234', name: 'Test Product' });

    const response = await handleProductLookupRequest(ctx, config);

    assert.equal(response.headers.get('Location'), 'https://test-origin/test-org/test-site/test-env/test-store-code/test-store-view-code/product/1234');
    assert.equal(response.status, 301);
    const responseBody = await response.json();
    assert.deepEqual(responseBody, { sku: '1234', name: 'Test Product' });

    assert(lookupSkuStub.calledOnceWith(ctx, config, 'some-url-key'));
    assert(fetchProductStub.calledOnceWith(ctx, config, '1234'));
  });

  it('should return a list of all products when no urlKey is provided', async () => {
    const ctx = {
      url: { search: '' },
      log: { error: sinon.stub() },
    };
    const config = {};

    const mockProducts = [
      { sku: '1234', name: 'Product 1' },
      { sku: '5678', name: 'Product 2' },
    ];
    listAllProductsStub.resolves(mockProducts);

    const response = await handleProductLookupRequest(ctx, config);

    assert.equal(response.status, 200);
    const responseBody = await response.json();
    assert.deepEqual(responseBody, {
      total: 2,
      products: mockProducts,
    });

    assert(listAllProductsStub.calledOnceWith(ctx, config));
  });

  it('should return 500 if an unexpected error occurs', async () => {
    const ctx = {
      url: { search: '' },
      log: { error: sinon.stub() },
    };
    const config = {};

    const unexpectedError = new Error('Unexpected Error');
    listAllProductsStub.rejects(unexpectedError);

    const mockErrorResponse = new Response(null, { status: 500, headers: { 'x-error': 'internal server error' } });
    errorResponseStub.returns(mockErrorResponse);

    const response = await handleProductLookupRequest(ctx, config);

    assert.equal(response.status, 500);
    assert.equal(response.headers.get('x-error'), 'internal server error');
    assert(ctx.log.error.calledOnceWith(unexpectedError));
    assert(errorResponseStub.calledOnceWith(500, 'internal server error'));
  });

  it('should return an existing error response if present', async () => {
    const ctx = {
      url: { search: '' },
      log: { error: sinon.stub() },
    };
    const config = {};

    const existingErrorResponse = new Response('Bad Request', { status: 400 });
    const existingError = new ResponseError('Bad Request', existingErrorResponse);

    listAllProductsStub.rejects(existingError);

    const response = await handleProductLookupRequest(ctx, config);

    assert.equal(response.status, 400);
    const responseBody = await response.text();
    assert.equal(responseBody, 'Bad Request');

    assert(listAllProductsStub.calledOnce);
    assert(ctx.log.error.notCalled);
  });
});
