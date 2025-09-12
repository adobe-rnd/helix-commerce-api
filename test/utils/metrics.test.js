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
import logMetrics from '../../src/utils/metrics.js';
import { DEFAULT_CONTEXT } from '../fixtures/context.js';

describe('utils/metrics logMetrics', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('logs summarized metrics when metrics exist', () => {
    const startedAt = Date.now() - 100;
    const ctx = DEFAULT_CONTEXT({
      log: { info: sinon.stub(), debug: sinon.stub() },
      config: { route: 'catalog/products' },
      metrics: {
        startedAt,
        payloadValidationMs: [2, 5, 3, 10],
        imageDownloads: [
          { ms: 11, bytes: 1000 },
          { ms: 9, bytes: 1500 },
        ],
        imageUploads: [
          { ms: 5, alreadyExists: false },
          { ms: 7, alreadyExists: true },
        ],
        productUploadsMs: [12, 15, 10],
      },
    });

    logMetrics(ctx);

    assert(ctx.log.info.calledOnce);
    const arg = ctx.log.info.firstCall.args[0];

    assert.equal(arg.action, 'perf_metrics');
    assert.equal(arg.metrics.route, 'catalog/products');
    assert(arg.metrics.elapsedTotalMs >= 0);

    // validation summary
    assert.deepEqual(arg.metrics.validation, {
      count: 4,
      total: 20,
      min: 2,
      max: 10,
      median: 4,
    });

    // download timings summary
    assert.deepEqual(arg.metrics.imageDownloads, {
      count: 2,
      total: 20,
      min: 9,
      max: 11,
      median: 10,
    });

    // download sizes summary
    assert.deepEqual(arg.metrics.imageDownloadSizes, {
      count: 2,
      total: 2500,
      min: 1000,
      max: 1500,
      median: 1250,
    });

    // uploads summary includes alreadyExistsCount
    assert.equal(arg.metrics.imageUploads.count, 2);
    assert.equal(arg.metrics.imageUploads.total, 12);
    assert.equal(arg.metrics.imageUploads.min, 5);
    assert.equal(arg.metrics.imageUploads.max, 7);
    assert.equal(arg.metrics.imageUploads.median, 6);
    assert.equal(arg.metrics.imageUploads.alreadyExistsCount, 1);

    // product JSON uploads
    assert.deepEqual(arg.metrics.productJsonUploads, {
      count: 3,
      total: 37,
      min: 10,
      max: 15,
      median: 12,
    });
  });

  it('does nothing if ctx.metrics is missing', () => {
    const ctx = DEFAULT_CONTEXT({
      log: { info: sinon.stub(), debug: sinon.stub() },
      config: { route: 'catalog/products' },
      metrics: undefined,
    });
    logMetrics(ctx);

    assert(ctx.log.info.notCalled);
  });

  it('catches errors and logs debug instead of throwing', () => {
    const ctx = DEFAULT_CONTEXT({
      log: { info: sinon.stub(), debug: sinon.stub() },
      config: { route: 'catalog/products' },
    });
    ctx.metrics = {};
    Object.defineProperty(ctx, 'metrics', {
      get() {
        throw new Error('boom');
      },
    });

    logMetrics(ctx);

    assert(ctx.log.debug.calledOnce);
    assert(ctx.log.info.notCalled);
  });

  it('omits optional sections when arrays empty', () => {
    const ctx = DEFAULT_CONTEXT({
      log: { info: sinon.stub(), debug: sinon.stub() },
      config: { route: 'catalog/products' },
      metrics: {
        startedAt: Date.now() - 50,
        payloadValidationMs: [],
        imageDownloads: [],
        imageUploads: [],
        productUploadsMs: [],
      },
    });

    logMetrics(ctx);

    const arg = ctx.log.info.firstCall.args[0];
    assert.equal(arg.action, 'perf_metrics');
    assert.equal(arg.metrics.route, 'catalog/products');
    assert.equal(typeof arg.metrics.elapsedTotalMs, 'number');
    assert(!('validation' in arg.metrics));
    assert(!('imageDownloads' in arg.metrics));
    assert(!('imageDownloadSizes' in arg.metrics));
    assert(!('imageUploads' in arg.metrics));
    assert(!('productJsonUploads' in arg.metrics));
  });
});
