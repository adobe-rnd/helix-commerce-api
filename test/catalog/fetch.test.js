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

import assert from 'node:assert';
import sinon from 'sinon';
import esmock from 'esmock';
import { ResponseError } from '../../src/utils/http.js';

describe('handleProductFetchRequest', () => {
  let handleProductFetchRequest;
  let fetchProductStub;
  let errorResponseStub;
  let ctx;

  beforeEach(async () => {
    fetchProductStub = sinon.stub();
    errorResponseStub = sinon.stub();

    const moduleUnderTest = await esmock('../../src/catalog/fetch.js', {
      '../../src/utils/r2.js': { fetchProduct: fetchProductStub },
      '../../src/utils/http.js': { errorResponse: errorResponseStub },
    });

    ({ handleProductFetchRequest } = moduleUnderTest);

    ctx = {
      url: new URL('https://example.com/products/12345'),
      log: {
        error: sinon.stub(),
      },
      config: {},
    };
  });

  afterEach(async () => {
    await esmock.purge(handleProductFetchRequest);
    sinon.restore();
  });

  it('should return the product response when fetchProduct succeeds', async () => {
    const sku = '12345';
    const product = { id: sku, name: 'Test Product' };
    fetchProductStub.resolves(product);

    const response = await handleProductFetchRequest(ctx);

    assert.equal(response.headers.get('Content-Type'), 'application/json');
    const responseBody = await response.text();
    assert.equal(responseBody, JSON.stringify(product));
    sinon.assert.calledWith(fetchProductStub, ctx, sku);
  });

  it('should return e.response when fetchProduct throws an error with a response property', async () => {
    const errorResponse = new Response('Not Found', { status: 404 });
    const error = new ResponseError('Product not found', errorResponse);
    fetchProductStub.rejects(error);

    const response = await handleProductFetchRequest(ctx);

    assert.strictEqual(response, errorResponse);
    sinon.assert.notCalled(ctx.log.error);
  });

  it('should log error and return 500 response when fetchProduct throws an error without a response property', async () => {
    const error = new Error('Internal Server Error');
    fetchProductStub.rejects(error);
    const errorResp = new Response('Internal Server Error', { status: 500 });
    errorResponseStub.returns(errorResp);

    const response = await handleProductFetchRequest(ctx);

    assert.equal(response.status, 500);
    const responseBody = await response.text();
    assert.equal(responseBody, 'Internal Server Error');
    sinon.assert.calledOnce(ctx.log.error);
    sinon.assert.calledWith(ctx.log.error, error);
    sinon.assert.calledWith(errorResponseStub, 500, 'internal server error');
  });
});
