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
import { DEFAULT_CONTEXT, createAuthInfoMock } from '../../fixtures/context.js';

describe('Product Save Tests', () => {
  /** @type {sinon.SinonStub} */
  let storageStub;
  let fetchHelixConfigStub;
  let applyImageLookupStub;
  let hasNewImagesStub;
  let handleProductSaveRequest;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.saveProductsByPath = sinon.stub();
    fetchHelixConfigStub = sinon.stub().resolves({});
    applyImageLookupStub = sinon.stub().callsFake((product) => {
      // Read lookup from product.internal.images
      const lookup = product.internal?.images || {};
      if (product.images) {
        product.images.forEach((img) => {
          const imageData = lookup[img.url];
          if (imageData?.sourceUrl) {
            img.url = imageData.sourceUrl;
          }
        });
      }
      if (product.variants) {
        product.variants.forEach((variant) => {
          if (variant.images) {
            variant.images.forEach((img) => {
              const imageData = lookup[img.url];
              if (imageData?.sourceUrl) {
                img.url = imageData.sourceUrl;
              }
            });
          }
        });
      }
    });
    hasNewImagesStub = sinon.stub().callsFake((product) => {
      // Check if any external URL is not in internal.images
      const lookup = product.internal?.images || {};
      const images = [
        ...(product.images || []),
        ...(product.variants || []).flatMap((v) => v.images || []),
      ];
      for (const img of images) {
        const { url } = img;
        if (!url.startsWith('./') && !url.startsWith('/') && !lookup[url]) {
          return true;
        }
      }
      return false;
    });

    // Mock the module with stubs
    handleProductSaveRequest = await esmock('../../../src/routes/catalog/update.js', {
      '../../../src/utils/config.js': {
        fetchHelixConfig: fetchHelixConfigStub,
      },
      '@dylandepass/helix-product-shared': {
        applyImageLookup: applyImageLookupStub,
        hasNewImages: hasNewImagesStub,
      },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleProductSaveRequest', () => {
    it('should return 405 if path is "/*" and method is not POST', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
      }, { path: '/*' });
      ctx.log = { error: sinon.stub() };
      ctx.requestInfo.method = 'PUT';
      const request = { json: sinon.stub().resolves({ sku: '1234', path: '/products/foo', name: 'foo' }) };

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 201 when product is successfully saved and paths are purged', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', path: '/products/test-product', name: 'product-name' },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });
      const request = { };

      storageStub.fetchProductByPath = sinon.stub().resolves(null);
      storageStub.saveProductsByPath.resolves([{ sku: '1234', path: '/products/test-product' }]);
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      assert(storageStub.saveProductsByPath.calledOnce);
    });

    it('should fetch helix config and cache it in context attributes for bulk operations', async () => {
      const mockHelixConfig = {
        cdn: {
          prod: {
            type: 'fastly',
            host: 'cdn.example.com',
            serviceId: 'service123',
            authToken: 'token123',
          },
        },
        content: {
          contentBusId: 'content-bus-123',
        },
      };
      fetchHelixConfigStub.resolves(mockHelixConfig);

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', path: '/products/test-product', name: 'product-name' },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });

      storageStub.fetchProductByPath = sinon.stub().resolves(null);
      storageStub.saveProductsByPath.resolves([{ sku: '1234', path: '/products/test-product' }]);
      const response = await handleProductSaveRequest(ctx);

      // Verify config was fetched
      assert(fetchHelixConfigStub.calledOnceWith(ctx, 'myorg', 'mysite'));

      // Verify config was cached in context
      assert.strictEqual(ctx.attributes.helixConfigCache, mockHelixConfig);

      // Verify response was successful
      assert.equal(response.status, 201);
    });

    it('should return 400 when path in body does not match URL path', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', path: '/products/different-product', name: 'product-name' },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
      }, { path: '/products/test-product.json' });

      const response = await handleProductSaveRequest(ctx);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'path in body (/products/different-product) must match path in URL (/products/test-product)');
    });

    it('should add path from URL when not present in body', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        data: { sku: '1234', name: 'product-name' }, // No path in body
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });

      storageStub.fetchProductByPath = sinon.stub().resolves(null);
      storageStub.saveProductsByPath.resolves([{ sku: '1234', path: '/products/test-product' }]);
      const response = await handleProductSaveRequest(ctx);

      assert.equal(response.status, 201);
      // Verify path was added from URL (without .json)
      assert.equal(ctx.data.path, '/products/test-product');
    });

    it('should skip update when product has not changed', async () => {
      const existingProduct = {
        sku: '1234',
        path: '/products/test-product',
        name: 'product-name',
        images: [{ url: './media_hash123.jpg' }],
        internal: {
          images: {
            'https://example.com/image.jpg': {
              sourceUrl: './media_hash123.jpg',
              size: 1000,
              mimeType: 'image/jpeg',
            },
          },
        },
      };

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        data: {
          sku: '1234',
          path: '/products/test-product',
          name: 'product-name',
          images: [{ url: 'https://example.com/image.jpg' }],
        },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });

      // Mock fetchProductByPath to return existing product with internal data
      storageStub.fetchProductByPath = sinon.stub().resolves(existingProduct);

      storageStub.saveProductsByPath.resolves([]);

      const response = await handleProductSaveRequest(ctx);

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.product.status, 200);
      assert.equal(body.product.message, 'No changes detected');
      // saveProductsByPath should not be called for unchanged products
      assert(storageStub.saveProductsByPath.notCalled);
    });

    it('should proceed with update when product content has changed', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        data: {
          sku: '1234',
          path: '/products/test-product',
          name: 'new-product-name', // Changed name
          images: [{ url: 'https://example.com/image.jpg' }],
        },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });

      storageStub.fetchProductByPath = sinon.stub().resolves({
        sku: '1234',
        path: '/products/test-product',
        name: 'old-product-name',
        images: [{ url: './media_hash123.jpg' }],
        internal: {
          images: {
            'https://example.com/image.jpg': {
              sourceUrl: './media_hash123.jpg',
              size: 1000,
              mimeType: 'image/jpeg',
            },
          },
        },
      });

      storageStub.saveProductsByPath.resolves([{
        sku: '1234',
        path: '/products/test-product',
        status: 200,
      }]);

      const response = await handleProductSaveRequest(ctx);

      assert.equal(response.status, 201);
      // saveProductsByPath should be called for changed products
      assert(storageStub.saveProductsByPath.calledOnce);
    });

    it('should proceed with update when product has new images', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        data: {
          sku: '1234',
          path: '/products/test-product',
          name: 'product-name',
          images: [
            { url: 'https://example.com/image.jpg' },
            { url: 'https://example.com/new-image.jpg' }, // New image
          ],
        },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/test-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/test-product.json' });

      storageStub.fetchProductByPath = sinon.stub().resolves({
        sku: '1234',
        path: '/products/test-product',
        name: 'product-name',
        images: [{ url: './media_hash123.jpg' }],
        internal: {
          images: {
            'https://example.com/image.jpg': {
              sourceUrl: './media_hash123.jpg',
              size: 1000,
              mimeType: 'image/jpeg',
            },
          },
        },
      });

      storageStub.saveProductsByPath.resolves([{
        sku: '1234',
        path: '/products/test-product',
        status: 200,
      }]);

      const response = await handleProductSaveRequest(ctx);

      assert.equal(response.status, 201);
      // saveProductsByPath should be called for products with new images
      assert(storageStub.saveProductsByPath.calledOnce);
      // Verify that internal property was transferred to the incoming product
      const savedProduct = storageStub.saveProductsByPath.getCall(0).args[0][0];
      assert.equal(savedProduct.images[0].url, './media_hash123.jpg');
      assert.equal(savedProduct.images[1].url, 'https://example.com/new-image.jpg');
    });

    it('should proceed with update when product does not exist yet', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        data: {
          sku: '1234',
          path: '/products/new-product',
          name: 'new-product-name',
          images: [{ url: 'https://example.com/image.jpg' }],
        },
        requestInfo: {
          org: 'myorg',
          site: 'mysite',
          path: '/products/new-product.json',
          method: 'PUT',
        },
        attributes: {
          storageClient: storageStub,
        },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/products/new-product.json' });

      // Product does not exist
      storageStub.fetchProductByPath = sinon.stub().resolves(null);

      storageStub.saveProductsByPath.resolves([{
        sku: '1234',
        path: '/products/new-product',
        status: 200,
      }]);

      const response = await handleProductSaveRequest(ctx);

      assert.equal(response.status, 201);
      // saveProductsByPath should be called for new products
      assert(storageStub.saveProductsByPath.calledOnce);
    });
  });
});
