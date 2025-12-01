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

/* eslint-disable no-await-in-loop */

import { assertRequiredProperties, nextRequestId } from '../../../utils/cache.js';
import { ffetch } from '../../../utils/http.js';

/**
 * Purge client for Fastly CDN using surrogate key-based cache invalidation.
 *
 * This client implements purging via Fastly's bulk surrogate key API, which allows
 * invalidating multiple cache entries tagged with specific keys in a single request.
 * The API supports up to 256 keys per request.
 */
export class FastlyPurgeClient {
  /**
   * Validates that all required Fastly configuration properties are present.
   *
   * Required properties: host, serviceId, authToken
   *
   * @param {import('@adobe/helix-admin-support').FastlyConfig} config - Fastly CDN config
   * @throws {Error} If any required property is missing or falsy
   */
  static validate(config) {
    assertRequiredProperties(config, 'invalid purge config', 'host', 'serviceId', 'authToken');
  }

  /**
   * Indicates whether this client supports purging by surrogate keys.
   *
   * @returns {boolean} Always returns true (Fastly supports surrogate key purging)
   */
  static supportsPurgeByKey() {
    return true;
  }

  /**
   * Purges cached content from Fastly CDN by surrogate keys.
   *
   * This method sends bulk purge requests to Fastly's API, automatically batching
   * keys into groups of 256 (Fastly's API limit). Each batch is processed sequentially
   * with tracking IDs for observability.
   *
   * @param {Context} ctx - Request context with logging and config
   * @param {import('@adobe/helix-admin-support').FastlyConfig} purgeConfig - Fastly config
   * @param {Object} params - Purge parameters
   * @param {Array<string>} [params.keys] - Surrogate keys to purge (max 256 per request)
   * @throws {Error} If the API request fails or returns a non-OK status
   */
  static async purge(ctx, purgeConfig, { keys }) {
    const { log, config } = ctx;
    const { siteKey, storeCode, storeViewCode } = config;
    const siteId = `${siteKey}/${storeCode}/${storeViewCode}`;

    const {
      host,
      serviceId,
      authToken,
    } = purgeConfig;

    let msg;
    if (keys?.length) {
      const method = 'POST';
      const headers = {
        'content-type': 'application/json',
        accept: 'application/json',
        'fastly-key': authToken,
      };

      const purgeKeys = [...keys];
      while (purgeKeys.length) {
        // only 256 keys can be purged with a single request
        // https://developer.fastly.com/reference/api/purging/#bulk-purge-tag
        const batch = purgeKeys.splice(0, 256);

        const body = { surrogate_keys: batch };
        const url = `https://api.fastly.com/service/${serviceId}/purge`;
        let resp;
        const id = nextRequestId(ctx);
        try {
          log.info(`${siteId} [${id}] [fastly] ${host} purging keys '${batch}'`);
          resp = await ffetch(url, { method, headers, body: JSON.stringify(body) });
        } catch (err) {
          msg = `${siteId} [${id}] [fastly] ${host} purging ${batch.length} surrogate key(s) failed: ${err}`;
          log.error(msg);
          throw new Error(msg);
        }
        const result = await resp.text();
        if (resp.ok) {
          log.info(`${siteId} [fastly] ${host} purging ${keys.length} surrogate key(s) succeeded: ${resp.status} - ${result}`);
        } else {
          msg = `${siteId} [fastly] ${host} purging ${keys.length} surrogate key(s) failed: ${resp.status} - ${result}`;
          log.error(msg);
          throw new Error(msg);
        }
      }
    }
  }
}
