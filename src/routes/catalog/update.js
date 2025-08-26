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
import { assertValidProduct } from '../../utils/product.js';
import { errorResponse } from '../../utils/http.js';
import StorageClient from './StorageClient.js';
import { assertAuthorization } from '../../utils/auth.js';
import { extractAndReplaceImages } from '../../utils/media.js';

const MAX_PRODUCT_BULK = 50;
const MAX_TOTAL_IMAGES = 50;

/**
 * @type {RouteHandler}
 */
export default async function update(ctx) {
  const { config, log, data } = ctx;
  await assertAuthorization(ctx);

  let dataArr;

  if (config.sku === '*') {
    if (!Array.isArray(data)) {
      return errorResponse(400, 'data must be an array');
    }

    if (data.length > MAX_PRODUCT_BULK) {
      return errorResponse(400, `data must be an array of ${MAX_PRODUCT_BULK} or fewer products`);
    }

    data.forEach((product) => {
      assertValidProduct(product);
    });

    // ensure the total number of images is less than 50
    const totalImages = data.reduce((acc, product) => acc + product.images.length, 0);
    if (totalImages > MAX_TOTAL_IMAGES) {
      return errorResponse(400, 'total number of images must be less than 100');
    }
    dataArr = data;
  } else {
    assertValidProduct(data);
    dataArr = [data];
  }

  // TODO: make image upload async, replace with hash immediately
  const products = await processQueue(
    dataArr,
    (oneProduct) => extractAndReplaceImages(ctx, oneProduct),
  );
  const storage = StorageClient.fromContext(ctx);
  const saveResults = await storage.saveProducts(products);

  const productEvents = saveResults.map((res) => ({
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

  log.info({
    action: 'save_products',
    result: JSON.stringify(saveResults),
    timestamp: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      ...saveResults,
      product: products.length === 1 ? products[0] : undefined,
      products: products.length > 1 ? products : undefined,
    }),
    {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}
