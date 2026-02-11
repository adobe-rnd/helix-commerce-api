/*
 * Copyright 2025 Adobe. All rights reserved.
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
import { createProductFixture } from '../../fixtures/product.js';

/**
 * Create a valid product fixture by removing unsupported fields
 * @param {Object} overrides
 * @returns {Object}
 */
function createValidProduct(overrides = {}) {
  const product = createProductFixture(overrides);
  // Remove fields not allowed by ProductBusEntry schema
  delete product.metaKeyword;
  delete product.shortDescription;
  delete product.addToCartAllowed;
  delete product.inStock;
  delete product.externalId;
  delete product.attributeMap;
  delete product.attributes;
  delete product.prices; // Remove prices - optional field with wrong structure in fixture

  // Fix options structure - remove unsupported fields and rename items to values
  if (product.options) {
    product.options = product.options.map((option) => {
      const {
        items, ...validOption
      } = option;
      return {
        ...validOption,
        values: items ? items.map((item) => ({
          id: item.id,
          value: item.label, // Use label as value
        })) : [],
      };
    });
  }

  return product;
}

describe('Product Bulk Save Tests', () => {
  /** @type {sinon.SinonStub} */
  let storageStub;
  let fetchHelixConfigStub;
  let handleProductSaveRequest;

  beforeEach(async () => {
    storageStub = sinon.stub();
    storageStub.saveProductsByPath = sinon.stub();
    storageStub.lookupImageLocation = sinon.stub();
    fetchHelixConfigStub = sinon.stub().resolves({});

    // Mock the module with fetchHelixConfig stub
    handleProductSaveRequest = await esmock('../../../src/routes/catalog/update.js', {
      '../../../src/utils/config.js': {
        fetchHelixConfig: fetchHelixConfigStub,
      },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleProductSaveRequest (bulk)', () => {
    it('should return 405 if path is "/*" and method is not POST', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
      }, { path: '/*' });
      ctx.log = { error: sinon.stub() };
      ctx.requestInfo.method = 'PUT';
      const request = { json: sinon.stub().resolves([createProductFixture(), createProductFixture({ sku: '1234-2', path: '/products/test-2' })]) };

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('x-error'), 'method not allowed');
    });

    it('should return 400 if data is not an array', async () => {
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub() },
        data: { sku: '1234', path: '/products/test-product', name: 'product-name' },
        requestInfo: {
          path: '/*',
          method: 'POST',
        },
      }, { path: '/*' });
      const request = {};

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'data must be an array');
    });

    it('should return 400 if data exceeds max bulk size', async () => {
      const products = Array.from({ length: 51 }, (_, i) => ({ sku: `bulk-${i}`, path: `/products/bulk-${i}`, name: `Bulk ${i}` }));
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'data must be an array of 50 or fewer products');
    });

    it('should return 201 when products are successfully saved (bulk)', async () => {
      const products = [
        { sku: '1234', path: '/products/product-1', name: 'product-name' },
        { sku: '5678', path: '/products/product-2', name: 'product-name-2' },
      ];
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      assert(storageStub.saveProductsByPath.calledOnce);
    });

    it('should select async image processing when product list is large', async () => {
      const products = Array.from({ length: 11 }, (_, i) => createValidProduct({
        sku: `sku-${i}`,
        path: `/products/sku-${i}`,
        name: `Name ${i}`,
        images: [],
        variants: [],
      }));
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
          IMAGE_COLLECTOR_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      // called with asyncImages = true due to >10 products
      assert(storageStub.saveProductsByPath.calledOnce);
      const [, asyncImagesFlag] = storageStub.saveProductsByPath.firstCall.args;
      assert.equal(asyncImagesFlag, true);
    });

    it('should return 400 when a product in bulk array is missing path field', async () => {
      const products = [
        { sku: '1234', path: '/products/product-1', name: 'product-name' },
        { sku: '5678', name: 'product-name-2' }, // Missing path
      ];
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 400);
      assert.equal(response.headers.get('x-error'), 'each product must have a path field for bulk operations');
    });

    it('should handle errors during save and still return 201 with results', async () => {
      const products = [
        { sku: '1234', path: '/products/product-1', name: 'product-name' },
      ];
      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().rejects(new Error('Queue error')),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));
      const response = await handleProductSaveRequest(ctx, request, storageStub);

      // Should still return 201 even though there was an error
      assert.equal(response.status, 201);
      // Verify error was logged
      assert(ctx.log.error.calledOnce);
    });

    it('should process up to the limit when there are more images than limit', async () => {
      // Create products with many images to exceed the limit
      // Request limit = 1000 - products.length - 100
      // With 5 products: 1000 - 5 - 100 = 895 requests available for image lookups
      const products = Array.from({ length: 5 }, (_, i) => createValidProduct({
        sku: `sku-${i}`,
        path: `/products/sku-${i}`,
        name: `Name ${i}`,
        // Each product has 200 images = 1000 total images across 5 products
        images: Array.from({ length: 200 }, (__, j) => ({
          url: `https://example.com/image-${i}-${j}.jpg`,
          label: `Image ${j}`,
        })),
        variants: [],
      }));

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
          IMAGE_COLLECTOR_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      // Mock lookupImageLocation to return null (not processed yet)
      storageStub.lookupImageLocation.resolves(null);
      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);
      // Verify that lookupImageLocation was called, but not for all 1000 images
      // It should stop after the request limit is exhausted
      const lookupCallCount = storageStub.lookupImageLocation.callCount;
      assert(lookupCallCount > 0, 'lookupImageLocation should be called');
      assert(lookupCallCount <= 895, `lookupImageLocation should not exceed limit (called ${lookupCallCount} times)`);
    });

    it('should replace already processed images with hashed urls before saving', async () => {
      const products = [
        createValidProduct({
          sku: 'sku-1',
          path: '/products/sku-1',
          name: 'Product 1',
          images: [
            { url: 'https://example.com/image1.jpg', label: 'Image 1' },
            { url: 'https://example.com/image2.jpg', label: 'Image 2' },
            { url: 'https://example.com/image3.jpg', label: 'Image 3' },
            { url: 'https://example.com/image4.jpg', label: 'Image 4' },
            { url: 'https://example.com/image5.jpg', label: 'Image 5' },
            { url: 'https://example.com/image6.jpg', label: 'Image 6' },
          ],
          variants: [],
        }),
        createValidProduct({
          sku: 'sku-2',
          path: '/products/sku-2',
          name: 'Product 2',
          images: [
            { url: 'https://example.com/image7.jpg', label: 'Image 7' },
            { url: 'https://example.com/image8.jpg', label: 'Image 8' },
            { url: 'https://example.com/image9.jpg', label: 'Image 9' },
            { url: 'https://example.com/image10.jpg', label: 'Image 10' },
            { url: 'https://example.com/image11.jpg', label: 'Image 11' },
          ],
          variants: [],
        }),
      ];

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
          IMAGE_COLLECTOR_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      // Mock lookupImageLocation to return hashed URLs for all images
      storageStub.lookupImageLocation.callsFake((_, __, ___, url) => {
        const imageMap = {
          'https://example.com/image1.jpg': './media_abc123.jpg',
          'https://example.com/image2.jpg': './media_def456.jpg',
          'https://example.com/image3.jpg': './media_ghi789.jpg',
          'https://example.com/image4.jpg': './media_jkl012.jpg',
          'https://example.com/image5.jpg': './media_mno345.jpg',
          'https://example.com/image6.jpg': './media_pqr678.jpg',
          'https://example.com/image7.jpg': './media_stu901.jpg',
          'https://example.com/image8.jpg': './media_vwx234.jpg',
          'https://example.com/image9.jpg': './media_yza567.jpg',
          'https://example.com/image10.jpg': './media_bcd890.jpg',
          'https://example.com/image11.jpg': './media_efg123.jpg',
        };
        return Promise.resolve(imageMap[url] || null);
      });

      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);

      // Verify lookupImageLocation was called for each image (11 total)
      assert.equal(storageStub.lookupImageLocation.callCount, 11);

      // Verify that saveProductsByPath was called with products that have replaced URLs
      assert(storageStub.saveProductsByPath.calledOnce);
      const savedProducts = storageStub.saveProductsByPath.firstCall.args[0];

      // Check that image URLs were replaced
      assert.equal(savedProducts[0].images[0].url, './media_abc123.jpg');
      assert.equal(savedProducts[0].images[5].url, './media_pqr678.jpg');
      assert.equal(savedProducts[1].images[0].url, './media_stu901.jpg');
      assert.equal(savedProducts[1].images[4].url, './media_efg123.jpg');
    });

    it('should save external URLs and process asynchronously when no images are already processed', async () => {
      const products = [
        createValidProduct({
          sku: 'sku-1',
          path: '/products/sku-1',
          name: 'Product 1',
          images: [
            { url: 'https://example.com/new-image1.jpg', label: 'New Image 1' },
            { url: 'https://example.com/new-image2.jpg', label: 'New Image 2' },
            { url: 'https://example.com/new-image3.jpg', label: 'New Image 3' },
            { url: 'https://example.com/new-image4.jpg', label: 'New Image 4' },
            { url: 'https://example.com/new-image5.jpg', label: 'New Image 5' },
            { url: 'https://example.com/new-image6.jpg', label: 'New Image 6' },
          ],
          variants: [],
        }),
        createValidProduct({
          sku: 'sku-2',
          path: '/products/sku-2',
          name: 'Product 2',
          images: [
            { url: 'https://example.com/new-image7.jpg', label: 'New Image 7' },
            { url: 'https://example.com/new-image8.jpg', label: 'New Image 8' },
            { url: 'https://example.com/new-image9.jpg', label: 'New Image 9' },
            { url: 'https://example.com/new-image10.jpg', label: 'New Image 10' },
            { url: 'https://example.com/new-image11.jpg', label: 'New Image 11' },
          ],
          variants: [],
        }),
      ];

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
          IMAGE_COLLECTOR_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      // Mock lookupImageLocation to return null (not processed yet)
      storageStub.lookupImageLocation.resolves(null);
      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);

      // Verify lookupImageLocation was called for each image (11 total)
      assert.equal(storageStub.lookupImageLocation.callCount, 11);

      // Verify that saveProductsByPath was called with original external URLs
      assert(storageStub.saveProductsByPath.calledOnce);
      const savedProducts = storageStub.saveProductsByPath.firstCall.args[0];
      const asyncImagesFlag = storageStub.saveProductsByPath.firstCall.args[1];

      // Check that image URLs were NOT replaced (still external)
      assert.equal(savedProducts[0].images[0].url, 'https://example.com/new-image1.jpg');
      assert.equal(savedProducts[0].images[5].url, 'https://example.com/new-image6.jpg');
      assert.equal(savedProducts[1].images[0].url, 'https://example.com/new-image7.jpg');
      assert.equal(savedProducts[1].images[4].url, 'https://example.com/new-image11.jpg');

      // Verify async processing was requested
      assert.equal(asyncImagesFlag, true);

      // Verify IMAGE_COLLECTOR_QUEUE was called
      assert(ctx.env.IMAGE_COLLECTOR_QUEUE.send.called);
    });

    it('should skip image lookups for products with only relative path images', async () => {
      const products = [
        createValidProduct({
          sku: 'sku-1',
          path: '/products/sku-1',
          name: 'Product 1',
          images: [
            { url: './media_abc123.jpg', label: 'Already Processed 1' },
            { url: './media_def456.jpg', label: 'Already Processed 2' },
          ],
          variants: [],
        }),
      ];

      const ctx = DEFAULT_CONTEXT({
        authInfo: createAuthInfoMock(['catalog:write']),
        log: { error: sinon.stub(), info: sinon.stub() },
        requestInfo: {
          path: '/*',
          method: 'POST',
          org: 'myorg',
          site: 'mysite',
        },
        attributes: { storageClient: storageStub },
        env: {
          INDEXER_QUEUE: {
            send: sinon.stub().resolves(),
          },
          IMAGE_COLLECTOR_QUEUE: {
            send: sinon.stub().resolves(),
          },
        },
      }, { path: '/*' });
      ctx.data = products;
      const request = {};

      storageStub.saveProductsByPath.resolves(products.map((p) => ({ sku: p.sku, path: p.path })));

      const response = await handleProductSaveRequest(ctx, request, storageStub);

      assert.equal(response.status, 201);

      // Verify lookupImageLocation was NOT called for relative path images
      assert.equal(storageStub.lookupImageLocation.callCount, 0);

      // Verify that saveProductsByPath was called with unchanged URLs
      assert(storageStub.saveProductsByPath.calledOnce);
      const savedProducts = storageStub.saveProductsByPath.firstCall.args[0];

      // Check that image URLs were not changed
      assert.equal(savedProducts[0].images[0].url, './media_abc123.jpg');
      assert.equal(savedProducts[0].images[1].url, './media_def456.jpg');
    });
  });
});
