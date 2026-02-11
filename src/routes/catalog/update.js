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

import processQueue from '@adobe/helix-shared-process-queue';
import { isRelativePath } from '@dylandepass/helix-product-shared';
import { assertValidProduct } from '../../utils/product.js';
import { errorResponse } from '../../utils/http.js';
import StorageClient from '../../utils/StorageClient.js';
import { fetchHelixConfig } from '../../utils/config.js';

const MAX_PRODUCT_BULK = 50;
const MAX_IMAGES_PER_JOB = 500;

/**
 * Whether to process images asynchronously.
 * @param {Context} ctx
 * @returns {boolean}
 */
function forcedAsyncImages(ctx) {
  if (ctx.env.ENVIRONMENT === 'ci') {
    // allow selecting async behavior for post-deploy tests
    if (ctx.url.searchParams.get('asyncImages') === 'true') {
      return true;
    }
  }
  return false;
}

/**
 * Whether to process images asynchronously.
 * @param {SharedTypes.ProductBusEntry[]} products
 */
function shouldProcessImagesAsync(products) {
  const totalImages = products.reduce((acc, product) => {
    const productImages = product.images?.length ?? 0;
    const variantImages = product.variants?.reduce(
      (tally, variant) => tally + (variant.images?.length ?? 0),
      0,
    ) ?? 0;
    return acc + productImages + variantImages;
  }, 0);
  return products.length > 10 || totalImages > 10;
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
 * Replace already processed images with hashed paths
 * Limited by the number of requests per invocation
 * Products returned are mutated in place, and may or may not have their images replaced
 *
 * @param {Context} ctx
 * @param {SharedTypes.ProductBusEntry[]} products
 * @returns {Promise<SharedTypes.ProductBusEntry[]>}
 */
async function replaceProcessedImages(ctx, products) {
  const { org, site } = ctx.requestInfo;
  const storage = StorageClient.fromContext(ctx);

  // each product needs a PUT to save
  // plus some reserved overhead (100 requests) for retries and pushing events to queue
  let requestLimit = 1000 - products.length - 100;

  // process each product
  await processQueue([...products], async (product) => {
    // immediately subtract the number of HEADs used for this product
    requestLimit -= (
      product.images.length
      + product.variants.flatMap((variant) => variant.images.length).length
    );
    if (requestLimit <= 0) {
      return;
    }

    /**
     * Lookup, and replace if existing image location is found
     * @param {SharedTypes.ProductBusImage} image
     * @returns {Promise<boolean>} true if the image was replaced
     */
    const replaceImage = async (image) => {
      if (isRelativePath(image.url)) {
        return false;
      }
      const location = await storage.lookupImageLocation(ctx, org, site, image.url);
      if (location) {
        image.url = location;
        return true;
      }
      return false;
    };

    const images = [
      ...product.images,
      ...(product.variants?.flatMap((variant) => variant.images) ?? []),
    ];
    await Promise.all(
      images.map(async (image) => {
        await replaceImage(image);
      }),
    );
  });
  return products;
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
    const { log, requestInfo } = ctx;
    const { org, site } = requestInfo;

    const helixConfig = await fetchHelixConfig(ctx, org, site);
    ctx.attributes.helixConfigCache = helixConfig;

    const storage = StorageClient.fromContext(ctx);
    // images are fetched asynchronously if there are more than 10 products,
    // of it there are more than 10 images total across all products
    const forceAsyncImages = forcedAsyncImages(ctx);
    const asyncImages = forceAsyncImages || shouldProcessImagesAsync(products);
    if (asyncImages && !forceAsyncImages) {
      // if we're going to process images asynchronously
      // try to replace already processed images to avoid processing them asynchronously
      products = await replaceProcessedImages(ctx, products);
    }
    results = await storage.saveProductsByPath(products, asyncImages);

    const payload = {
      org,
      site,
      // @ts-ignore
      products: results.map((r) => ({ path: r.path, action: 'update' })),
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
  const { requestInfo, data } = ctx;
  const {
    path, method, org, site,
  } = requestInfo;
  ctx.authInfo.assertPermissions('catalog:write');
  ctx.authInfo.assertOrgSite(org, site);

  // Handle bulk operations (POST with literal "*")
  if (path === '/*') {
    if (method !== 'POST') {
      return errorResponse(405, 'method not allowed');
    }

    if (!Array.isArray(data)) {
      return errorResponse(400, 'data must be an array');
    }

    if (data.length > MAX_PRODUCT_BULK) {
      return errorResponse(400, `data must be an array of ${MAX_PRODUCT_BULK} or fewer products`);
    }

    // Validate each product has a path field
    for (const product of data) {
      if (!product.path) {
        return errorResponse(400, 'each product must have a path field for bulk operations');
      }

      const t0 = Date.now();
      assertValidProduct(ctx, product);
      const dt = Date.now() - t0;
      if (ctx.metrics) ctx.metrics.payloadValidationMs.push(dt);
    }

    return doUpdate(ctx, data);
  }

  // Handle single product operation
  // Strip .json from URL path before adding to product data
  const productPath = path.endsWith('.json') ? path.slice(0, -5) : path;

  // verify path in body matches URL path
  if (data.path) {
    if (data.path !== productPath) {
      return errorResponse(400, `path in body (${data.path}) must match path in URL (${productPath})`);
    }
  } else {
    // If body doesn't have path, add it from URL
    data.path = productPath;
  }

  const t0 = Date.now();
  assertValidProduct(ctx, data);
  const dt = Date.now() - t0;
  if (ctx.metrics) ctx.metrics.payloadValidationMs.push(dt);
  return doUpdate(ctx, [data]);
}
