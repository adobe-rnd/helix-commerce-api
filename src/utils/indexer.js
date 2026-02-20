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

/**
 * Normalize and publish an indexing job to the indexer queue.
 * Strips .json extension from product paths before publishing.
 *
 * @param {Context} ctx
 * @param {SharedTypes.IndexingJob} payload
 */
export async function publishIndexingJobs(ctx, payload) {
  const {
    env: {
      INDEXER_QUEUE: indexerQueue,
    },
  } = ctx;
  const chunkSize = 100;
  const products = [...payload.products];

  while (products.length > 0) {
    const chunk = products.slice(0, chunkSize);

    // eslint-disable-next-line no-await-in-loop
    await indexerQueue.send({
      ...payload,
      products: chunk.map((product) => ({
        ...product,
        path: product.path.endsWith('.json') ? product.path.slice(0, -5) : product.path,
      })),
    });

    products.splice(0, chunkSize);
  }
}

/**
 * List all products stored under a given path prefix and publish
 * indexing jobs so they get indexed without re-ingestion.
 *
 * @param {Context} ctx
 * @param {string} org
 * @param {string} site
 * @param {string} path - The index path (e.g. '/products')
 */
export async function queueExistingProductsForIndexing(ctx, org, site, path) {
  const { env: { CATALOG_BUCKET } } = ctx;
  const prefix = `${org}/${site}/catalog${path}/`;
  const catalogPrefix = `${org}/${site}/catalog`;
  const products = [];

  let truncated = true;
  let cursor;

  while (truncated) {
    const listOptions = { prefix };
    if (cursor) {
      listOptions.cursor = cursor;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await CATALOG_BUCKET.list(listOptions);

    for (const obj of result.objects) {
      const productPath = obj.key.substring(catalogPrefix.length);
      products.push({ path: productPath, action: 'update' });
    }

    truncated = result.truncated;
    if (result.truncated) {
      cursor = result.cursor;
    }
  }

  if (products.length > 0) {
    await publishIndexingJobs(ctx, {
      org,
      site,
      products,
      timestamp: Date.now(),
    });
  }
}
