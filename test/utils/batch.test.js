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

/* eslint-disable max-len */

import assert from 'node:assert';
import sinon from 'sinon';
import { BatchProcessor } from '../../src/utils/batch.js';

describe('BatchProcessor', () => {
  let ctx;
  let mockBatchHandler;
  beforeEach(async () => {
    ctx = {
      log: {
        info: sinon.stub(),
        error: sinon.stub(),
      },
    };
    mockBatchHandler = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should process items in correct batch sizes', async () => {
    const items = Array.from({ length: 125 }, (_, i) => ({ sku: `SKU${i}` }));
    mockBatchHandler.callsFake((batchItems) => Promise.resolve(batchItems.map((item) => ({ sku: item.sku, status: 200 }))));
    const processor = new BatchProcessor(ctx, mockBatchHandler, 50);

    const results = await processor.process(items);

    assert.equal(results.length, 125);
    assert.equal(mockBatchHandler.callCount, 3);
    assert.equal(ctx.log.info.callCount, 3);
    assert(ctx.log.info.calledWith(
      'Processing batch 1 of 3: Handling 50 items.',
    ));
  });

  it('should use default batch size when not specified', async () => {
    const items = Array.from({ length: 75 }, (_, i) => ({ sku: `SKU${i}` }));
    const processor = new BatchProcessor(ctx, mockBatchHandler);

    await processor.process(items);

    assert.equal(mockBatchHandler.callCount, 2);
  });

  it('should handle empty input array', async () => {
    const processor = new BatchProcessor(ctx, mockBatchHandler);

    const results = await processor.process([]);

    assert.deepEqual(results, []);
    assert(mockBatchHandler.notCalled);
    assert(ctx.log.info.notCalled);
  });

  it('should handle batch processing errors', async () => {
    const items = [
      { sku: 'sku1' },
      { sku: 'sku2' },
      { sku: 'sku3' },
    ];
    const error = new Error('Batch processing failed');
    mockBatchHandler.rejects(error);
    const processor = new BatchProcessor(ctx, mockBatchHandler);

    // Execute
    const results = await processor.process(items);

    // Verify
    assert.equal(results.length, 3);
    assert.deepEqual(results, [
      {
        sku: 'sku1',
        status: 500,
        message: 'Batch processing error: Batch processing failed',
      },
      {
        sku: 'sku2',
        status: 500,
        message: 'Batch processing error: Batch processing failed',
      },
      {
        sku: 'sku3',
        status: 500,
        message: 'Batch processing error: Batch processing failed',
      },
    ]);
  });

  it('should handle items without SKU property in error case', async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const error = new Error('Processing failed');
    mockBatchHandler.rejects(error);
    const processor = new BatchProcessor(ctx, mockBatchHandler);

    const results = await processor.process(items);

    assert.equal(results.length, 2);
    results.forEach((result) => {
      assert.deepEqual(result, {
        sku: 'unknown',
        status: 500,
        message: 'Batch processing error: Processing failed',
      });
    });
  });
});
