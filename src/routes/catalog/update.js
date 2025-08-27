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

import { assertValidProduct } from '../../utils/product.js';
import { errorResponse } from '../../utils/http.js';
import StorageClient from './StorageClient.js';
import { assertAuthorization } from '../../utils/auth.js';
import Job from '../job/Job.js';

const MAX_PRODUCT_BULK = 50;
const SYNC_TIMEOUT = 10000; // 10 seconds

/**
 * Perform update for a set of products
 * @param {Context} ctx
 * @param {ProductBusEntry[]} products
 * @returns {Promise<Response>}
 */
async function doUpdate(ctx, products) {
  let results;

  try {
    const { log, config } = ctx;
    const storage = StorageClient.fromContext(ctx);
    const curResults = [];
    results = await storage.saveProducts(products, async (batchResults) => {
      // send indexer events after each batch
      const productEvents = batchResults.map((res) => ({
        sku: res.sluggedSku,
        action: 'update',
      }));

      await ctx.env.INDEXER_QUEUE.send({
        org: config.org,
        site: config.site,
        storeCode: config.storeCode,
        storeViewCode: config.storeViewCode,
        // @ts-ignore
        products: productEvents,
        timestamp: Date.now(),
      });

      curResults.push(...batchResults);

      // if job exists, it means we're in async mode
      // update the corresponding job file
      if (!ctx.job) return;

      ctx.job.data.results = curResults;
      await ctx.job.save();
    });

    log.info({
      action: 'save_products',
      result: JSON.stringify(results),
      timestamp: new Date().toISOString(),
    });

    // complete the job if we're in async mode
    if (ctx.job) {
      await ctx.job.complete();
    }
  } catch (e) {
    ctx.log.error({
      action: 'save_products',
      error: e,
      timestamp: new Date().toISOString(),
    });

    if (ctx.job) {
      await ctx.job.fail(e.message);
    }
  }

  return new Response(
    JSON.stringify({
      product: results.length === 1 ? results[0] : undefined,
      products: results.length > 1 ? results : undefined,
    }),
    {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

/**
 * Do bulk update for a set of products.
 * If the process takes longer than 10 seconds,
 * return a job and complete asynchronously.
 *
 * @param {Context} ctx
 * @param {ProductBusEntry[]} data
 * @returns {Promise<Response>}
 */
async function bulkUpdate(ctx, data) {
  const { log } = ctx;
  const updatePromise = doUpdate(ctx, data);
  /** @type {Promise<void>} */
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(), SYNC_TIMEOUT);
  });
  const maybeResult = await Promise.race([
    updatePromise,
    timeoutPromise,
  ]);

  // defined, means it completed
  if (maybeResult) {
    return maybeResult;
  }

  const topic = 'bulk-update';
  const name = crypto.randomUUID();
  log.info({
    action: 'create_job',
    topic,
    name,
    timestamp: new Date().toISOString(),
  });

  ctx.job = Job.create(ctx, topic, name, { results: [] });
  await ctx.job.save();

  // continue in background
  ctx.executionContext.waitUntil(updatePromise);

  // return 202
  return new Response(JSON.stringify({
    job: ctx.job,
    links: ctx.job.links,
  }), {
    status: 202,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * @type {RouteHandler}
 */
export default async function update(ctx) {
  const { config, data } = ctx;
  await assertAuthorization(ctx);

  if (config.sku === '*') {
    if (!Array.isArray(data)) {
      return errorResponse(400, 'data must be an array');
    }

    if (data.length > MAX_PRODUCT_BULK) {
      return errorResponse(400, `data must be an array of ${MAX_PRODUCT_BULK} or fewer products`);
    }

    for (const product of data) {
      const t0 = Date.now();
      assertValidProduct(product);
      const dt = Date.now() - t0;
      if (ctx.metrics) ctx.metrics.payloadValidationMs.push(dt);
    }

    return bulkUpdate(ctx, data);
  }

  const t0 = Date.now();
  assertValidProduct(data);
  const dt = Date.now() - t0;
  if (ctx.metrics) ctx.metrics.payloadValidationMs.push(dt);
  return doUpdate(ctx, [data]);
}
