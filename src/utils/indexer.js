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

  const normalized = {
    ...payload,
    products: payload.products.map((product) => ({
      ...product,
      path: product.path.endsWith('.json') ? product.path.slice(0, -5) : product.path,
    })),
  };

  await indexerQueue.send(normalized);
}
