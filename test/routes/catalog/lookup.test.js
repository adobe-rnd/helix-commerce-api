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
import handleProductLookupRequest from '../../../src/routes/catalog/lookup.js';

describe('handleProductLookupRequest Tests', () => {
  /** @type {sinon.SinonStub} */
  let storageStub;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.fetchProduct = sinon.stub();
    storageStub.lookupSku = sinon.stub();
    storageStub.listAllProducts = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return a product when urlkey is provided', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { urlkey: 'some-url-key' },
      log: { error: sinon.stub() },
      env: { ENVIRONMENT: 'prod' },
      config: {
        org: 'test-org',
        site: 'test-site',
        storeCode: 'test-store-code',
        storeViewCode: 'test-store-view-code',
      },
      attributes: {
        storageClient: storageStub,
      },
    });

    storageStub.lookupSku.resolves('Some Sku');
    storageStub.fetchProduct.resolves({ sku: 'Some Sku', name: 'Test Product' });

    const response = await handleProductLookupRequest(ctx);

    assert.equal(response.headers.get('Location'), 'https://www.example.com/test-org/test-site/catalog/test-store-code/test-store-view-code/products/some-sku.json');
    assert.equal(response.status, 301);

    assert(storageStub.lookupSku.calledOnceWith('some-url-key'));
  });

  it('should use the correct origin when ENVIRONMENT is dev', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { urlkey: 'some-url-key' },
      log: { error: sinon.stub() },
      env: { ENVIRONMENT: 'dev' },
      config: {
        org: 'test-org',
        site: 'test-site',
        storeCode: 'test-store-code',
        storeViewCode: 'test-store-view-code',
      },
      attributes: {
        storageClient: storageStub,
      },
    });

    storageStub.lookupSku.resolves('1234');
    storageStub.fetchProduct.resolves({ sku: '1234', name: 'Test Product' });

    const response = await handleProductLookupRequest(ctx);

    assert.equal(response.headers.get('Location'), 'https://adobe-commerce-api-ci.adobeaem.workers.dev/test-org/test-site/catalog/test-store-code/test-store-view-code/products/1234.json');
    assert.equal(response.status, 301);

    assert(storageStub.lookupSku.calledOnceWith('some-url-key'));
  });

  it('should return a list of all products when no urlKey is provided', async () => {
    const ctx = DEFAULT_CONTEXT({
      log: { error: sinon.stub() },
      config: {},
      attributes: {
        storageClient: storageStub,
      },
    });

    const mockProducts = [
      { sku: '1234', name: 'Product 1' },
      { sku: '5678', name: 'Product 2' },
    ];
    storageStub.listAllProducts.resolves(mockProducts);

    const response = await handleProductLookupRequest(ctx);

    assert.equal(response.status, 200);
    const responseBody = await response.json();
    assert.deepEqual(responseBody, {
      total: 2,
      products: mockProducts,
    });

    assert(storageStub.listAllProducts.calledOnceWith());
  });
});
