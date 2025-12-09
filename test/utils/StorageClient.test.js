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
import { DEFAULT_CONTEXT } from '../fixtures/context.js';

describe('StorageClient Class Tests', () => {
  let StorageClient;
  let BatchProcessorMock;
  let purgeBatchMock;
  let config;

  beforeEach(async () => {
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

    purgeBatchMock = sinon.stub().resolves();

    const module = await esmock('../../src/utils/StorageClient.js', {
      '../../src/utils/batch.js': {
        BatchProcessor: BatchProcessorMock,
      },
      '../../src/routes/cache/purge.js': {
        purgeBatch: purgeBatchMock,
      },
    });

    StorageClient = module.default;

    config = {
      org: 'org',
      site: 'site',
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getProductByPath', () => {
    it('should successfully fetch a product', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            get: sinon.stub().resolves({
              json: sinon.stub().resolves({ sku: 'sku1', name: 'Test Product', path: '/products/test-product' }),
            }),
          },
        },
        requestInfo: config,
      });
      const path = '/products/test-product.json';

      const client = new StorageClient(ctx);
      const product = await client.getProductByPath(path);

      assert(ctx.env.CATALOG_BUCKET.get.calledOnceWithExactly('org/site/catalog/products/test-product.json'));
      assert.deepStrictEqual(product, {
        sku: 'sku1', name: 'Test Product', path: '/products/test-product',
      });
    });

    it('should throw 404 error if product not found', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            get: sinon.stub().resolves(null),
          },
        },
        requestInfo: config,
      });
      const path = '/products/nonexistent.json';

      const client = new StorageClient(ctx);

      let thrownError;
      try {
        await client.getProductByPath(path);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.get.calledOnceWithExactly('org/site/catalog/products/nonexistent.json'));
      assert.strictEqual(thrownError.message, 'Product not found');
    });

    it('should propagate errors from CATALOG_BUCKET.get', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            get: sinon.stub().rejects(new Error('Bucket access error')),
          },
        },
        requestInfo: config,
      });

      const path = '/products/test-product.json';
      const client = new StorageClient(ctx);

      let thrownError;
      try {
        await client.getProductByPath(path);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.get.calledOnceWithExactly('org/site/catalog/products/test-product.json'));
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Bucket access error');
    });
  });

  describe('saveProductsByPath', () => {
    it('should successfully save multiple products with paths', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            put: sinon.stub().resolves({ status: 200 }),
          },
        },
        requestInfo: config,
      });
      const products = [
        { sku: 'sku1', name: 'Product 1', path: '/products/product-1' },
        { sku: 'sku2', name: 'Product 2', path: '/products/product-2' },
      ];

      const storeProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          path: '/products/product-1',
          status: 200,
          message: 'Product saved successfully.',
        },
        {
          sku: 'sku2',
          path: '/products/product-2',
          status: 200,
          message: 'Product saved successfully.',
        },
      ]);

      const module = await esmock('../../src/utils/StorageClient.js', {
        '../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async storeProductsBatchByPath(batch, asyncImages) {
          return storeProductsBatchStub(batch, asyncImages);
        }
      }

      const client = new TestStorageClient(ctx);
      const saveResults = await client.saveProductsByPath(products);

      assert(storeProductsBatchStub.calledOnceWithExactly(products, true));
      assert(ctx.log.info.calledOnceWithExactly('Completed saving 2 products.'));
      assert.deepStrictEqual(saveResults, [
        {
          sku: 'sku1',
          path: '/products/product-1',
          status: 200,
          message: 'Product saved successfully.',
        },
        {
          sku: 'sku2',
          path: '/products/product-2',
          status: 200,
          message: 'Product saved successfully.',
        },
      ]);
      assert(ctx.log.error.notCalled);
    });

    it('should handle products without urlKeys', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            put: sinon.stub().resolves({ status: 200 }),
          },
        },
        requestInfo: config,
      });
      const products = [
        { sku: 'sku1', name: 'Product 1' }, // No urlKey
      ];

      const storeProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
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

      const module = await esmock('../../src/utils/StorageClient.js', {
        '../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async storeProductsBatchByPath(batch) {
          return storeProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx);
      const saveResults = await client.saveProductsByPath(products);

      assert(storeProductsBatchStub.calledOnceWithExactly(products));
      assert(ctx.log.info.calledOnceWithExactly('Completed saving 1 products.'));
      assert.deepStrictEqual(saveResults, [
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
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
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            put: sinon.stub().resolves({ status: 200 }),
          },
        },
        requestInfo: config,
      });
      const products = [
        { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
        { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
      ];

      const storeProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
          status: 200,
          message: 'Product saved successfully.',
        },
        {
          sku: 'sku2',
          sluggedSku: 'sku2',
          status: 500,
          message: 'Error: Publish error',
        },
      ]);

      const module = await esmock('../../src/utils/StorageClient.js', {
        '../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async storeProductsBatchByPath(batch) {
          return storeProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx);
      const saveResults = await client.saveProductsByPath(products);

      assert(storeProductsBatchStub.calledOnceWithExactly(products));
      assert(ctx.log.info.calledOnceWithExactly('Completed saving 2 products.'));
      assert.deepStrictEqual(saveResults, [
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
          status: 200,
          message: 'Product saved successfully.',
        },
        {
          sku: 'sku2',
          sluggedSku: 'sku2',
          status: 500,
          message: 'Error: Publish error',
        },
      ]);
    });

    it('should handle errors from BatchProcessor', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            put: sinon.stub().resolves({ status: 200 }),
          },
        },
        requestInfo: config,
      });
      const products = [
        { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
      ];

      const storeProductsBatchStub = sinon.stub().rejects(new Error('Batch processing failed'));

      const module = await esmock('../../src/utils/StorageClient.js', {
        '../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async storeProductsBatchByPath(batch) {
          return storeProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx);

      let thrownError;
      try {
        await client.saveProductsByPath(products);
      } catch (e) {
        thrownError = e;
      }

      assert(storeProductsBatchStub.calledOnceWithExactly(products));
      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Batch processing failed');
    });

    describe.skip('storeProductsBatchByPath', () => {
      let ctx;

      beforeEach(async () => {
        ctx = DEFAULT_CONTEXT({
          log: {
            debug: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), info: sinon.stub(),
          },
          env: {
            CATALOG_BUCKET: {
              put: sinon.stub(),
            },
          },
          requestInfo: config,
        });
      });

      it('should successfully save products with urlKeys', async () => {
        const client = new StorageClient(ctx);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
        ];

        ctx.env.CATALOG_BUCKET.put.resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          `${config.org}/${config.site}/${config.storeCode}/${config.storeViewCode}/urlkeys/product-1`,
          '',
          {
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          `${config.org}/${config.site}/${config.storeCode}/${config.storeViewCode}/urlkeys/product-2`,
          '',
          {
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ).resolves({ status: 200 });

        const results = await client.storeProductsBatchByPath(batch);

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
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.getCall(3).calledWithExactly(
          'org/site/store/view/urlkeys/product-2',
          '',
          {
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product saved successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            message: 'Product saved successfully.',
            status: 200,
          },
        ]);

        assert(ctx.log.error.notCalled);
      });

      it('should successfully save products without urlKeys', async () => {
        const client = new StorageClient(ctx);
        const batch = [
          { sku: 'sku1', name: 'Product 1' },
          { sku: 'sku2', name: 'Product 2' },
        ];

        ctx.env.CATALOG_BUCKET.put.resolves({ status: 200 });

        const results = await client.storeProductsBatchByPath(batch);

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

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product saved successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            message: 'Product saved successfully.',
            status: 200,
          },
        ]);

        assert(ctx.log.error.notCalled);
      });

      it('should handle errors during product save (CATALOG_BUCKET.put failure)', async () => {
        const client = new StorageClient(ctx);
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
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        const results = await client.storeProductsBatchByPath(batch);

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
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product saved successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            status: 500,
            message: 'Error: PUT failed for sku2',
          },
        ]);

        assert(ctx.log.error.calledOnce);
        assert(ctx.log.error.calledWithExactly('Error storing product SKU: sku2:', sinon.match.instanceOf(Error)));
      });

      it('should handle errors during metadata save (CATALOG_BUCKET.put for urlKey failure)', async () => {
        const client = new StorageClient(ctx);
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
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).rejects(new Error('Metadata PUT failed for product-1'));

        const results = await client.storeProductsBatchByPath(batch);

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
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            status: 500,
            message: 'Error: Metadata PUT failed for product-1',
          },
        ]);

        assert(ctx.log.error.calledOnce);
        assert(ctx.log.error.calledWithExactly('Error storing product SKU: sku1:', sinon.match.instanceOf(Error)));
      });

      it('should handle an empty batch', async () => {
        const client = new StorageClient(ctx);
        const batch = [];

        const results = await client.storeProductsBatchByPath(batch);

        assert(ctx.env.CATALOG_BUCKET.put.notCalled);
        assert.deepStrictEqual(results, []);
        assert(ctx.log.error.notCalled);
      });

      it('should handle mixed scenarios in a batch', async () => {
        const client = new StorageClient(ctx);
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
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/urlkeys/product-3',
          '',
          {
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku3', name: 'Product 3', urlKey: 'product-3' },
          },
        ).resolves({ status: 200 });

        const results = await client.storeProductsBatchByPath(batch);

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
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ));
        assert(ctx.env.CATALOG_BUCKET.put.getCall(4).calledWithExactly(
          'org/site/store/view/urlkeys/product-3',
          '',
          {
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku3', name: 'Product 3', urlKey: 'product-3' },
          },
        ));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product saved successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            message: 'Product saved successfully.',
            status: 200,
          },
          {
            sku: 'sku3',
            sluggedSku: 'sku3',
            message: 'Product saved successfully.',
            status: 200,
          },
        ]);

        assert(ctx.log.error.notCalled);
      });

      it('should call purgeBatch once after all products are saved successfully', async () => {
        const client = new StorageClient(ctx);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
        ];

        ctx.env.CATALOG_BUCKET.put.resolves({ status: 200 });

        const results = await client.storeProductsBatchByPath(batch);

        assert(ctx.env.CATALOG_BUCKET.put.callCount === 4);

        // Verify purgeBatch was called once with all successfully saved products
        assert(purgeBatchMock.calledOnce);
        assert(purgeBatchMock.calledWithExactly(
          ctx,
          { org: 'org', site: 'site' },
          [
            {
              sku: 'sku1', urlKey: 'product-1', storeCode: 'store', storeViewCode: 'view',
            },
            {
              sku: 'sku2', urlKey: 'product-2', storeCode: 'store', storeViewCode: 'view',
            },
          ],
        ));

        // Verify success info log is called
        assert(ctx.log.info.calledOnceWithExactly('Cache purged for 2 successfully saved products'));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product saved successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            message: 'Product saved successfully.',
            status: 200,
          },
        ]);

        assert(ctx.log.error.notCalled);
        assert(ctx.log.warn.notCalled);
      });

      it('should only purge cache for successfully saved products when some fail', async () => {
        const client = new StorageClient(ctx);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
        ];

        // First product succeeds
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
            httpMetadata: { contentType: 'text/plain' },
            customMetadata: { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          },
        ).resolves({ status: 200 });

        // Second product fails
        ctx.env.CATALOG_BUCKET.put.withArgs(
          'org/site/store/view/products/sku2.json',
          JSON.stringify(batch[1]),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
          },
        ).rejects(new Error('PUT failed for sku2'));

        const results = await client.storeProductsBatchByPath(batch);

        // Verify purgeBatch was called only with the successfully saved product
        assert(purgeBatchMock.calledOnce);
        assert(purgeBatchMock.calledWithExactly(
          ctx,
          { org: 'org', site: 'site' },
          [
            {
              sku: 'sku1', urlKey: 'product-1', storeCode: 'store', storeViewCode: 'view',
            },
          ],
        ));

        // Verify success info log is called for the one successfully purged product
        assert(ctx.log.info.calledOnceWithExactly('Cache purged for 1 successfully saved products'));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product saved successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            status: 500,
            message: 'Error: PUT failed for sku2',
          },
        ]);

        // Error log is called once for the failed product save
        assert(ctx.log.error.calledOnce);
        assert(ctx.log.error.calledWithExactly('Error storing product SKU: sku2:', sinon.match.instanceOf(Error)));
      });

      it('should not call purgeBatch when all products fail to save', async () => {
        const client = new StorageClient(ctx);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
        ];

        ctx.env.CATALOG_BUCKET.put.rejects(new Error('PUT failed'));

        const results = await client.storeProductsBatchByPath(batch);

        // Verify purgeBatch was not called since no products were saved successfully
        assert(purgeBatchMock.notCalled);

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            status: 500,
            message: 'Error: PUT failed',
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            status: 500,
            message: 'Error: PUT failed',
          },
        ]);

        assert(ctx.log.error.calledTwice);
      });

      it('should log error when batch cache purge fails but still save products successfully', async () => {
        const client = new StorageClient(ctx);
        const batch = [
          { sku: 'sku1', name: 'Product 1', urlKey: 'product-1' },
          { sku: 'sku2', name: 'Product 2', urlKey: 'product-2' },
        ];

        ctx.env.CATALOG_BUCKET.put.resolves({ status: 200 });
        purgeBatchMock.rejects(new Error('Purge service unavailable'));

        const results = await client.storeProductsBatchByPath(batch);

        assert(ctx.env.CATALOG_BUCKET.put.callCount === 4);

        // Verify purgeBatch was called once with all successfully saved products
        assert(purgeBatchMock.calledOnce);
        assert(purgeBatchMock.calledWithExactly(
          ctx,
          { org: 'org', site: 'site' },
          [
            {
              sku: 'sku1', urlKey: 'product-1', storeCode: 'store', storeViewCode: 'view',
            },
            {
              sku: 'sku2', urlKey: 'product-2', storeCode: 'store', storeViewCode: 'view',
            },
          ],
        ));
        assert(ctx.log.error.calledOnceWithExactly('Failed to purge cache for saved products: Purge service unavailable'));

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product saved successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            message: 'Product saved successfully.',
            status: 200,
          },
        ]);

        assert(ctx.log.warn.notCalled);
      });
    });
  });

  describe('deleteProductsByPath', () => {
    it('should successfully delete multiple products with urlKeys', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub(),
            delete: sinon.stub().resolves({ status: 200 }),
          },
        },
        requestInfo: config,
      });
      const skus = ['sku1', 'sku2'];

      ctx.env.CATALOG_BUCKET.head.withArgs('org1/site1/store1/view1/products/sku1.json').resolves({
        customMetadata: { urlKey: 'product-1' },
      });
      ctx.env.CATALOG_BUCKET.head.withArgs('org1/site1/store1/view1/products/sku2.json').resolves({
        customMetadata: { urlKey: 'product-2' },
      });

      const deleteProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
          status: 200,
          message: 'Product deleted successfully.',
        },
        {
          sku: 'sku2',
          sluggedSku: 'sku2',
          status: 200,
          message: 'Product deleted successfully.',
        },
      ]);

      const module = await esmock('../../src/utils/StorageClient.js', {
        '../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async deleteProductsBatchByPath(batch) {
          return deleteProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx);
      const deleteResults = await client.deleteProductsByPath(skus);

      assert(deleteProductsBatchStub.calledOnceWithExactly(skus));
      assert(ctx.log.info.calledOnceWithExactly('Completed deletion of 2 products.'));
      assert.deepStrictEqual(deleteResults, [
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
          status: 200,
          message: 'Product deleted successfully.',
        },
        {
          sku: 'sku2',
          sluggedSku: 'sku2',
          status: 200,
          message: 'Product deleted successfully.',
        },
      ]);
      assert(ctx.log.warn.notCalled);
      assert(ctx.log.error.notCalled);
    });

    it('should skip deletion for non-existent SKUs', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub(),
            delete: sinon.stub().resolves({ status: 200 }),
          },
        },
        requestInfo: config,
      });
      const skus = ['sku1', 'nonexistent'];

      ctx.env.CATALOG_BUCKET.head.withArgs('org/site/store/view/products/sku1.json').resolves({
        customMetadata: { urlKey: 'product-1' },
      });
      ctx.env.CATALOG_BUCKET.head.withArgs('org/site/store/view/products/nonexistent.json').resolves(null);

      const deleteProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
          status: 200,
          message: 'Product deleted successfully.',
          path1: '/products/sku1',
        },
        {
          sku: 'nonexistent',
          sluggedSku: 'nonexistent',
          statusCode: 404,
          message: 'Product not found.',
        },
      ]);

      const module = await esmock('../../src/utils/StorageClient.js', {
        '../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async deleteProductsBatchByPath(batch) {
          return deleteProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx);
      const deleteResults = await client.deleteProductsByPath(skus);

      assert(deleteProductsBatchStub.calledOnceWithExactly(skus));
      assert(ctx.log.info.calledOnceWithExactly('Completed deletion of 2 products.'));
      assert.deepStrictEqual(deleteResults, [
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
          status: 200,
          message: 'Product deleted successfully.',
          path1: '/products/sku1',
        },
        {
          sku: 'nonexistent',
          sluggedSku: 'nonexistent',
          statusCode: 404,
          message: 'Product not found.',
        },
      ]);
      assert(ctx.log.error.notCalled);
    });

    it('should handle errors during deletion of a product', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub(),
            delete: sinon.stub().resolves({ status: 200 }),
          },
        },
        requestInfo: config,
      });
      const skus = ['sku1', 'sku2'];

      ctx.env.CATALOG_BUCKET.head.withArgs('org/site/store/view/products/sku1.json').resolves({
        customMetadata: { urlKey: 'product-1' },
      });
      ctx.env.CATALOG_BUCKET.head.withArgs('org/site/store/view/products/sku2.json').resolves({
        customMetadata: { urlKey: 'product-2' },
      });

      const deleteProductsBatchStub = sinon.stub().resolves([
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
          status: 200,
          message: 'Product deleted successfully.',
          path1: '/products/sku1',
        },
        {
          sku: 'sku2',
          sluggedSku: 'sku2',
          status: 500,
          message: 'Error: Publish error',
        },
      ]);

      const module = await esmock('../../src/utils/StorageClient.js', {
        '../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async deleteProductsBatchByPath(batch) {
          return deleteProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx);
      const deleteResults = await client.deleteProductsByPath(skus);

      assert(deleteProductsBatchStub.calledOnceWithExactly(skus));
      assert(ctx.log.info.calledOnceWithExactly('Completed deletion of 2 products.'));
      assert.deepStrictEqual(deleteResults, [
        {
          sku: 'sku1',
          sluggedSku: 'sku1',
          status: 200,
          message: 'Product deleted successfully.',
          path1: '/products/sku1',
        },
        {
          sku: 'sku2',
          sluggedSku: 'sku2',
          status: 500,
          message: 'Error: Publish error',
        },
      ]);
    });

    it('should handle errors from BatchProcessor', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub(),
            delete: sinon.stub().resolves({ status: 200 }),
          },
        },
        requestInfo: config,
      });
      const skus = ['sku1'];

      const deleteProductsBatchStub = sinon.stub().rejects(new Error('Batch processing failed'));

      const module = await esmock('../../src/utils/StorageClient.js', {
        '../../src/utils/batch.js': {
          BatchProcessor: BatchProcessorMock,
        },
      });

      class TestStorageClient extends module.default {
        async deleteProductsBatchByPath(batch) {
          return deleteProductsBatchStub(batch);
        }
      }

      const client = new TestStorageClient(ctx);

      let thrownError;
      try {
        await client.deleteProductsByPath(skus);
      } catch (e) {
        thrownError = e;
      }

      assert(deleteProductsBatchStub.calledOnceWithExactly(skus));
      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
      assert(thrownError instanceof Error);
      assert.strictEqual(thrownError.message, 'Batch processing failed');
    });

    describe.skip('deleteProductsBatchByPath', () => {
      let ctx;
      let client;

      beforeEach(() => {
        ctx = DEFAULT_CONTEXT({
          log: { warn: sinon.stub(), error: sinon.stub() },
          env: {
            CATALOG_BUCKET: {
              head: sinon.stub(),
              delete: sinon.stub(),
            },
          },
          requestInfo: config,
        });

        client = new StorageClient(ctx);
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

        const results = await client.deleteProductsBatchByPath(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product deleted successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            message: 'Product deleted successfully.',
            status: 200,
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

        const results = await client.deleteProductsBatchByPath(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
            message: 'Product deleted successfully.',
            status: 200,
          },
          {
            sku: 'sku2',
            sluggedSku: 'sku2',
            message: 'Product deleted successfully.',
            status: 200,
          },
        ]);

        assert(ctx.env.CATALOG_BUCKET.head.calledTwice);

        assert(ctx.env.CATALOG_BUCKET.delete.calledTwice);
        assert(ctx.env.CATALOG_BUCKET.delete.calledWithExactly('org/site/store/view/products/sku1.json'));
        assert(ctx.env.CATALOG_BUCKET.delete.calledWithExactly('org/site/store/view/products/sku2.json'));
      });

      it('should handle non-existent products', async () => {
        const batch = ['nonexistent1', 'nonexistent2'];

        ctx.env.CATALOG_BUCKET.head.resolves(null);

        const results = await client.deleteProductsBatchByPath(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'nonexistent1',
            sluggedSku: 'nonexistent1',
            statusCode: 404,
            message: 'Product not found.',
          },
          {
            sku: 'nonexistent2',
            sluggedSku: 'nonexistent2',
            statusCode: 404,
            message: 'Product not found.',
          },
        ]);

        assert(ctx.env.CATALOG_BUCKET.head.calledTwice);

        assert(ctx.env.CATALOG_BUCKET.delete.notCalled);

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

        const results = await client.deleteProductsBatchByPath(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'error1',
            sluggedSku: 'error1',
            status: 500,
            message: 'Error: Delete failed for error1',
          },
          {
            sku: 'error2',
            sluggedSku: 'error2',
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

        const results = await client.deleteProductsBatchByPath(batch);

        assert.deepStrictEqual(results, [
          {
            sku: 'sku1',
            sluggedSku: 'sku1',
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

  describe.skip('lookupSku', () => {
    it('should successfully resolve SKU from urlKey', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves({
              customMetadata: { sku: '123' },
            }),
          },
        },
        requestInfo: config,
      });
      const urlKey = 'product-1';

      const client = new StorageClient(ctx);
      const sku = await client.lookupSku(urlKey);

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/urlkeys/product-1'));
      assert.strictEqual(sku, '123');
    });

    it('should throw 404 error if urlKey not found', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves(null),
          },
        },
        requestInfo: config,
      });
      const urlKey = 'nonexistent-key';

      const client = new StorageClient(ctx);

      let thrownError;
      try {
        await client.lookupSku(urlKey);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/urlkeys/nonexistent-key'));
      assert.strictEqual(thrownError.message, 'Product not found');
    });

    it('should throw 404 error if sku is missing in customMetadata', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves({
              customMetadata: {},
            }),
          },
        },
        requestInfo: config,
      });
      const urlKey = 'product-2';

      const client = new StorageClient(ctx);

      let thrownError;
      try {
        await client.lookupSku(urlKey);
      } catch (e) {
        thrownError = e;
      }

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/urlkeys/product-2'));
      assert.strictEqual(thrownError.message, 'Product not found');
    });

    it('should propagate errors from CATALOG_BUCKET.head', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().rejects(new Error('Bucket access error')),
          },
        },
        requestInfo: config,
      });
      const urlKey = 'product-3';

      const client = new StorageClient(ctx);

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

  describe.skip('lookupUrlKey', () => {
    it('should successfully resolve urlKey from SKU', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves({
              customMetadata: { urlKey: 'product-1' },
            }),
          },
        },
        url: { origin: 'https://example.com' },
        requestInfo: config,
      });
      const sku = 'sku1';

      const client = new StorageClient(ctx);
      const urlKey = await client.lookupUrlKey(sku);

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert.strictEqual(urlKey, 'product-1');
    });

    it('should return undefined if urlKey is not present in customMetadata', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves({
              customMetadata: {},
            }),
          },
        },
        url: { origin: 'https://example.com' },
        requestInfo: config,
      });
      const sku = 'sku1';

      const client = new StorageClient(ctx);
      const urlKey = await client.lookupUrlKey(sku);

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert.strictEqual(urlKey, undefined);
    });

    it('should return undefined if product does not exist', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().resolves(null),
          },
        },
        url: { origin: 'https://example.com' },
        requestInfo: config,
      });
      const sku = 'sku1';

      const client = new StorageClient(ctx);
      const urlKey = await client.lookupUrlKey(sku);

      assert(ctx.env.CATALOG_BUCKET.head.calledOnceWithExactly('org/site/store/view/products/sku1.json'));
      assert.strictEqual(urlKey, undefined);
    });

    it('should propagate errors from CATALOG_BUCKET.head', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: {
          CATALOG_BUCKET: {
            head: sinon.stub().rejects(new Error('Bucket access error')),
          },
        },
        url: { origin: 'https://example.com' },
        requestInfo: config,
      });
      const sku = 'sku2';

      const client = new StorageClient(ctx);

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

  describe.skip('listAllProducts', () => {
    it('should successfully list all products', async () => {
      const ctx = DEFAULT_CONTEXT({
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
        requestInfo: config,
      });

      const client = new StorageClient(ctx);
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
            product: 'https://example.com/org/site/catalog/store/view/products/sku1.json',
          },
        },
        {
          sku: 'sku2',
          links: {
            product: 'https://example.com/org/site/catalog/store/view/products/sku2.json',
          },
        },
      ]);
      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
    });

    it('should list only skus when skusOnly is true', async () => {
      const ctx = DEFAULT_CONTEXT({
        log: { info: sinon.stub(), error: sinon.stub() },
        data: { skusOnly: true },
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
        requestInfo: config,
      });

      const client = new StorageClient(ctx);
      const customMetadataArray = await client.listAllProducts();

      assert(ctx.env.CATALOG_BUCKET.list.calledOnceWithExactly({
        prefix: 'org/site/store/view/products/',
      }));
      assert(ctx.env.CATALOG_BUCKET.head.notCalled);
      assert.deepStrictEqual(customMetadataArray, [
        {
          sku: 'sku1',
          links: {
            product: 'https://example.com/org/site/catalog/store/view/products/sku1.json',
          },
        },
        {
          sku: 'sku2',
          links: {
            product: 'https://example.com/org/site/catalog/store/view/products/sku2.json',
          },
        },
      ]);
      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
    });

    it('should handle empty product list', async () => {
      const ctx = DEFAULT_CONTEXT({
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
        requestInfo: config,
      });

      const client = new StorageClient(ctx);
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
      const ctx = DEFAULT_CONTEXT({
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
        requestInfo: config,
      });

      const client = new StorageClient(ctx);

      // Mock head responses for first 50 products
      for (let i = 1; i <= 50; i++) {
        ctx.env.CATALOG_BUCKET.head.withArgs(`org/site/store/view/products/${i}.json`).resolves({
          customMetadata: { sku: `${i}`, urlKey: `product-${i}`, name: `Product ${i}` },
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

      // Check first 50 have sku, urlkey, name, and links
      for (let i = 1; i <= 50; i++) {
        assert.deepStrictEqual(customMetadataArray[i - 1], {
          sku: `${i}`,
          urlKey: `product-${i}`,
          name: `Product ${i}`,
          links: {
            product: `https://example.com/org/site/catalog/store/view/products/${i}.json`,
          },
        });
      }

      // Check next 50 have sku, links
      for (let i = 51; i <= 100; i++) {
        assert.deepStrictEqual(customMetadataArray[i - 1], {
          sku: `${i}`,
          links: {
            product: `https://example.com/org/site/catalog/store/view/products/${i}.json`,
          },
        });
      }

      assert(ctx.log.info.notCalled);
      assert(ctx.log.error.notCalled);
    });

    it('should handle errors during head requests', async () => {
      const ctx = DEFAULT_CONTEXT({
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
        requestInfo: config,
      });

      const client = new StorageClient(ctx);

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

  describe('orders and customers', () => {
    let clock;
    beforeEach(() => {
      clock = sinon.useFakeTimers(new Date('2025-01-01T00:00:00Z'));
    });
    afterEach(() => {
      clock.restore();
      if (globalThis.crypto?.randomUUID?.restore) {
        // @ts-ignore
        globalThis.crypto.randomUUID.restore();
      }
    });

    it('createOrder stores order and returns populated object', async () => {
      const putStub = sinon.stub().resolves();
      sinon.stub(globalThis.crypto, 'randomUUID').returns('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      const ctx = DEFAULT_CONTEXT({
        env: {
          ORDERS_BUCKET: { put: putStub },
        },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      const data = {};
      const order = await client.createOrder(data, 'magento');

      assert.strictEqual(order.state, 'pending');
      assert.strictEqual(order.createdAt, '2025-01-01T00:00:00.000Z');
      assert.strictEqual(order.updatedAt, '2025-01-01T00:00:00.000Z');
      // validate bucket call
      assert(putStub.calledOnce);
      const [key, body, opts] = putStub.firstCall.args;
      assert.match(key, /^org\/site\/orders\/2025-01-01T00:00:00\.000Z-aaaaaaaa\.json$/);
      assert.strictEqual(JSON.parse(body).id, order.id);
      assert.deepStrictEqual(opts.httpMetadata, { contentType: 'application/json' });
      assert.deepStrictEqual(opts.customMetadata, {
        id: order.id,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        platformType: 'magento',
      });
    });

    it('getCustomer returns undefined when not found and parsed JSON when found', async () => {
      const getStub = sinon.stub();
      getStub.onCall(0).resolves(null);
      getStub.onCall(1).resolves({ json: sinon.stub().resolves({ email: 'e' }) });
      const ctx = DEFAULT_CONTEXT({
        env: {
          ORDERS_BUCKET: { get: getStub },
        },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      const res1 = await client.getCustomer('e');
      const res2 = await client.getCustomer('e');
      assert.strictEqual(res1, undefined);
      assert.deepStrictEqual(res2, { email: 'e' });
    });

    it('customerExists returns true/false based on head', async () => {
      const headStub = sinon.stub();
      headStub.onCall(0).resolves(null);
      headStub.onCall(1).resolves({});
      const ctx = DEFAULT_CONTEXT({
        env: {
          ORDERS_BUCKET: { head: headStub },
        },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      assert.strictEqual(await client.customerExists('a@b.com'), false);
      assert.strictEqual(await client.customerExists('a@b.com'), true);
    });

    it('saveCustomer persists via putTo and returns the customer', async () => {
      const putToStub = sinon.stub().resolves(false);
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: {} },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      sinon.stub(client, 'putTo').callsFake(putToStub);
      const customer = { email: 'a@b.com', createdAt: 't1', updatedAt: 't2' };
      const res = await client.saveCustomer(customer);
      assert.deepStrictEqual(res, customer);
      assert(putToStub.calledOnce);
      const [bucket, key, body, opts] = putToStub.firstCall.args;
      assert.strictEqual(bucket, ctx.env.ORDERS_BUCKET);
      assert.strictEqual(key, 'org/site/customers/a@b.com/.info.json');
      assert.deepStrictEqual(JSON.parse(body), customer);
      assert.deepStrictEqual(opts.httpMetadata, { contentType: 'application/json' });
      assert.deepStrictEqual(opts.customMetadata, {
        email: 'a@b.com',
        createdAt: 't1',
        updatedAt: 't2',
      });
    });

    it('listCustomers maps objects to customers with email and metadata', async () => {
      const listStub = sinon.stub().resolves({
        objects: [
          {
            key: 'org/site/customers/user1@example.com',
            customMetadata: { createdAt: 't1' },
          },
          {
            key: 'org/site/customers/user2@example.com',
            customMetadata: { createdAt: 't2' },
          },
        ],
      });
      const ctx = DEFAULT_CONTEXT({
        env: {
          ORDERS_BUCKET: { list: listStub },
        },
        requestInfo: config,
        data: { cursor: undefined },
      });
      const client = new StorageClient(ctx);
      const res = await client.listCustomers();
      assert.deepStrictEqual(res, [
        { email: 'user1@example.com', createdAt: 't1' },
        { email: 'user2@example.com', createdAt: 't2' },
      ]);
    });

    it('deleteCustomer deletes info and associated resources with pagination', async () => {
      const deleteStub = sinon.stub().resolves();
      const listStub = sinon.stub();
      // First prefix (orders) page
      listStub.onCall(0).resolves({
        objects: [{ key: 'org/site/customers/user@example.com/orders/o1' }],
        truncated: false,
        cursor: '',
      });
      // Second prefix (addresses) page
      listStub.onCall(1).resolves({
        objects: [
          { key: 'org/site/customers/user@example.com/addresses/a1' },
          { key: 'org/site/customers/user@example.com/addresses/a2' },
        ],
        truncated: false,
        cursor: '',
      });
      const ctx = DEFAULT_CONTEXT({
        env: {
          ORDERS_BUCKET: {
            delete: deleteStub,
            list: listStub,
          },
        },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      await client.deleteCustomer('user@example.com', true, true);
      // info.json delete
      assert(deleteStub.firstCall.calledWithExactly('org/site/customers/user@example.com/.info.json'));
      // batch deletes for orders and addresses
      assert(deleteStub.secondCall.calledWithExactly(['org/site/customers/user@example.com/orders/o1']));
      assert(deleteStub.thirdCall.calledWithExactly([
        'org/site/customers/user@example.com/addresses/a1',
        'org/site/customers/user@example.com/addresses/a2',
      ]));
    });

    it('getAddressHashTable returns empty object when missing, else parsed JSON', async () => {
      const getStub = sinon.stub();
      getStub.onCall(0).resolves(null);
      getStub.onCall(1).resolves({ json: sinon.stub().resolves({ hash: 'id' }) });
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: { get: getStub } },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      const res1 = await client.getAddressHashTable('e');
      const res2 = await client.getAddressHashTable('e');
      assert.deepStrictEqual(res1, {});
      assert.deepStrictEqual(res2, { hash: 'id' });
    });

    it('saveAddressHashTable persists via putTo', async () => {
      const putToStub = sinon.stub().resolves(false);
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: {} },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      sinon.stub(client, 'putTo').callsFake(putToStub);
      await client.saveAddressHashTable('e', { a: '1' });
      const [bucket, key, body, opts] = putToStub.firstCall.args;
      assert.strictEqual(bucket, ctx.env.ORDERS_BUCKET);
      assert.strictEqual(key, 'org/site/customers/e/addresses/.hashtable.json');
      assert.strictEqual(body, JSON.stringify({ a: '1' }));
      assert.deepStrictEqual(opts.httpMetadata, { contentType: 'application/json' });
    });

    it('saveAddress creates new address and updates hash table when hash absent', async () => {
      sinon.stub(globalThis.crypto, 'randomUUID').returns('id-123');
      const putToStub = sinon.stub().resolves(false);
      const getHashStub = sinon.stub().resolves({});
      const saveHashStub = sinon.stub().resolves();
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: {} },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      sinon.stub(client, 'putTo').callsFake(putToStub);
      sinon.stub(client, 'getAddressHashTable').callsFake(getHashStub);
      sinon.stub(client, 'saveAddressHashTable').callsFake(saveHashStub);
      const addr = { line1: '123 Main' };
      const res = await client.saveAddress('hash1', 'user@example.com', addr);
      assert.deepStrictEqual(res, { ...addr, id: 'id-123' });
      // put address
      const [bucket, key, body, opts] = putToStub.firstCall.args;
      assert.strictEqual(bucket, ctx.env.ORDERS_BUCKET);
      assert.strictEqual(key, 'org/site/customers/user@example.com/addresses/id-123.json');
      assert.strictEqual(body, JSON.stringify(addr));
      assert.deepStrictEqual(opts.httpMetadata, { contentType: 'application/json' });
      assert.deepStrictEqual(opts.customMetadata, { email: 'user@example.com', id: 'id-123' });
      // saved hashtable updated
      assert(saveHashStub.calledWithExactly('user@example.com', { hash1: 'id-123' }));
    });

    it('saveAddress returns existing address when hash exists', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: {} },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      sinon.stub(client, 'getAddressHashTable').resolves({ h: 'abc' });
      const addr = { line1: '123' };
      const res = await client.saveAddress('h', 'e', addr);
      assert.deepStrictEqual(res, { ...addr, id: 'abc' });
    });

    it('getAddress returns null when missing and parsed JSON when found', async () => {
      const getStub = sinon.stub();
      getStub.onCall(0).resolves(null);
      getStub.onCall(1).resolves({ json: sinon.stub().resolves({ id: 'a1' }) });
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: { get: getStub } },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      const res1 = await client.getAddress('e', 'a1');
      const res2 = await client.getAddress('e', 'a1');
      assert.strictEqual(res1, null);
      assert.deepStrictEqual(res2, { id: 'a1' });
    });

    it('linkOrderToCustomer writes link when new and throws when exists', async () => {
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: {} },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      const putToStub = sinon.stub()
        .onFirstCall()
        .resolves(false)
        .onSecondCall()
        .resolves(true);
      sinon.stub(client, 'putTo').callsFake(putToStub);
      const order = {
        id: 'o1',
        createdAt: 't1',
        updatedAt: 't2',
        storeCode: 's',
        storeViewCode: 'v',
        state: 'pending',
      };
      const ok = await client.linkOrderToCustomer('user@example.com', 'o1', order);
      assert.strictEqual(ok, true);
      let threw;
      try {
        await client.linkOrderToCustomer('user@example.com', 'o1', order);
      } catch (e) {
        threw = e;
      }
      assert.strictEqual(threw?.response?.status, 400);
    });

    it('updateOrderLink returns false when missing and updates when present', async () => {
      const headStub = sinon.stub();
      headStub.onCall(0).resolves(null);
      headStub.onCall(1).resolves({ customMetadata: { id: 'o1', createdAt: 't1', state: 'pending' } });
      const putToStub = sinon.stub().resolves(false);
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: { head: headStub } },
        requestInfo: config,
        log: { warn: sinon.stub() },
      });
      const client = new StorageClient(ctx);
      sinon.stub(client, 'putTo').callsFake(putToStub);
      const r1 = await client.updateOrderLink('user@example.com', 'o1', { state: 'complete' });
      assert.strictEqual(r1, false);
      const r2 = await client.updateOrderLink('user@example.com', 'o1', { state: 'complete' });
      assert.strictEqual(r2, true);
      assert(putToStub.calledOnce);
      const [bucket, key, body, opts] = putToStub.firstCall.args;
      assert.strictEqual(bucket, ctx.env.ORDERS_BUCKET);
      assert.strictEqual(key, 'org/site/customers/user@example.com/orders/o1');
      assert.strictEqual(body, '');
      // merged metadata
      assert.strictEqual(opts.customMetadata.id, 'o1');
      assert.strictEqual(opts.customMetadata.createdAt, 't1');
      assert.strictEqual(opts.customMetadata.state, 'complete');
      assert.ok(opts.customMetadata.updatedAt);
    });

    it('getOrder returns null when missing and parsed JSON when found', async () => {
      const getStub = sinon.stub();
      getStub.onCall(0).resolves(null);
      getStub.onCall(1).resolves({ json: sinon.stub().resolves({ id: 'o1' }) });
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: { get: getStub } },
        requestInfo: config,
      });
      const client = new StorageClient(ctx);
      const r1 = await client.getOrder('o1');
      const r2 = await client.getOrder('o1');
      assert.strictEqual(r1, null);
      assert.deepStrictEqual(r2, { id: 'o1' });
    });

    it('listOrders lists orders globally and per-customer', async () => {
      const listStub = sinon.stub();
      // global orders (ids with .json)
      listStub.onCall(0).resolves({
        objects: [
          { key: 'org/site/orders/a.json', customMetadata: { state: 'pending' } },
          { key: 'org/site/orders/b.json', customMetadata: { state: 'complete' } },
        ],
      });
      // per customer orders (links without .json)
      listStub.onCall(1).resolves({
        objects: [
          { key: 'org/site/customers/user@example.com/orders/o1', customMetadata: { state: 'pending' } },
        ],
      });
      const ctx = DEFAULT_CONTEXT({
        env: { ORDERS_BUCKET: { list: listStub } },
        requestInfo: config,
        data: { cursor: undefined },
      });
      const client = new StorageClient(ctx);
      const all = await client.listOrders();
      const byUser = await client.listOrders('user@example.com');
      assert.deepStrictEqual(all, [
        { id: 'a', state: 'pending' },
        { id: 'b', state: 'complete' },
      ]);
      assert.deepStrictEqual(byUser, [
        { id: 'o1', state: 'pending' },
      ]);
    });
  });
});
