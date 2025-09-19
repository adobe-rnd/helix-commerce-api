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

import processQueue from '@adobe/helix-shared-process-queue';
import { errorWithResponse } from './http.js';

/**
 * @typedef {Object} ImageData
 * @property {string} sourceUrl
 * @property {ArrayBuffer} data
 * @property {string} hash
 * @property {string} mimeType
 * @property {number} length
 * @property {string} [extension]
 */

// limit concurrency to max outgoing connections
const CONCURRENCY = 4;

/**
 * @param {string} url
 * @returns {string|undefined}
 */
const extractExtension = (url) => {
  const match = url.match(/\.([^.]+)$/);
  return match ? match[1] : undefined;
};

/**
 * @param {Context} ctx
 * @param {string} imageUrl
 * @returns {Promise<ImageData | null>}
 */
async function fetchImage(ctx, imageUrl) {
  const { log } = ctx;
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    log.info(`invalid image url provided: "${imageUrl}"`);
    return null;
  }

  log.debug('fetching image: ', imageUrl);
  const t0 = Date.now();
  const resp = await fetch(imageUrl, {
    method: 'GET',
    headers: {
      'accept-encoding': 'identity',
      accept: 'image/jpeg,image/jpg,image/png,image/gif,video/mp4,application/xml,image/x-icon,image/avif,image/webp,*/*;q=0.8',
    },
  });
  if (!resp.ok) {
    throw errorWithResponse(502, `Failed to fetch image: ${imageUrl} (${resp.status})`);
  }

  const data = await resp.arrayBuffer();
  const dt = Date.now() - t0;
  ctx.metrics?.imageDownloads?.push({ ms: dt, bytes: data.byteLength });
  const arr = await crypto.subtle.digest('SHA-1', data);
  const hash = Array.from(new Uint8Array(arr))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return {
    data,
    sourceUrl: imageUrl,
    hash,
    mimeType: resp.headers.get('content-type'),
    length: data.byteLength,
    extension: extractExtension(imageUrl),
  };
}

/**
 *
 * @param {Context} ctx
 * @param {ImageData} image
 * @returns {Promise<string>} new url
 */
async function uploadImage(ctx, image) {
  const {
    env,
    log,
    config: { org, site },
  } = ctx;
  const {
    data,
    hash,
    mimeType,
    extension,
    sourceUrl,
  } = image;

  const filename = `media_${hash}${extension ? `.${extension}` : ''}`;
  const key = `${org}/${site}/media/${filename}`;
  const t0 = Date.now();
  const resp = await env.CATALOG_BUCKET.head(key);
  if (resp) {
    log.debug(`image already in storage: ${sourceUrl} (${hash})`);
    const dt = Date.now() - t0;
    ctx.metrics?.imageUploads?.push({ ms: dt, alreadyExists: true });
    return `./${filename}`;
  }

  await env.CATALOG_BUCKET.put(key, data, {
    httpMetadata: {
      contentType: mimeType,
    },
    customMetadata: {
      sourceLocation: sourceUrl,
    },
  });
  const dt = Date.now() - t0;
  ctx.metrics?.imageUploads?.push({ ms: dt, alreadyExists: false });
  return `./${filename}`;
}

/**
 * @param {Context} ctx
 * @param {SharedTypes.ProductBusEntry} product
 * @returns {Promise<SharedTypes.ProductBusEntry>}
 */
export async function extractAndReplaceImages(ctx, product) {
  const { log } = ctx;
  /** @type {Map<string, Promise<string>>} */
  const processed = new Map();

  /**
   * @param {string} url
   * @returns {Promise<string|undefined>} new url
   */
  const processImage = async (url) => {
    if (processed.has(url)) {
      log.debug(`image already being processed: ${url}`);
      return processed.get(url);
    }

    /** @type {(value: string) => void} */
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    processed.set(url, promise);

    // TODO: fetch from hash lookup first, treat image urls as immutable
    const img = await fetchImage(ctx, url);
    let newUrl;
    if (img) {
      newUrl = await uploadImage(ctx, img);
    }
    resolve(newUrl);
    return newUrl;
  };

  const images = [
    ...(product.images ?? []),
    ...(product.variants ?? []).flatMap((v) => v.images ?? []),
  ];
  await processQueue(images, async (image) => {
    const newUrl = await processImage(image.url);
    if (newUrl) {
      image.url = newUrl;
    }
  }, CONCURRENCY);
  return product;
}
