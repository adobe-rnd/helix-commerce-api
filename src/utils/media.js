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

/**
 * @typedef {Object} ImageData
 * @property {string} sourceUrl
 * @property {ArrayBuffer} data
 * @property {string} hash
 * @property {string} mimeType
 * @property {number} length
 * @property {string} [extension]
 */

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
  const resp = await fetch(imageUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch image: ${resp.statusText}`);
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

/**
 *
 * @param {Context} ctx
 * @param {ImageData} image
 * @returns {Promise<string>} new url
 */
async function uploadImage(ctx, image) {
  const {
    env,
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
  const resp = await env.CATALOG_BUCKET.head(key);
  if (resp) {
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
  return `./${filename}`;
}

/**
 * @param {Context} ctx
 * @param {ProductBusEntry} product
 * @returns {Promise<ProductBusEntry>}
 */
export async function extractAndReplaceImages(ctx, product) {
  /** @type {Map<string, Promise<string>>} */
  const processed = new Map();

  /**
   * @param {string} url
   * @returns {Promise<string|undefined>} new url
   */
  const processImage = async (url) => {
    if (processed.has(url)) {
      return processed.get(url);
    }

    /** @type {(value: string) => void} */
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    processed.set(url, promise);

    const img = await fetchImage(ctx, url);
    const newUrl = await uploadImage(ctx, img);
    resolve(newUrl);
    return newUrl;
  };

  await Promise.all([
    processQueue([...product.images ?? []], async (image) => {
      const newUrl = await processImage(image.url);
      if (newUrl) {
        image.url = newUrl;
      }
    }),
    processQueue([...product.variants ?? []], async (variant) => {
      const newUrl = await processImage(variant.image);
      if (newUrl) {
        variant.image = newUrl;
      }
    }),
  ]);
  return product;
}
