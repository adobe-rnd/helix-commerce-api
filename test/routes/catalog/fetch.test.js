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
import { ResponseError } from '../../../src/utils/http.js';
import handleProductFetchRequest from '../../../src/routes/catalog/fetch.js';

describe('handleProductFetchRequest', () => {
  let storageStub;
  let ctx;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.fetchProduct = sinon.stub();

    ctx = DEFAULT_CONTEXT({
      url: new URL('https://example.com/products/sku1'),
      config: {},
      attributes: {
        storageClient: storageStub,
      },
    });
  });

  afterEach(async () => {
    sinon.restore();
  });

  it('should return the product response when fetchProduct succeeds', async () => {
    const product = { sku: 'sku1', name: 'Product 1' };
    ctx.config.sku = 'sku1';

    storageStub.fetchProduct.resolves(product);
    const response = await handleProductFetchRequest(ctx);

    assert.equal(response.headers.get('Content-Type'), 'application/json');
    const responseBody = await response.text();
    assert.equal(responseBody, JSON.stringify(product));
    assert(storageStub.fetchProduct.calledOnceWith('sku1'));
  });

  it('should return e.response when fetchProduct throws an error with a response property', async () => {
    const errorResponse = new Response('Not Found', { status: 404 });
    const error = new ResponseError('Product not found', errorResponse);
    storageStub.fetchProduct.rejects(error);

    let thrownError;
    try {
      await handleProductFetchRequest(ctx);
    } catch (e) {
      thrownError = e;
    }

    assert.strictEqual(thrownError, error);
  });
});
