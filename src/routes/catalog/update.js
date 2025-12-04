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
import StorageClient from '../../utils/StorageClient.js';
import { assertAuthorization } from '../../utils/auth.js';
import { fetchHelixConfig } from '../../utils/config.js';

const MAX_PRODUCT_BULK = 50;
const MAX_IMAGES_PER_JOB = 500;

/**
 * Whether to process images asynchronously.
 * @param {Context} ctx
 * @param {SharedTypes.ProductBusEntry[]} products
 */
function shouldProcessImagesAsync(ctx, products) {
  if (ctx.env.ENVIRONMENT === 'ci') {
    // allow selecting async behavior for post-deploy tests
    if (ctx.url.searchParams.get('asyncImages') === 'true') {
      return true;
    }
  }
  return (products.length > 10
    || products.reduce((acc, product) => acc + (product.images?.length ?? 0), 0) > 10);
}

/**
 * Publish image collector job(s)
 * Split into chunks of at most `MAX_IMAGES_PER_JOB` images per job
 *
 * @param {Context} ctx
 * @param {SharedTypes.ProductBusEntry[]} products
 * @param {SharedTypes.ImageCollectorJob} payload
 */
export async function publishImageCollectorJobs(ctx, products, payload) {
  // count images per sku
  const imageCountBySku = products.reduce((acc, product) => {
    acc[product.sku] = (product.images?.length ?? 0)
      + (product.variants?.reduce((tally, variant) => tally + variant.images.length, 0) ?? 0);
    return acc;
  }, {});

  const allProducts = payload.products;
  let chunk = [];
  let imageCount = 0;
  while (allProducts.length > 0) {
    while (imageCount < MAX_IMAGES_PER_JOB && allProducts.length > 0) {
      const aProduct = allProducts.shift();
      chunk.push(aProduct);
      imageCount += imageCountBySku[aProduct.sku] ?? 0;
    }

    // eslint-disable-next-line no-await-in-loop
    await ctx.env.IMAGE_COLLECTOR_QUEUE.send({ ...payload, products: chunk });
    chunk = [];
    imageCount = 0;
  }
}

/**
 * Do update for a set of products.
 *
 * @param {Context} ctx
 * @param {SharedTypes.ProductBusEntry[]} products
 * @returns {Promise<Response>}
 */
async function doUpdate(ctx, products) {
  /** @type {Partial<BatchResult>[]} */
  let results;

  try {
    const { log, config } = ctx;

    const helixConfig = await fetchHelixConfig(ctx, config.org, config.site);
    ctx.attributes.helixConfigCache = helixConfig;

    const storage = StorageClient.fromContext(ctx);
    // images are fetched asynchronously if there are more than 10 products,
    // of it there are more than 10 images total across all products
    const asyncImages = shouldProcessImagesAsync(ctx, products);
    results = await storage.saveProducts(products, asyncImages);

    const payload = {
      org: config.org,
      site: config.site,
      storeCode: config.storeCode,
      storeViewCode: config.storeViewCode,
      // @ts-ignore
      products: results.map((r) => ({ sku: r.sluggedSku, action: 'update' })),
      timestamp: Date.now(),
    };

    await ctx.env.INDEXER_QUEUE.send(payload);

    if (asyncImages) {
      await publishImageCollectorJobs(ctx, products, payload);
    }

    log.info({
      action: 'save_products',
      result: JSON.stringify(results),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    ctx.log.error({
      action: 'save_products',
      error: e,
      timestamp: new Date().toISOString(),
    });
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
 * @type {RouteHandler}
 */
export default async function update(ctx) {
  const { config, data } = ctx;
  await assertAuthorization(ctx);

  if (config.sku === '*') {
    if (ctx.info.method !== 'POST') {
      return errorResponse(405, 'method not allowed');
    }

    if (!Array.isArray(data)) {
      return errorResponse(400, 'data must be an array');
    }

    if (data.length > MAX_PRODUCT_BULK) {
      return errorResponse(400, `data must be an array of ${MAX_PRODUCT_BULK} or fewer products`);
    }

    for (const product of data) {
      const t0 = Date.now();
      assertValidProduct(ctx, product);
      const dt = Date.now() - t0;
      if (ctx.metrics) ctx.metrics.payloadValidationMs.push(dt);
    }

    return doUpdate(ctx, data);
  }

  const t0 = Date.now();
  assertValidProduct(ctx, data);
  const dt = Date.now() - t0;
  if (ctx.metrics) ctx.metrics.payloadValidationMs.push(dt);
  return doUpdate(ctx, [data]);
}
