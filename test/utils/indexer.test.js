/*
 * Copyright 2026 Adobe. All rights reserved.
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
import { publishIndexingJobs, queueExistingProductsForIndexing } from '../../src/utils/indexer.js';

describe('publishIndexingJobs', () => {
  let ctx;
  let sendStub;

  beforeEach(() => {
    sendStub = sinon.stub().resolves();
    ctx = {
      env: {
        INDEXER_QUEUE: {
          send: sendStub,
        },
      },
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should strip .json suffix from product paths', async () => {
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products: [
        { path: '/products/product-1.json', action: 'update' },
        { path: '/products/product-2.json', action: 'update' },
      ],
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    assert(sendStub.calledOnce);
    const sent = sendStub.firstCall.args[0];
    assert.deepStrictEqual(sent.products, [
      { path: '/products/product-1', action: 'update' },
      { path: '/products/product-2', action: 'update' },
    ]);
  });

  it('should not modify paths without .json suffix', async () => {
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products: [
        { path: '/products/product-1', action: 'update' },
        { path: '/products/product-2', action: 'delete' },
      ],
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    assert(sendStub.calledOnce);
    const sent = sendStub.firstCall.args[0];
    assert.deepStrictEqual(sent.products, [
      { path: '/products/product-1', action: 'update' },
      { path: '/products/product-2', action: 'delete' },
    ]);
  });

  it('should handle mixed paths with and without .json suffix', async () => {
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products: [
        { path: '/products/product-1.json', action: 'update' },
        { path: '/products/product-2', action: 'delete' },
        { path: '/products/nested/deep/product-3.json', action: 'update' },
      ],
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    assert(sendStub.calledOnce);
    const sent = sendStub.firstCall.args[0];
    assert.deepStrictEqual(sent.products, [
      { path: '/products/product-1', action: 'update' },
      { path: '/products/product-2', action: 'delete' },
      { path: '/products/nested/deep/product-3', action: 'update' },
    ]);
  });

  it('should preserve org, site, and timestamp in the payload', async () => {
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products: [
        { path: '/products/product-1.json', action: 'update' },
      ],
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    const sent = sendStub.firstCall.args[0];
    assert.strictEqual(sent.org, 'myorg');
    assert.strictEqual(sent.site, 'mysite');
    assert.strictEqual(sent.timestamp, 1234567890);
  });

  it('should not send when products array is empty', async () => {
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products: [],
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    assert(sendStub.notCalled);
  });

  it('should only strip .json from the end of the path', async () => {
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products: [
        { path: '/products/.json/product-1', action: 'update' },
        { path: '/products/product.json.bak', action: 'update' },
      ],
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    const sent = sendStub.firstCall.args[0];
    assert.deepStrictEqual(sent.products, [
      { path: '/products/.json/product-1', action: 'update' },
      { path: '/products/product.json.bak', action: 'update' },
    ]);
  });

  it('should send the normalized payload to the INDEXER_QUEUE', async () => {
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products: [
        { path: '/products/product-1.json', action: 'update' },
      ],
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    assert(sendStub.calledOnceWith({
      org: 'myorg',
      site: 'mysite',
      products: [
        { path: '/products/product-1', action: 'update' },
      ],
      timestamp: 1234567890,
    }));
  });

  it('should split products into chunks of 100', async () => {
    const products = Array.from({ length: 250 }, (_, i) => ({
      path: `/products/product-${i}`,
      action: 'update',
    }));
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products,
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    assert.strictEqual(sendStub.callCount, 3);
    assert.strictEqual(sendStub.firstCall.args[0].products.length, 100);
    assert.strictEqual(sendStub.secondCall.args[0].products.length, 100);
    assert.strictEqual(sendStub.thirdCall.args[0].products.length, 50);

    for (const call of sendStub.getCalls()) {
      const sent = call.args[0];
      assert.strictEqual(sent.org, 'myorg');
      assert.strictEqual(sent.site, 'mysite');
      assert.strictEqual(sent.timestamp, 1234567890);
    }
  });

  it('should produce chunks whose JSON payload stays within 128 KB', async () => {
    const products = Array.from({ length: 100 }, (_, i) => ({
      path: `/products/category/subcategory/product-with-a-long-name-${i}.json`,
      action: 'update',
    }));
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products,
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    for (const call of sendStub.getCalls()) {
      const json = JSON.stringify(call.args[0]);
      assert(
        json.length <= 128_000,
        `Chunk payload is ${json.length} characters, exceeds 128,000 limit`,
      );
    }
  });
});

describe('queueExistingProductsForIndexing', () => {
  let ctx;
  let sendStub;
  let listStub;
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers(1700000000000);
    sendStub = sinon.stub().resolves();
    listStub = sinon.stub();
    ctx = {
      env: {
        CATALOG_BUCKET: {
          list: listStub,
        },
        INDEXER_QUEUE: {
          send: sendStub,
        },
      },
    };
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('should list products under the path and publish update events', async () => {
    listStub.resolves({
      objects: [
        { key: 'myorg/mysite/catalog/products/product-1.json' },
        { key: 'myorg/mysite/catalog/products/product-2.json' },
      ],
      truncated: false,
    });

    await queueExistingProductsForIndexing(ctx, 'myorg', 'mysite', '/products');

    assert(listStub.calledOnce);
    assert.deepStrictEqual(listStub.firstCall.args[0], {
      prefix: 'myorg/mysite/catalog/products/',
    });

    assert(sendStub.calledOnce);
    const sent = sendStub.firstCall.args[0];
    assert.strictEqual(sent.org, 'myorg');
    assert.strictEqual(sent.site, 'mysite');
    assert.strictEqual(sent.timestamp, 1700000000000);
    assert.deepStrictEqual(sent.products, [
      { path: '/products/product-1', action: 'update' },
      { path: '/products/product-2', action: 'update' },
    ]);
  });

  it('should not publish if no products exist under the path', async () => {
    listStub.resolves({
      objects: [],
      truncated: false,
    });

    await queueExistingProductsForIndexing(ctx, 'myorg', 'mysite', '/products');

    assert(listStub.calledOnce);
    assert(sendStub.notCalled);
  });

  it('should handle paginated results from R2', async () => {
    listStub.onFirstCall().resolves({
      objects: [
        { key: 'myorg/mysite/catalog/products/product-1.json' },
      ],
      truncated: true,
      cursor: 'cursor-1',
    });
    listStub.onSecondCall().resolves({
      objects: [
        { key: 'myorg/mysite/catalog/products/product-2.json' },
      ],
      truncated: false,
    });

    await queueExistingProductsForIndexing(ctx, 'myorg', 'mysite', '/products');

    assert.strictEqual(listStub.callCount, 2);
    assert.deepStrictEqual(listStub.firstCall.args[0], {
      prefix: 'myorg/mysite/catalog/products/',
    });
    assert.deepStrictEqual(listStub.secondCall.args[0], {
      prefix: 'myorg/mysite/catalog/products/',
      cursor: 'cursor-1',
    });

    assert(sendStub.calledOnce);
    const sent = sendStub.firstCall.args[0];
    assert.deepStrictEqual(sent.products, [
      { path: '/products/product-1', action: 'update' },
      { path: '/products/product-2', action: 'update' },
    ]);
  });

  it('should handle nested product paths', async () => {
    listStub.resolves({
      objects: [
        { key: 'myorg/mysite/catalog/us/en/products/product-1.json' },
        { key: 'myorg/mysite/catalog/us/en/products/nested/product-2.json' },
      ],
      truncated: false,
    });

    await queueExistingProductsForIndexing(ctx, 'myorg', 'mysite', '/us/en/products');

    assert(sendStub.calledOnce);
    const sent = sendStub.firstCall.args[0];
    assert.deepStrictEqual(sent.products, [
      { path: '/us/en/products/product-1', action: 'update' },
      { path: '/us/en/products/nested/product-2', action: 'update' },
    ]);
  });

  it('should strip .json suffix via publishIndexingJobs normalization', async () => {
    listStub.resolves({
      objects: [
        { key: 'myorg/mysite/catalog/products/product-1.json' },
      ],
      truncated: false,
    });

    await queueExistingProductsForIndexing(ctx, 'myorg', 'mysite', '/products');

    const sent = sendStub.firstCall.args[0];
    assert.strictEqual(sent.products[0].path, '/products/product-1');
  });
});
