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

describe('catalogHandler Tests', () => {
  let catalogHandler;
  let errorResponseStub;
  let handleProductLookupRequestStub;
  let handleProductFetchRequestStub;
  let handleProductSaveRequestStub;
  let handleProductDeleteRequestStub;
  beforeEach(async () => {
    errorResponseStub = sinon.stub();
    handleProductLookupRequestStub = sinon.stub();
    handleProductFetchRequestStub = sinon.stub();
    handleProductSaveRequestStub = sinon.stub();
    handleProductDeleteRequestStub = sinon.stub();

    catalogHandler = (await esmock('../../src/catalog/handler.js', {
      '../../src/utils/http.js': { errorResponse: errorResponseStub },
      '../../src/catalog/lookup.js': { handleProductLookupRequest: handleProductLookupRequestStub },
      '../../src/catalog/fetch.js': { handleProductFetchRequest: handleProductFetchRequestStub },
      '../../src/catalog/update.js': { handleProductSaveRequest: handleProductSaveRequestStub },
      '../../src/catalog/delete.js': { handleProductDeleteRequest: handleProductDeleteRequestStub },
    })).default;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return 405 when method is not allowed', async () => {
    const ctx = {
      info: { method: 'HEAD' },
      url: { pathname: '/org/site/env/catalog/store/view/product/sku1' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 405 });
    errorResponseStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 405);
    assert(errorResponseStub.calledWith(405, 'method not allowed'));
  });

  it('should return 400 when URL is missing "catalog" segment', async () => {
    const ctx = {
      info: { method: 'GET' },
      url: { pathname: '/org/site/env/store/view/product/sku1' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 400 });
    errorResponseStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 400);
    assert(errorResponseStub.calledWith(400, 'Invalid URL: Missing "catalog" segment'));
  });

  it('should return 400 when URL structure is incorrect', async () => {
    const ctx = {
      info: { method: 'GET' },
      url: { pathname: '/org/site/catalog/store/view' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 400 });
    errorResponseStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 400);
    assert(errorResponseStub.calledWith(400, 'Invalid URL structure: Expected format: /{org}/{site}/catalog/{store}/{storeView}/product/{sku}'));
  });

  it('should return 400 when sku is uppercase', async () => {
    const ctx = {
      info: { method: 'GET' },
      url: { pathname: '/org/site/catalog/store/view/product/PRODUCT-SKU' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 400 });
    errorResponseStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 400);
    assert(errorResponseStub.calledWith(400, 'Invalid SKU: SKU cannot contain uppercase letters'));
  });

  it('should call handleProductLookupRequest when method is GET and subRoute is "lookup"', async () => {
    const ctx = {
      info: { method: 'GET' },
      url: { pathname: '/org/site/catalog/store/view/lookup/sku' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductLookupRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductLookupRequestStub.calledOnceWith(ctx));
  });

  it('should return 405 if subRoute is "lookup" but method is not GET', async () => {
    const ctx = {
      info: { method: 'PUT' },
      url: { pathname: '/org/site/catalog/store/view/lookup/sku' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 405 });
    errorResponseStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 405);
    assert(errorResponseStub.calledWith(405, 'method not allowed'));
  });

  it('should call handleProductSaveRequest when method is PUT', async () => {
    const ctx = {
      info: { method: 'PUT' },
      url: { pathname: '/org/site/catalog/store/view/product/sku' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductSaveRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductSaveRequestStub.calledOnceWith(ctx, request));
  });

  it('should call handleProductFetchRequest when method is GET', async () => {
    const ctx = {
      info: { method: 'GET' },
      url: { pathname: '/org/site/catalog/store/view/product/sku' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductFetchRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductFetchRequestStub.calledOnceWith(ctx));
  });

  it('should call handleProductDeleteRequest when method is DELETE', async () => {
    const ctx = {
      info: { method: 'DELETE' },
      url: { pathname: '/org/site/catalog/store/view/product/sku' },
      config: {},
    };
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductDeleteRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductDeleteRequestStub.calledOnceWith(ctx));
  });
});
