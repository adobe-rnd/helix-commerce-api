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
import { assertRequiredProperties, nextRequestId } from '../../../utils/cache.js';
import { ffetch } from '../../../utils/http.js';

/**
 * Purge client for Cloudflare CDN using cache tag-based invalidation.
 *
 * This client implements purging via Cloudflare's cache purge API using tags
 * (Cloudflare's equivalent of surrogate keys). The API supports up to 30 tags
 * per request, and this client automatically batches and processes requests
 * in parallel for optimal performance.
 */
export class CloudflarePurgeClient {
  /**
   * Validates that all required Cloudflare configuration properties are present.
   *
   * Required properties: host, zoneId, apiToken
   *
   * @param {import('@adobe/helix-admin-support').CloudflareConfig} config - Cloudflare config
   * @throws {Error} If any required property is missing or falsy
   */
  static validate(config) {
    assertRequiredProperties(config, 'invalid purge config', 'host', 'zoneId', 'apiToken');
  }

  /**
   * Indicates whether this client supports purging by cache tags.
   *
   * @returns {boolean} Always returns true (Cloudflare supports cache tag purging)
   */
  static supportsPurgeByKey() {
    return true;
  }

  /**
   * Purges cached content from Cloudflare CDN by cache tags.
   *
   * This method sends purge requests to Cloudflare's API, automatically batching
   * tags into groups of 30 (Cloudflare's API limit). Batches are processed in
   * parallel using a queue processor for improved performance.
   *
   * @param {Context} ctx - Request context with logging and config
   * @param {import('@adobe/helix-admin-support').CloudflareConfig} purgeConfig - Cloudflare cfg
   * @param {Object} params - Purge parameters
   * @param {Array<string>} [params.keys] - Cache tags to purge (max 30 per request)
   * @throws {Error} If any API request fails or returns success: false
   */
  static async purge(ctx, purgeConfig, { keys }) {
    const { log, config } = ctx;
    const { siteKey, storeCode, storeViewCode } = config;
    const siteId = `${siteKey}/${storeCode}/${storeViewCode}`;

    const { host, zoneId, apiToken } = purgeConfig;
    const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
    const headers = { Authorization: `Bearer ${apiToken}` };
    const method = 'POST';

    // cloudflare API has a limit of 30 urls/tags per purge
    const BATCH_SIZE = 30;

    const payloads = [];
    const tags = keys?.length ? [...keys] : [];
    while (tags.length) {
      payloads.push({
        tags: tags.splice(0, BATCH_SIZE),
      });
    }

    await processQueue(payloads, async (body) => {
      const id = nextRequestId(ctx);
      /* c8 ignore next */
      log.info(`${siteId} [${id}] [cloudflare] purging '${host}' with ${JSON.stringify(body)}`);
      const resp = await ffetch(url, { method, headers, body: JSON.stringify(body) });
      const result = await resp.text();
      if (resp.ok && JSON.parse(result).success === true) {
        /* c8 ignore next */
        log.info(`${siteId} [${id}] [cloudflare] ${host} purge succeeded: ${result}`);
      } else {
        /* c8 ignore next */
        const msg = `${siteId} [${id}] [cloudflare] ${host} purge failed: ${resp.status} - ${result} - cf-ray: ${resp.headers.get('cf-ray')}`;
        log.error(msg);
        /* c8 ignore next */
        log.error(`${siteId} [${id}] [cloudflare] ${host} purge body was: ${JSON.stringify(body)}`);
        throw new Error(msg);
      }
    });
  }
}
