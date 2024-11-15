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

/* eslint-disable max-classes-per-file, max-len, class-methods-use-this, no-shadow, no-plusplus */

// @ts-nocheck

import assert from 'node:assert';
import sinon from 'sinon';
import esmock from 'esmock';

describe('StorageClient Class Tests', () => {
  let StorageClient;
  let callPreviewPublishStub;
  let errorWithResponseStub;
  let BatchProcessorMock;
  let config;

  beforeEach(async () => {
    callPreviewPublishStub = sinon.stub();
    errorWithResponseStub = sinon.stub();

    BatchProcessorMock = class {
      constructor(ctx, batchHandler, batchSize = 50) {
        this.ctx = ctx;
        this.batchHandler = batchHandler;
        this.batchSize = batchSize;
      }

      async process(items) {
        return this.batchHandler(items);
      }
    };

    const module = await esmock('../../../src/catalog/storage/r2.js', {
      '../../../src/utils/admin.js': {
        callPreviewPublish: (config, method, sku, urlKey) => callPreviewPublishStub(config, method, sku, urlKey),
      },
      '../../../src/utils/http.js': {
        errorWithResponse: (status, message) => errorWithResponseStub(status, message),
      },
      '../../../src/utils/batch.js': {
        BatchProcessor: BatchProcessorMock,
      },
    });

    StorageClient = module.default;

    config = {
      org: 'org',
      site: 'site',
      storeCode: 'store',
      storeViewCode: 'view',
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('fetchProduct', () => {
    it('should successfully fetch a product', async () => {
      const ctx = {
        log: { debug: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            get: sinon.stub().resolves({
              text: sinon.stub().resolves(JSON.stringify({ sku: 'sku1', name: 'Test Product' })),
            }),
          },
        },
      };
      const sku = 'sku1';

      const client = new StorageClient(ctx, config);
      const product = await client.fetchProduct(sku);

      assert(ctx.log.debug.calledOnceWithExactly('Fetching product from R2:', 'org/site/store/view/products/sku1.json'));
      assert(ctx.env.CATALOG_BUCKET.get.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert.deepStrictEqual(product, { sku: 'sku1', name: 'Test Product' });
    });

    it('should throw 404 error if product not found', async () => {
      const ctx = {
        log: { debug: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            get: sinon.stub().resolves(null),
          },
        },
      };
      const sku = 'nonexistent';

      const error = new Error('Product not found');
      errorWithResponseStub.withArgs(404, 'Product not found').returns(error);

      const client = new StorageClient(ctx, config);

      let thrownError;
      try {
        await client.fetchProduct(sku);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.log.debug.calledOnceWithExactly('Fetching product from R2:', 'org/site/store/view/products/nonexistent.json'));
      assert(ctx.env.CATALOG_BUCKET.get.calledOnceWithExactly('org/site/store/view/products/nonexistent.json'));
      assert.strictEqual(thrownError, error);
    });

    it('should throw error if JSON parsing fails', async () => {
      const ctx = {
        log: { debug: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            get: sinon.stub().resolves({
              text: sinon.stub().resolves('invalid json'),
            }),
          },
        },
      };

      const sku = 'sku1';
      const client = new StorageClient(ctx, config);

      let thrownError;
      try {
        await client.fetchProduct(sku);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.log.debug.calledOnceWithExactly('Fetching product from R2:', 'org/site/store/view/products/sku1.json'));
      assert(ctx.env.CATALOG_BUCKET.get.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert(thrownError instanceof SyntaxError);
    });

    it('should propagate errors from CATALOG_BUCKET.get', async () => {
      const ctx = {
        log: { debug: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            get: sinon.stub().rejects(new Error('Bucket access error')),
          },
        },
      };

      const sku = 'sku1';
      const client = new StorageClient(ctx, config);

      let thrownError;
      try {
        await client.fetchProduct(sku);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.log.debug.calledOnceWithExactly('Fetching product from R2:', 'org/site/store/view/products/sku1.json'));
      assert(ctx.env.CATALOG_BUCKET.get.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Bucket access error');
    });
  });

  describe('saveProducts', () => {
    it('should successfully save multiple products with urlKeys', async () => {
      const ctx = {
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            put: sinon.stub().resolves({ status: 200 }),
          },
        },
      };
      const products = [
        { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
        { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
      ];

      callPreviewPublishStub.resolves({
        paths: {
          '/products/product-1/sku1': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
          '/products/product-2/sku2': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
        },
      });

      const storeProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          status: 200,
          message: 'Product saved successfully.',
          '/products/product-1/sku1': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
        },
        {
          sku: 'sku2',
          status: 200,
          message: 'Product saved successfully.',
          '/products/product-2/sku2': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
        },
      ]);

      const module = await esmock('../../../src/catalog/storage/r2.js', {
        '../../../src/utils/admin.js': {
          callPreviewPublish: callPreviewPublishStub,
        },
        '../../../src/utils/http.js': {
          errorWithResponse: errorWithResponseStub,
        },
        '../../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async storeProductsBatch(batch) {
          return storeProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx, config);
      const saveResults = await client.saveProducts(products);

      assert(storeProductsBatchStub.calledOnceWithExactly(products));
      assert(ctx.log.info.calledOnceWithExactly('Completed saving 2 products.'));
      assert.deepStrictEqual(saveResults, [
        {
          sku: 'sku1',
          status: 200,
          message: 'Product saved successfully.',
          '/products/product-1/sku1': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
        },
        {
          sku: 'sku2',
          status: 200,
          message: 'Product saved successfully.',
          '/products/product-2/sku2': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
        },
      ]);
      assert(ctx.log.error.notCalled);
    });

    it('should handle products without urlKeys', async () => {
      const ctx = {
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            put: sinon.stub().resolves({ status: 200 }),
          },
        },
      };
      const products = [
        { sku: 'sku1', name: 'Product 1' }, // No urlKey
      ];

      callPreviewPublishStub.resolves({
        paths: {
          '/products/sku1': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
        },
      });

      const storeProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          status: 200,
          message: 'Product saved successfully.',
          '/products/sku1': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
        },
      ]);

      const module = await esmock('../../../src/catalog/storage/r2.js', {
        '../../../src/utils/admin.js': {
          callPreviewPublish: callPreviewPublishStub,
        },
        '../../../src/utils/http.js': {
          errorWithResponse: errorWithResponseStub,
        },
        '../../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async storeProductsBatch(batch) {
          return storeProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx, config);
      const saveResults = await client.saveProducts(products);

      assert(storeProductsBatchStub.calledOnceWithExactly(products));
      assert(ctx.log.info.calledOnceWithExactly('Completed saving 1 products.'));
      assert.deepStrictEqual(saveResults, [
        {
          sku: 'sku1',
          status: 200,
          message: 'Product saved successfully.',
          '/products/sku1': {
            preview: {
              status: 200,
            },
            live: {
              status: 200,
            },
          },
        },
      ]);
      assert(ctx.log.error.notCalled);
    });

    it('should handle errors during saving a product', async () => {
      const ctx = {
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            put: sinon.stub().resolves({ status: 200 }),
          },
        },
      };
      const products = [
        { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
        { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
      ];

      callPreviewPublishStub.withArgs(config, 'POST', 'sku1', 'product-1').resolves({ paths: { path1: '/products/sku1' } });
      callPreviewPublishStub.withArgs(config, 'POST', 'sku2', 'product-2').rejects(new Error('Publish error'));

      const storeProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          status: 200,
          message: 'Product saved successfully.',
          '/products/product-1/sku1': {
            preview: { status: 200 },
            live: { status: 200 },
          },
        },
        {
          sku: 'sku2',
          status: 500,
          message: 'Error: Publish error',
        },
      ]);

      const module = await esmock('../../../src/catalog/storage/r2.js', {
        '../../../src/utils/admin.js': {
          callPreviewPublish: callPreviewPublishStub,
        },
        '../../../src/utils/http.js': {
          errorWithResponse: errorWithResponseStub,
        },
        '../../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async storeProductsBatch(batch) {
          return storeProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx, config);
      const saveResults = await client.saveProducts(products);

      assert(storeProductsBatchStub.calledOnceWithExactly(products));
      assert(ctx.log.info.calledOnceWithExactly('Completed saving 2 products.'));
      assert.deepStrictEqual(saveResults, [
        {
          sku: 'sku1',
          status: 200,
          message: 'Product saved successfully.',
          '/products/product-1/sku1': {
            live: {
              status: 200,
            },
            preview: {
              status: 200,
            },
          },
        },
        {
          sku: 'sku2',
          status: 500,
          message: 'Error: Publish error',
        },
      ]);
    });

    it('should handle errors from BatchProcessor', async () => {
      const ctx = {
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            put: sinon.stub().resolves({ status: 200 }),
          },
        },
      };
      const products = [
        { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
      ];

      const storeProductsBatchStub = sinon.stub().rejects(new Error('Batch processing failed'));

      const module = await esmock('../../../src/catalog/storage/r2.js', {
        '../../../src/utils/admin.js': {
          callPreviewPublish: callPreviewPublishStub,
        },
        '../../../src/utils/http.js': {
          errorWithResponse: errorWithResponseStub,
        },
        '../../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async storeProductsBatch(batch) {
          return storeProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx, config);

      let thrownError;
      try {
        await client.saveProducts(products);
      } catch (e) {
        thrownError = e;
      }

      assert(storeProductsBatchStub.calledOnceWithExactly(products));
      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Batch processing failed');
    });

    describe('storeProductsBatch', () => {
      let ctx;

      beforeEach(async () => {
        ctx = {
          log: { debug: sinon.stub(), error: sinon.stub() },
          env: {
            CATALOG_BUCKET: {
              put: sinon.stub(),
            },
          },
        };
      });

      it('should successfully save products with urlKeys', async () => {
        const client = new StorageClient(ctx, config);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
        ];

        ctx.env.CATALOG_BUCKET.put.resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          `${config.org}/${config.site}/${config.storeCode}/${config.storeViewCode}/urlkeys/product-1`,
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          `${config.org}/${config.site}/${config.storeCode}/${config.storeViewCode}/urlkeys/product-2`,
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ).resolves({ status: 200 });

        callPreviewPublishStub.onFirstCall().resolves({
          paths: {
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });

        callPreviewPublishStub.onSecondCall().resolves({
          paths: {
            '/products/product-2/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });

        const results = await client.storeProductsBatch(batch);

        assert(ctx.env.CATALOG_BUCKET.put.callCount === 4);
        assert(ctx.env.CATALOG_BUCKET.put.firstCall.calledWithExactly(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.secondCall.calledWithExactly(
          'org/site/store/view/products/sku2.json',
          JSON.stringify(batch[1]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ));

        assert(ctx.env.CATALOG_BUCKET.put.getCall(2).calledWithExactly(
          'org/site/store/view/urlkeys/product-1',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.getCall(3).calledWithExactly(
          'org/site/store/view/urlkeys/product-2',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ));

        assert(callPreviewPublishStub.calledTwice);
        assert(callPreviewPublishStub.firstCall.calledWithExactly(config, 'POST', 'sku1', 'product-1'));
        assert(callPreviewPublishStub.secondCall.calledWithExactly(config, 'POST', 'sku2', 'product-2'));
        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 200,
            message: 'Product saved successfully.',
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
          {
            sku: 'sku2',
            status: 200,
            message: 'Product saved successfully.',
            '/products/product-2/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        ]);

        assert(ctx.log.error.notCalled);
      });

      it('should successfully save products without urlKeys', async () => {
        const client = new StorageClient(ctx, config);
        const batch = [
          { sku: 'sku1', name: 'Product 1' },
          { sku: 'sku2', name: 'Product 2' },
        ];

        ctx.env.CATALOG_BUCKET.put.resolves({ status: 200 });

        callPreviewPublishStub.onFirstCall().resolves({
          paths: {
            '/products/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });

        callPreviewPublishStub.onSecondCall().resolves({
          paths: {
            '/products/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });

        const results = await client.storeProductsBatch(batch);

        assert(ctx.env.CATALOG_BUCKET.put.calledTwice);
        assert(ctx.env.CATALOG_BUCKET.put.firstCall.calledWithExactly(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.secondCall.calledWithExactly(
          'org/site/store/view/products/sku2.json',
          JSON.stringify(batch[1]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku2', name: 'Product 2' },
          },
        ));

        assert(ctx.env.CATALOG_BUCKET.put.callCount === 2);

        assert(callPreviewPublishStub.calledTwice);
        assert(callPreviewPublishStub.firstCall.calledWithExactly(config, 'POST', 'sku1', undefined));
        assert(callPreviewPublishStub.secondCall.calledWithExactly(config, 'POST', 'sku2', undefined));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 200,
            message: 'Product saved successfully.',
            '/products/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
          {
            sku: 'sku2',
            status: 200,
            message: 'Product saved successfully.',
            '/products/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        ]);

        assert(ctx.log.error.notCalled);
      });

      it('should handle errors during product save (CATALOG_BUCKET.put failure)', async () => {
        const client = new StorageClient(ctx, config);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
        ];

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/products/sku2.json',
          JSON.stringify(batch[1]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ).rejects(new Error('PUT failed for sku2'));

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/urlkeys/product-1',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        callPreviewPublishStub.withArgs(config, 'POST', 'sku1', 'product-1').resolves({
          paths: {
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });

        const results = await client.storeProductsBatch(batch);

        assert(ctx.env.CATALOG_BUCKET.put.calledThrice);
        assert(ctx.env.CATALOG_BUCKET.put.firstCall.calledWithExactly(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.secondCall.calledWithExactly(
          'org/site/store/view/products/sku2.json',
          JSON.stringify(batch[1]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.thirdCall.calledWithExactly(
          'org/site/store/view/urlkeys/product-1',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));

        assert(callPreviewPublishStub.calledOnce);
        assert(callPreviewPublishStub.calledWithExactly(config, 'POST', 'sku1', 'product-1'));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 200,
            message: 'Product saved successfully.',
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
          {
            sku: 'sku2',
            status: 500,
            message: 'Error: PUT failed for sku2',
          },
        ]);

        assert(ctx.log.error.calledOnce);
        assert(ctx.log.error.calledWithExactly('Error storing product SKU: sku2:', sinon.match.instanceOf(Error)));
      });

      it('should handle errors during metadata save (CATALOG_BUCKET.put for urlKey failure)', async () => {
        const client = new StorageClient(ctx, config);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
        ];

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/urlkeys/product-1',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).rejects(new Error('Metadata PUT failed for product-1'));

        const results = await client.storeProductsBatch(batch);

        assert(ctx.env.CATALOG_BUCKET.put.calledTwice);
        assert(ctx.env.CATALOG_BUCKET.put.firstCall.calledWithExactly(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.secondCall.calledWithExactly(
          'org/site/store/view/urlkeys/product-1',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));

        assert(callPreviewPublishStub.notCalled);

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 500,
            message: 'Error: Metadata PUT failed for product-1',
          },
        ]);

        assert(ctx.log.error.calledOnce);
        assert(ctx.log.error.calledWithExactly('Error storing product SKU: sku1:', sinon.match.instanceOf(Error)));
      });

      it('should handle errors from callPreviewPublish', async () => {
        const client = new StorageClient(ctx, config);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
        ];

        ctx.env.CATALOG_BUCKET.put.resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          `${config.org}/${config.site}/${config.storeCode}/${config.storeViewCode}/urlkeys/product-1`,
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          `${config.org}/${config.site}/${config.storeCode}/${config.storeViewCode}/urlkeys/product-2`,
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ).resolves({ status: 200 });

        callPreviewPublishStub.withArgs(config, 'POST', 'sku1', 'product-1').resolves({
          paths: {
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });

        callPreviewPublishStub.withArgs(config, 'POST', 'sku2', 'product-2').resolves({
          paths: {
            '/products/product-2/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 400,
                message: 'Publish failed for sku2',
              },
            },
          },
        });

        const results = await client.storeProductsBatch(batch);

        assert(ctx.env.CATALOG_BUCKET.put.callCount === 4);
        assert(ctx.env.CATALOG_BUCKET.put.firstCall.calledWithExactly(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.secondCall.calledWithExactly(
          'org/site/store/view/products/sku2.json',
          JSON.stringify(batch[1]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ));

        assert(ctx.env.CATALOG_BUCKET.put.getCall(2).calledWithExactly(
          'org/site/store/view/urlkeys/product-1',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.getCall(3).calledWithExactly(
          'org/site/store/view/urlkeys/product-2',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ));

        assert(callPreviewPublishStub.calledTwice);
        assert(callPreviewPublishStub.firstCall.calledWithExactly(config, 'POST', 'sku1', 'product-1'));
        assert(callPreviewPublishStub.secondCall.calledWithExactly(config, 'POST', 'sku2', 'product-2'));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 200,
            message: 'Product saved successfully.',
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
          {
            sku: 'sku2',
            status: 200,
            message: 'Product saved successfully.',
            '/products/product-2/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 400,
                message: 'Publish failed for sku2',
              },
            },
          },
        ]);
      });

      it('should handle an empty batch', async () => {
        const client = new StorageClient(ctx, config);
        const batch = [];

        const results = await client.storeProductsBatch(batch);

        assert(ctx.env.CATALOG_BUCKET.put.notCalled);
        assert(callPreviewPublishStub.notCalled);
        assert.deepStrictEqual(results, []);
        assert(ctx.log.error.notCalled);
      });

      it('should handle mixed scenarios in a batch', async () => {
        const client = new StorageClient(ctx, config);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2' }, // No urlKey
          { sku: 'sku3', name: 'Product 3', urlKey: 'product-3' },
        ];

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/products/sku2.json',
          JSON.stringify(batch[1]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku2', name: 'Product 2' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/products/sku3.json',
          JSON.stringify(batch[2]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku3', name: 'Product 3', urlKey: 'product-3' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/urlkeys/product-1',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/urlkeys/product-3',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku3', name: 'Product 3', urlKey: 'product-3' },
          },
        ).resolves({ status: 200 });

        callPreviewPublishStub.withArgs(config, 'POST', 'sku1', 'product-1').resolves({
          paths: {
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });
        callPreviewPublishStub.withArgs(config, 'POST', 'sku2', undefined).resolves({
          paths: {
            '/products/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });
        callPreviewPublishStub.withArgs(config, 'POST', 'sku3', 'product-3').resolves({
          paths: {
            '/products/product-3/sku3': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        });

        const results = await client.storeProductsBatch(batch);

        assert(ctx.env.CATALOG_BUCKET.put.callCount === 5);
        assert(ctx.env.CATALOG_BUCKET.put.firstCall.calledWithExactly(
          'org/site/store/view/products/sku1.json',
          JSON.stringify(batch[0]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.secondCall.calledWithExactly(
          'org/site/store/view/products/sku2.json',
          JSON.stringify(batch[1]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku2', name: 'Product 2' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.thirdCall.calledWithExactly(
          'org/site/store/view/products/sku3.json',
          JSON.stringify(batch[2]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku3', name: 'Product 3', urlKey: 'product-3' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.getCall(3).calledWithExactly(
          'org/site/store/view/urlkeys/product-1',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.getCall(4).calledWithExactly(
          'org/site/store/view/urlkeys/product-3',
          '',
          {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { sku: 'sku3', name: 'Product 3', urlKey: 'product-3' },
          },
        ));

        assert(callPreviewPublishStub.calledThrice);
        assert(callPreviewPublishStub.firstCall.calledWithExactly(config, 'POST', 'sku2', undefined));
        assert(callPreviewPublishStub.secondCall.calledWithExactly(config, 'POST', 'sku1', 'product-1'));
        assert(callPreviewPublishStub.thirdCall.calledWithExactly(config, 'POST', 'sku3', 'product-3'));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 200,
            message: 'Product saved successfully.',
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
          {
            sku: 'sku2',
            status: 200,
            message: 'Product saved successfully.',
            '/products/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
          {
            sku: 'sku3',
            status: 200,
            message: 'Product saved successfully.',
            '/products/product-3/sku3': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        ]);

        assert(ctx.log.error.notCalled);
      });
    });
  });

  describe('deleteProducts', () => {
    it('should successfully delete multiple products with urlKeys', async () => {
      const ctx = {
        log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub(),
            delete: sinon.stub().resolves({ status: 200 }),
          },
        },
      };
      const skus = ['sku1', 'sku2'];

      ctx.env.CATALOG_BUCKET.head.withArgs('org1/site1/store1/view1/products/sku1.json').resolves({
        customMetadata: { urlKey: 'product-1' },
      });
      ctx.env.CATALOG_BUCKET.head.withArgs('org1/site1/store1/view1/products/sku2.json').resolves({
        customMetadata: { urlKey: 'product-2' },
      });

      callPreviewPublishStub.resolves({
        paths: {
          '/products/product-1/sku1': {
            preview: {
              status: 204,
            },
            live: {
              status: 204,
            },
          },
          '/products/product-2/sku2': {
            preview: {
              status: 204,
            },
            live: {
              status: 204,
            },
          },
        },
      });

      const deleteProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          status: 200,
          message: 'Product deleted successfully.',
          '/products/product-1/sku1': {
            preview: {
              status: 204,
            },
            live: {
              status: 204,
            },
          },
        },
        {
          sku: 'sku2',
          status: 200,
          message: 'Product deleted successfully.',
          '/products/product-2/sku2': {
            preview: {
              status: 204,
            },
            live: {
              status: 204,
            },
          },
        },
      ]);

      const module = await esmock('.. /../../src/catalog/storage/r2.js', {
        '../../../src/utils/admin.js': {
          callPreviewPublish: callPreviewPublishStub,
        },
        '../../../src/utils/http.js': {
          errorWithResponse: errorWithResponseStub,
        },
        '../../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async deleteProductsBatch(batch) {
          return deleteProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx, config);
      const deleteResults = await client.deleteProducts(skus);

      assert(deleteProductsBatchStub.calledOnceWithExactly(skus));
      assert(ctx.log.info.calledOnceWithExactly('Completed deletion of 2 products.'));
      assert.deepStrictEqual(deleteResults, [
        {
          sku: 'sku1',
          status: 200,
          message: 'Product deleted successfully.',
          '/products/product-1/sku1': {
            preview: {
              status: 204,
            },
            live: {
              status: 204,
            },
          },
        },
        {
          sku: 'sku2',
          status: 200,
          message: 'Product deleted successfully.',
          '/products/product-2/sku2': {
            preview: {
              status: 204,
            },
            live: {
              status: 204,
            },
          },
        },
      ]);
      assert(ctx.log.warn.notCalled);
      assert(ctx.log.error.notCalled);
    });

    it('should skip deletion for non-existent SKUs', async () => {
      const ctx = {
        log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub(),
            delete: sinon.stub().resolves({ status: 200 }),
          },
        },
      };
      const skus = ['sku1', 'nonexistent'];

      ctx.env.CATALOG_BUCKET.head.withArgs('org/site/store/view/products/sku1.json').resolves({
        customMetadata: { urlKey: 'product-1' },
      });
      ctx.env.CATALOG_BUCKET.head.withArgs('org/site/store/view/products/nonexistent.json').resolves(null);

      const deleteProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1', status: 200, message: 'Product deleted successfully.', path1: '/products/sku1',
        },
        { sku: 'nonexistent', statusCode: 404, message: 'Product not found.' },
      ]);

      const module = await esmock('../../../src/catalog/storage/r2.js', {
        '../../../src/utils/admin.js': {
          callPreviewPublish: callPreviewPublishStub,
        },
        '../../../src/utils/http.js': {
          errorWithResponse: errorWithResponseStub,
        },
        '../../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async deleteProductsBatch(batch) {
          return deleteProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx, config);
      const deleteResults = await client.deleteProducts(skus);

      assert(deleteProductsBatchStub.calledOnceWithExactly(skus));
      assert(ctx.log.info.calledOnceWithExactly('Completed deletion of 2 products.'));
      assert.deepStrictEqual(deleteResults, [
        {
          sku: 'sku1', status: 200, message: 'Product deleted successfully.', path1: '/products/sku1',
        },
        { sku: 'nonexistent', statusCode: 404, message: 'Product not found.' },
      ]);
      assert(ctx.log.error.notCalled);
    });

    it('should handle errors during deletion of a product', async () => {
      const ctx = {
        log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub(),
            delete: sinon.stub().resolves({ status: 200 }),
          },
        },
      };
      const skus = ['sku1', 'sku2'];

      ctx.env.CATALOG_BUCKET.head.withArgs('org/site/store/view/products/sku1.json').resolves({
        customMetadata: { urlKey: 'product-1' },
      });
      ctx.env.CATALOG_BUCKET.head.withArgs('org/site/store/view/products/sku2.json').resolves({
        customMetadata: { urlKey: 'product-2' },
      });

      callPreviewPublishStub.withArgs(config, 'DELETE', 'sku1', 'product-1').resolves({ paths: { path1: '/path1' } });
      callPreviewPublishStub.withArgs(config, 'DELETE', 'sku2', 'product-2').rejects(new Error('Publish error'));

      const deleteProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1', status: 200, message: 'Product deleted successfully.', path1: '/products/sku1',
        },
        { sku: 'sku2', status: 500, message: 'Error: Publish error' },
      ]);

      const module = await esmock('../../../src/catalog/storage/r2.js', {
        '../../../src/utils/admin.js': {
          callPreviewPublish: callPreviewPublishStub,
        },
        '../../../src/utils/http.js': {
          errorWithResponse: errorWithResponseStub,
        },
        '../../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async deleteProductsBatch(batch) {
          return deleteProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx, config);
      const deleteResults = await client.deleteProducts(skus);

      assert(deleteProductsBatchStub.calledOnceWithExactly(skus));
      assert(ctx.log.info.calledOnceWithExactly('Completed deletion of 2 products.'));
      assert.deepStrictEqual(deleteResults, [
        {
          sku: 'sku1', status: 200, message: 'Product deleted successfully.', path1: '/products/sku1',
        },
        { sku: 'sku2', status: 500, message: 'Error: Publish error' },
      ]);
    });

    it('should handle errors from BatchProcessor', async () => {
      const ctx = {
        log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub(),
            delete: sinon.stub().resolves({ status: 200 }),
          },
        },
      };
      const skus = ['sku1'];

      const deleteProductsBatchStub = sinon.stub().rejects(new Error('Batch processing failed'));

      const module = await esmock('../../../src/catalog/storage/r2.js', {
        '../../../src/utils/admin.js': {
          callPreviewPublish: callPreviewPublishStub,
        },
        '../../../src/utils/http.js': {
          errorWithResponse: errorWithResponseStub,
        },
        '../../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async deleteProductsBatch(batch) {
          return deleteProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx, config);

      let thrownError;
      try {
        await client.deleteProducts(skus);
      } catch (e) {
        thrownError = e;
      }

      assert(deleteProductsBatchStub.calledOnceWithExactly(skus));
      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Batch processing failed');
    });

    describe('deleteProductsBatch', () => {
      let ctx;
      let client;

      beforeEach(() => {
        ctx = {
          log: { warn: sinon.stub(), error: sinon.stub() },
          env: {
            CATALOG_BUCKET: {
              head: sinon.stub(),
              delete: sinon.stub(),
            },
          },
        };

        client = new StorageClient(ctx, config);
      });

      it('should successfully delete products with urlKeys', async () => {
        const batch = ['sku1', 'sku2'];

        ctx.env.CATALOG_BUCKET.head
          .withArgs('org/site/store/view/products/sku1.json')
          .resolves({ customMetadata: { urlKey: 'product-1' } });
        ctx.env.CATALOG_BUCKET.head
          .withArgs('org/site/store/view/products/sku2.json')
          .resolves({ customMetadata: { urlKey: 'product-2' } });

        ctx.env.CATALOG_BUCKET.delete.resolves({ status: 200 });

        callPreviewPublishStub
          .withArgs(config, 'DELETE', 'sku1', 'product-1')
          .resolves({
            paths: {
              '/products/product-1/sku1': {
                preview: {
                  status: 200,
                },
                live: {
                  status: 200,
                },
              },
            },
          });
        callPreviewPublishStub
          .withArgs(config, 'DELETE', 'sku2', 'product-2')
          .resolves({
            paths: {
              '/products/product-2/sku2': {
                preview: {
                  status: 200,
                },
                live: {
                  status: 200,
                },
              },
            },
          });

        const results = await client.deleteProductsBatch(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 200,
            message: 'Product deleted successfully.',
            '/products/product-1/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
          {
            sku: 'sku2',
            status: 200,
            message: 'Product deleted successfully.',
            '/products/product-2/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        ]);

        assert(ctx.env.CATALOG_BUCKET.head.calledTwice);
        assert(ctx.env.CATALOG_BUCKET.head.calledWithExactly('org/site/store/view/products/sku1.json'));
        assert(ctx.env.CATALOG_BUCKET.head.calledWithExactly('org/site/store/view/products/sku2.json'));

        assert(ctx.env.CATALOG_BUCKET.delete.callCount === 4);
        assert(ctx.env.CATALOG_BUCKET.delete.calledWithExactly('org/site/store/view/products/sku1.json'));
        assert(ctx.env.CATALOG_BUCKET.delete.calledWithExactly('org/site/store/view/urlkeys/product-1'));
        assert(ctx.env.CATALOG_BUCKET.delete.calledWithExactly('org/site/store/view/products/sku2.json'));
        assert(ctx.env.CATALOG_BUCKET.delete.calledWithExactly('org/site/store/view/urlkeys/product-2'));

        assert(callPreviewPublishStub.calledTwice);
        assert(callPreviewPublishStub.calledWithExactly(config, 'DELETE', 'sku1', 'product-1'));
        assert(callPreviewPublishStub.calledWithExactly(config, 'DELETE', 'sku2', 'product-2'));

        assert(ctx.log.warn.notCalled);
        assert(ctx.log.error.notCalled);
      });

      it('should successfully delete products without urlKeys', async () => {
        const batch = ['sku1', 'sku2'];

        ctx.env.CATALOG_BUCKET.head
          .withArgs('org/site/store/view/products/sku1.json')
          .resolves({ customMetadata: {} });
        ctx.env.CATALOG_BUCKET.head
          .withArgs('org/site/store/view/products/sku2.json')
          .resolves({ customMetadata: {} });

        ctx.env.CATALOG_BUCKET.delete.resolves({ status: 200 });

        callPreviewPublishStub
          .withArgs(config, 'DELETE', 'sku1', undefined)
          .resolves({
            paths: {
              '/products/sku1': {
                preview: {
                  status: 200,
                },
                live: {
                  status: 200,
                },
              },
            },
          });
        callPreviewPublishStub
          .withArgs(config, 'DELETE', 'sku2', undefined)
          .resolves({
            paths: {
              '/products/sku2': {
                preview: {
                  status: 200,
                },
                live: {
                  status: 200,
                },
              },
            },
          });

        const results = await client.deleteProductsBatch(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 200,
            message: 'Product deleted successfully.',
            '/products/sku1': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
          {
            sku: 'sku2',
            status: 200,
            message: 'Product deleted successfully.',
            '/products/sku2': {
              preview: {
                status: 200,
              },
              live: {
                status: 200,
              },
            },
          },
        ]);

        assert(ctx.env.CATALOG_BUCKET.head.calledTwice);

        assert(ctx.env.CATALOG_BUCKET.delete.calledTwice);
        assert(ctx.env.CATALOG_BUCKET.delete.calledWithExactly('org/site/store/view/products/sku1.json'));
        assert(ctx.env.CATALOG_BUCKET.delete.calledWithExactly('org/site/store/view/products/sku2.json'));

        assert(callPreviewPublishStub.calledTwice);
        assert(callPreviewPublishStub.calledWithExactly(config, 'DELETE', 'sku1', undefined));
        assert(callPreviewPublishStub.calledWithExactly(config, 'DELETE', 'sku2', undefined));
      });

      it('should handle non-existent products', async () => {
        const batch = ['nonexistent1', 'nonexistent2'];

        ctx.env.CATALOG_BUCKET.head.resolves(null);

        const results = await client.deleteProductsBatch(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'nonexistent1',
            statusCode: 404,
            message: 'Product not found.',
          },
          {
            sku: 'nonexistent2',
            statusCode: 404,
            message: 'Product not found.',
          },
        ]);

        assert(ctx.env.CATALOG_BUCKET.head.calledTwice);

        assert(ctx.env.CATALOG_BUCKET.delete.notCalled);

        assert(callPreviewPublishStub.notCalled);

        assert(ctx.log.warn.calledTwice);
        assert(ctx.log.warn.calledWithExactly('Product with SKU: nonexistent1 not found. Skipping deletion.'));
        assert(ctx.log.warn.calledWithExactly('Product with SKU: nonexistent2 not found. Skipping deletion.'));
      });

      it('should handle errors during deletion', async () => {
        const batch = ['error1', 'error2'];

        ctx.env.CATALOG_BUCKET.head
          .withArgs('org/site/store/view/products/error1.json')
          .resolves({ customMetadata: { urlKey: 'product-error1' } });
        ctx.env.CATALOG_BUCKET.head
          .withArgs('org/site/store/view/products/error2.json')
          .resolves({ customMetadata: { urlKey: 'product-error2' } });

        ctx.env.CATALOG_BUCKET.delete
          .withArgs('org/site/store/view/products/error1.json')
          .rejects(new Error('Delete failed for error1'));
        ctx.env.CATALOG_BUCKET.delete
          .withArgs('org/site/store/view/products/error2.json')
          .rejects(new Error('Delete failed for error2'));

        const results = await client.deleteProductsBatch(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'error1',
            status: 500,
            message: 'Error: Delete failed for error1',
          },
          {
            sku: 'error2',
            status: 500,
            message: 'Error: Delete failed for error2',
          },
        ]);

        assert(ctx.log.error.calledTwice);
        assert(ctx.log.error.calledWithExactly(
          'Failed to delete product with SKU: error1. Error: Delete failed for error1',
        ));
        assert(ctx.log.error.calledWithExactly(
          'Failed to delete product with SKU: error2. Error: Delete failed for error2',
        ));
      });

      it('should handle errors with specific error codes', async () => {
        const batch = ['sku1'];

        ctx.env.CATALOG_BUCKET.head
          .withArgs('org/site/store/view/products/sku1.json')
          .resolves({ customMetadata: { urlKey: 'product-1' } });

        const errorWithCode = new Error('Delete failed with code');
        errorWithCode.code = 503;
        ctx.env.CATALOG_BUCKET.delete.rejects(errorWithCode);

        const results = await client.deleteProductsBatch(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            status: 503,
            message: 'Error: Delete failed with code',
          },
        ]);

        assert(ctx.log.error.calledOnce);
        assert(ctx.log.error.calledWithExactly(
          'Failed to delete product with SKU: sku1. Error: Delete failed with code',
        ));
      });
    });
  });

  describe('lookupSku', () => {
    it('should successfully resolve SKU from urlKey', async () => {
      const ctx = {
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves({
              customMetadata: { sku: '123' },
            }),
          },
        },
      };
      const urlKey = 'product-1';

      const client = new StorageClient(ctx, config);
      const sku = await client.lookupSku(urlKey);

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/urlkeys/product-1'));
      assert.strictEqual(sku, '123');
    });

    it('should throw 404 error if urlKey not found', async () => {
      const ctx = {
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves(null),
          },
        },
      };
      const urlKey = 'nonexistent-key';

      const error = new Error('Product not found');
      errorWithResponseStub.withArgs(404, 'Product not found').returns(error);

      const client = new StorageClient(ctx, config);

      let thrownError;
      try {
        await client.lookupSku(urlKey);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/urlkeys/nonexistent-key'));
      assert.strictEqual(thrownError, error);
    });

    it('should throw 404 error if sku is missing in customMetadata', async () => {
      const ctx = {
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves({
              customMetadata: {},
            }),
          },
        },
      };
      const urlKey = 'product-2';

      const error = new Error('Product not found');
      errorWithResponseStub.withArgs(404, 'Product not found').returns(error);

      const client = new StorageClient(ctx, config);

      let thrownError;
      try {
        await client.lookupSku(urlKey);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/urlkeys/product-2'));
      assert.strictEqual(thrownError, error);
    });

    it('should propagate errors from CATALOG_BUCKET.head', async () => {
      const ctx = {
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().rejects(new Error('Bucket access error')),
          },
        },
      };
      const urlKey = 'product-3';

      const client = new StorageClient(ctx, config);

      let thrownError;
      try {
        await client.lookupSku(urlKey);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/urlkeys/product-3'));
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Bucket access error');
    });
  });

  describe('lookupUrlKey', () => {
    it('should successfully resolve urlKey from SKU', async () => {
      const ctx = {
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves({
              customMetadata: { urlKey: 'product-1' },
            }),
          },
        },
        url: { origin: 'https://example.com' },
      };
      const sku = 'sku1';

      const client = new StorageClient(ctx, config);
      const urlKey = await client.lookupUrlKey(sku);

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert.strictEqual(urlKey, 'product-1');
    });

    it('should return undefined if urlKey is not present in customMetadata', async () => {
      const ctx = {
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves({
              customMetadata: {},
            }),
          },
        },
        url: { origin: 'https://example.com' },
      };
      const sku = 'sku1';

      const client = new StorageClient(ctx, config);
      const urlKey = await client.lookupUrlKey(sku);

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert.strictEqual(urlKey, undefined);
    });

    it('should return undefined if product does not exist', async () => {
      const ctx = {
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves(null),
          },
        },
        url: { origin: 'https://example.com' },
      };
      const sku = 'sku1';

      const client = new StorageClient(ctx, config);
      const urlKey = await client.lookupUrlKey(sku);

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert.strictEqual(urlKey, undefined);
    });

    it('should propagate errors from CATALOG_BUCKET.head', async () => {
      const ctx = {
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().rejects(new Error('Bucket access error')),
          },
        },
        url: { origin: 'https://example.com' },
      };
      const sku = 'sku2';

      const client = new StorageClient(ctx, config);

      let thrownError;
      try {
        await client.lookupUrlKey(sku);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/products/sku2.json'));
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Bucket access error');
    });
  });

  describe('listAllProducts', () => {
    it('should successfully list all products', async () => {
      const ctx = {
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            list: sinon.stub().resolves({
              objects: [
                { key: 'org/site/store/view/products/sku1.json' },
                { key: 'org/site/store/view/products/sku2.json' },
              ],
            }),
            head: sinon.stub()
              .onFirstCall()
              .resolves({ customMetadata: { sku: 'sku1', urlKey: 'product-1', name: 'Product 1' } })
              .onSecondCall()
              .resolves(null),
          },
        },
        url: { origin: 'https://example.com' },
      };

      const client = new StorageClient(ctx, config);
      const customMetadataArray = await client.listAllProducts();

      assert(ctx.env.CATALOG_BUCKET.list.calledOnceWithExactly({
        prefix: 'org/site/store/view/products/',
      }));
      assert(ctx.env.CATALOG_BUCKET.head.calledTwice);
      assert.deepStrictEqual(customMetadataArray, [
        {
          sku: 'sku1',
          name: 'Product 1',
          urlKey: 'product-1',
          links: {
            product: 'https://example.com/org/site/catalog/store/view/product/sku1',
          },
        },
        {
          fileName: 'org/site/store/view/products/sku2.json',
        },
      ]);
      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
    });

    it('should handle empty product list', async () => {
      const ctx = {
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            list: sinon.stub().resolves({
              objects: [],
            }),
            head: sinon.stub(),
          },
        },
        url: { origin: 'https://example.com' },
      };

      const client = new StorageClient(ctx, config);
      const customMetadataArray = await client.listAllProducts();

      assert(ctx.env.CATALOG_BUCKET.list.calledOnceWithExactly({
        prefix: 'org/site/store/view/products/',
      }));
      assert(ctx.env.CATALOG_BUCKET.head.notCalled);
      assert.deepStrictEqual(customMetadataArray, []);
      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
    });

    it('should handle multiple batches', async () => {
      const ctx = {
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            list: sinon.stub().resolves({
              objects: Array.from({ length: 100 }, (_, i) => ({
                key: `org/site/store/view/products/${i + 1}.json`,
              })),
            }),
            head: sinon.stub(),
          },
        },
        url: { origin: 'https://example.com' },
      };

      const client = new StorageClient(ctx, config);

      // Mock head responses for first 50 products
      for (let i = 1; i <= 50; i++) {
        ctx.env.CATALOG_BUCKET.head.withArgs(`org/site/store/view/products/${i}.json`).resolves({
          customMetadata: { sku: `${i}`, links: { product: `link${i}` } },
        });
      }

      // Mock head responses for next 50 products as not found
      for (let i = 51; i <= 100; i++) {
        ctx.env.CATALOG_BUCKET.head.withArgs(`org/site/store/view/products/${i}.json`).resolves(null);
      }

      const customMetadataArray = await client.listAllProducts();

      assert(ctx.env.CATALOG_BUCKET.list.calledOnceWithExactly({
        prefix: 'org/site/store/view/products/',
      }));
      assert(ctx.env.CATALOG_BUCKET.head.callCount === 100);

      // Check first 50 have sku and links
      for (let i = 1; i <= 50; i++) {
        assert.deepStrictEqual(customMetadataArray[i - 1], {
          sku: `${i}`,
          links: {
            product: `https://example.com/org/site/catalog/store/view/product/${i}`,
          },
        });
      }

      // Check next 50 have fileName
      for (let i = 51; i <= 100; i++) {
        assert.deepStrictEqual(customMetadataArray[i - 1], {
          fileName: `org/site/store/view/products/${i}.json`,
        });
      }

      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
    });

    it('should handle errors during head requests', async () => {
      const ctx = {
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            list: sinon.stub().resolves({
              objects: [
                { key: 'org/site/store/view/products/sku1.json' },
                { key: 'org/site/store/view/products/sku2.json' },
              ],
            }),
            head: sinon.stub().rejects(new Error('Head request failed')),
          },
        },
        url: { origin: 'https://example.com' },
      };

      const client = new StorageClient(ctx, config);

      let thrownError;
      try {
        await client.listAllProducts();
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.list.calledOnceWithExactly({
        prefix: 'org/site/store/view/products/',
      }));
      assert(ctx.env.CATALOG_BUCKET.head.calledTwice);
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Head request failed');
    });
  });
});
