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
import { publishIndexingJobs } from '../../src/utils/indexer.js';

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

  it('should handle empty products array', async () => {
    const payload = {
      org: 'myorg',
      site: 'mysite',
      products: [],
      timestamp: 1234567890,
    };

    await publishIndexingJobs(ctx, payload);

    assert(sendStub.calledOnce);
    const sent = sendStub.firstCall.args[0];
    assert.deepStrictEqual(sent.products, []);
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
});
