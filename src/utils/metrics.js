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

/**
 * @param {number[]} arr
 */
const summarize = (arr) => {
  if (!arr || arr.length === 0) return undefined;
  const sorted = [...arr].sort((a, b) => a - b);
  const count = arr.length;
  const total = arr.reduce((s, n) => s + n, 0);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    count,
    total,
    min,
    max,
    median,
  };
};

/**
 * Log exit metrics.
 *
 * @param {Context} ctx
 */
export default function logMetrics(ctx) {
  try {
    const m = ctx.metrics;
    if (m) {
      const now = Date.now();
      const elapsedTotalMs = now - (m.startedAt || now);
      const validation = summarize(m.payloadValidationMs);
      const imageDownloadMs = m.imageDownloads?.map((d) => d.ms) || [];
      const imageDownloadSizes = m.imageDownloads?.map((d) => d.bytes) || [];
      const downloads = summarize(imageDownloadMs);
      const downloadSizes = summarize(imageDownloadSizes);
      const imageUploadMs = m.imageUploads?.map((u) => u.ms) || [];
      const uploads = summarize(imageUploadMs);
      const alreadyExistsCount = m.imageUploads?.filter((u) => u.alreadyExists).length || 0;
      const productUploads = summarize(m.productUploadsMs || []);

      const { requestInfo = { route: 'unknown' } } = ctx;
      const { route } = requestInfo;
      const metricsSummary = {
        route,
        elapsedTotalMs,
      };
      if (validation && validation.count) {
        metricsSummary.validation = validation;
      }
      if (downloads && downloads.count) {
        metricsSummary.imageDownloads = downloads;
        if (downloadSizes && downloadSizes.count) {
          metricsSummary.imageDownloadSizes = downloadSizes;
        }
      }
      if (uploads && uploads.count) {
        metricsSummary.imageUploads = {
          ...uploads,
          alreadyExistsCount,
        };
      }
      if (productUploads && productUploads.count) {
        metricsSummary.productJsonUploads = productUploads;
      }

      ctx.log.info({ action: 'perf_metrics', metrics: metricsSummary });
    }
  } catch (err) {
    // do not fail the request if metrics summarization fails
    ctx.log.debug('failed to summarize metrics', err);
  }
}
