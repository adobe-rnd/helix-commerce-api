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
  let handleProductRetrieveRequestStub;
  let handleProductSaveRequestStub;
  let handleProductRemoveRequestStub;
  beforeEach(async () => {
    handleProductRetrieveRequestStub = sinon.stub();
    handleProductSaveRequestStub = sinon.stub();
    handleProductRemoveRequestStub = sinon.stub();

    catalogHandler = (await esmock('../../../src/routes/catalog/handler.js', {
      '../../../src/routes/catalog/retrieve.js': { default: handleProductRetrieveRequestStub },
      '../../../src/routes/catalog/update.js': { default: handleProductSaveRequestStub },
      '../../../src/routes/catalog/remove.js': { default: handleProductRemoveRequestStub },
    })).default;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return 404 when path is missing', async () => {
    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        path: undefined,
        method: 'GET',
      },
    });
    const request = {};
    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-error'), 'path is required');
  });

  it('should return 405 when method is not allowed', async () => {
    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        path: '/products/test-product.json',
        method: 'HEAD',
      },
    });
    const request = {};
    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 405);
  });

  it('should call handleProductSaveRequest when method is PUT', async () => {
    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        path: '/products/test-product.json',
        method: 'PUT',
      },
    });
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductSaveRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductSaveRequestStub.calledOnceWith(ctx, request));
  });

  it('should call handleProductRetrieveRequestStub when method is GET', async () => {
    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        path: '/products/test-product.json',
        method: 'GET',
      },
    });
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductRetrieveRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductRetrieveRequestStub.calledOnceWith(ctx));
  });

  it('should call handleProductDeleteRequest when method is DELETE', async () => {
    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        path: '/products/test-product.json',
        method: 'DELETE',
      },
    });
    const request = {};

    const mockResponse = new Response(null, { status: 200 });
    handleProductRemoveRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 200);
    assert(handleProductRemoveRequestStub.calledOnceWith(ctx));
  });

  it('should return 400 when POST is used with non-/* path', async () => {
    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        path: '/products/test-product.json',
        method: 'POST',
      },
    });
    const request = {};

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('x-error'), 'POST only allowed for bulk operations at /*');
  });

  it('should call handleProductSaveRequest when POST is used with /* path', async () => {
    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        path: '/*',
        method: 'POST',
      },
    });
    const request = {};

    const mockResponse = new Response(null, { status: 201 });
    handleProductSaveRequestStub.returns(mockResponse);

    const response = await catalogHandler(ctx, request);

    assert.equal(response.status, 201);
    assert(handleProductSaveRequestStub.calledOnceWith(ctx, request));
  });
});
