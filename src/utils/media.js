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

import { StorageClient } from '@dylandepass/helix-product-shared';
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

const RETRY_CODES = [429, 403];

/**
 * @param {string} url
 * @returns {string|undefined}
 */
const extractExtension = (url) => {
  const match = url.match(/\.([^.]+)$/);
  return match ? match[1] : undefined;
};

/**
 * @param {Context} pctx
 * @param {string} pimageUrl
 * @returns {Promise<SharedTypes.MediaData | null>}
 */
async function fetchImage(pctx, pimageUrl) {
  /**
   * @param {Context} ctx
   * @param {string} imageUrl
   * @param {number} attempts
   * @returns {Promise<SharedTypes.MediaData | null>}
   */
  async function doFetch(ctx, imageUrl, attempts = 0) {
    const { log } = ctx;
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
      log.info(`invalid image url provided: "${imageUrl}"`);
      return null;
    }

    log.debug('fetching image: ', imageUrl);
    const resp = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'accept-encoding': 'identity',
        accept: 'image/jpeg,image/jpg,image/png,image/gif,video/mp4,application/xml,image/x-icon,image/avif,image/webp,*/*;q=0.8',
      },
    });
    if (!resp.ok) {
      if (RETRY_CODES.includes(resp.status)) {
        if (attempts < 3) {
          // eslint-disable-next-line no-promise-executor-return
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempts));
          return doFetch(ctx, imageUrl, attempts + 1);
        }
      }
      throw errorWithResponse(502, `Failed to fetch image: ${imageUrl} (${resp.status})`);
    }

    const data = await resp.arrayBuffer();
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

  return doFetch(pctx, pimageUrl);
}

/**
 * @param {Context} ctx
 * @param {string} org
 * @param {string} site
 * @param {SharedTypes.ProductBusEntry} product
 * @returns {Promise<SharedTypes.ProductBusEntry>}
 */
export async function extractAndReplaceImages(ctx, org, site, product) {
  const { log } = ctx;
  const storageClient = StorageClient.fromContext(ctx);
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

    const img = await fetchImage(ctx, url);
    let newUrl;
    if (img) {
      newUrl = await storageClient.saveImage(ctx, org, site, img);
    }
    resolve(newUrl);
    return newUrl;
  };

  const images = [
    ...(product.images ?? []),
    ...(product.variants ?? []).flatMap((v) => v.images ?? []),
  ];

  // process images sequentially, backoff when encountering errors
  for (const image of images) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const newUrl = await processImage(image.url);
      if (newUrl) {
        image.url = newUrl;
      }
    } catch (e) {
      log.error('error processing image: ', e);
    }
  }
  return product;
}
