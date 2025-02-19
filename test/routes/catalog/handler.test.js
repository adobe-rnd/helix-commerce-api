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
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';

describe('catalogHandler Tests', () => {
  let catalogHandler;
  let handleProductLookupRequestStub;
  let handleProductFetchRequestStub;
  let handleProductSaveRequestStub;
  let handleProductRemoveRequestStub;
  beforeEach(async () => {
    handleProductLookupRequestStub = sinon.stub();
    handleProductFetchRequestStub = sinon.stub();
    handleProductSaveRequestStub = sinon.stub();
    handleProductRemoveRequestStub = sinon.stub();

    catalogHandler = (await esmock('../../../src/routes/catalog/handler.js', {
      '../../../src/routes/catalog/lookup.js': { default: handleProductLookupRequestStub },
      '../../../src/routes/catalog/fetch.js': { default: handleProductFetchRequestStub },
      '../../../src/routes/catalog/update.js': { default: handleProductSaveRequestStub },
      '../../../src/routes/catalog/remove.js': { default: handleProductRemoveRequestStub },
    })).default;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return 405 when method is not allowed', async () => {
    const ctx = DEFAULT_CONTEXT({
      info: { method: 'HEAD' },
      url: { pathname: '/org/site/catalog/store/view/product/sku1' },
      config: {},
    });
    const request = {};
    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 405);
  });

  it('should return 400 when sku is uppercase', async () => {
    const ctx = DEFAULT_CONTEXT({
      info: { method: 'GET' },
      url: { pathname: '/org/site/catalog/store/view/product/PRODUCT-SKU' },
      config: {},
    });
    const request = {};
    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('x-error'), 'Invalid SKU: SKU cannot contain uppercase letters');
  });

  it('should call handleProductLookupRequest when method is GET and subRoute is "lookup"', async () => {
    const ctx = DEFAULT_CONTEXT({
      info: { method: 'GET' },
      url: { pathname: '/org/site/catalog/store/view/lookup/sku' },
      config: {},
    });
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductLookupRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductLookupRequestStub.calledOnceWith(ctx));
  });

  it('should return 405 if subRoute is "lookup" but method is not GET', async () => {
    const ctx = DEFAULT_CONTEXT({
      info: { method: 'PUT' },
      url: { pathname: '/org/site/catalog/store/view/lookup/sku' },
      config: {},
    });
    const request = {};
    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 405);
  });

  it('should call handleProductSaveRequest when method is PUT', async () => {
    const ctx = DEFAULT_CONTEXT({
      info: { method: 'PUT' },
      url: { pathname: '/org/site/catalog/store/view/products/sku' },
      config: {},
    });
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductSaveRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductSaveRequestStub.calledOnceWith(ctx, request));
  });

  it('should call handleProductFetchRequest when method is GET', async () => {
    const ctx = DEFAULT_CONTEXT({
      info: { method: 'GET' },
      url: { pathname: '/org/site/catalog/store/view/products/sku' },
      config: {},
    });
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductFetchRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductFetchRequestStub.calledOnceWith(ctx));
  });

  it('should call handleProductDeleteRequest when method is DELETE', async () => {
    const ctx = DEFAULT_CONTEXT({
      info: { method: 'DELETE' },
      url: { pathname: '/org/site/catalog/store/view/products/sku' },
      config: {},
    });
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductRemoveRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductRemoveRequestStub.calledOnceWith(ctx));
  });
});
