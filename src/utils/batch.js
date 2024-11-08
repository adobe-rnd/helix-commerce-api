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

/* eslint-disable no-await-in-loop, max-len */

const DEFAULT_BATCH_SIZE = 50;

export class BatchProcessor {
  /**
   * @param {Context} ctx - The context object containing utilities like logging.
   * @param {(batch: Product[] | string[]) => Promise<Partial<BatchResult>[]>} batchHandler - The function to process each batch.
   * @param {number} [batchSize] - The number of items per batch.
   */
  constructor(ctx, batchHandler, batchSize = DEFAULT_BATCH_SIZE) {
    this.batchSize = batchSize;
    this.batchHandler = batchHandler;
    this.log = ctx.log;
  }

  /**
   * Processes the provided items in batches and collects their responses.
   *
   * @template T
   * @param {Product[] | string[]} items - The array of items to process.
   * @returns {Promise<Partial<BatchResult>[]>} - Resolves with an array of BatchResult objects.
   */
  async process(items) {
    const results = [];
    const totalBatches = Math.ceil(items.length / this.batchSize);

    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;
      this.log.info(
        `Processing batch ${batchNumber} of ${totalBatches}: Handling ${batch.length} items.`,
      );

      try {
        const batchResults = await this.batchHandler(batch);
        results.push(...batchResults);
      } catch (error) {
        this.log.error(`Error processing batch ${batchNumber}:`, error);
        batch.forEach((item) => {
          results.push({
            sku: item.sku || 'unknown', // Adjust based on item structure
            status: 500,
            message: `Batch processing error: ${error.message}`,
          });
        });
      }
    }

    return results;
  }
}
