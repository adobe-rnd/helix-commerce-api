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
 * Purge client for Adobe-managed CDN (Fastly-backed) via purge proxy.
 *
 * This client implements purging for Adobe's managed Helix CDN infrastructure,
 * which is backed by Fastly but accessed through Adobe's purge proxy service.
 * Supports surrogate key purging with batching (256 keys per request).
 */
export class ManagedPurgeClient {
  /**
   * Validates that all required managed CDN configuration properties are present.
   *
   * Required properties: host
   * Optional properties: envId (overrides host for purge endpoint)
   *
   * @param {import('@adobe/helix-admin-support').ManagedConfig} config - Managed CDN config
   * @throws {Error} If any required property is missing or falsy
   */
  static validate(config) {
    assertRequiredProperties(config, 'invalid purge config', 'host');
  }

  /**
   * Indicates whether this client supports purging by surrogate keys.
   *
   * @returns {boolean} Always returns true (managed CDN supports surrogate key purging)
   */
  static supportsPurgeByKey() {
    return true;
  }

  /**
   * Purges cached content from Adobe-managed CDN by surrogate keys.
   *
   * Batches surrogate keys (256 per request) and sends them sequentially to the purge proxy.
   * Authentication uses the HLX_ADMIN_MANAGED_PURGEPROXY_TOKEN environment variable.
   * If `envId` is configured, it's used instead of `host` for key purge endpoints.
   *
   * @param {Context} ctx - Request context with logging, config, and env
   * @param {import('@adobe/helix-admin-support').ManagedConfig} purgeConfig - Managed CDN cfg
   * @param {Object} params - Purge parameters
   * @param {Array<string>} [params.keys] - Surrogate keys to purge (batched at 256)
   * @throws {Error} If any purge request fails
   */
  static async purge(ctx, purgeConfig, { keys = [] }) {
    /* c8 ignore next 3 */
    if (!keys || !keys.length) {
      return;
    }

    const { log, config, env: { HLX_ADMIN_MANAGED_PURGEPROXY_TOKEN: authToken } } = ctx;
    const { siteKey, storeCode, storeViewCode } = config;
    const siteId = `${siteKey}/${storeCode}/${storeViewCode}`;

    /** @type {import('@adobe/helix-admin-support').ManagedConfig & { envId?: string }} */
    const configWithEnvId = purgeConfig;
    const { host, envId } = configWithEnvId;

    let msg;
    if (keys?.length) {
      const method = 'POST';

      const purgeKeys = [...keys];
      while (purgeKeys.length) {
        // only 256 keys can be purged with a single request
        // https://developer.fastly.com/reference/api/purging/#bulk-purge-tag
        const batch = purgeKeys.splice(0, 256);

        const url = `https://purgeproxy.adobeaemcloud.com/purge/${envId || host}`;
        let resp;
        const id = nextRequestId(ctx);
        try {
          log.info(`${siteId} [${id}] [managed] ${envId || host} purging keys '${batch}'`);
          // Create a fresh headers object for each request to avoid mutation issues
          const headers = {
            accept: 'application/json',
            'x-aem-purge-key': /** @type {string} */ (authToken),
            'Surrogate-Key': batch.join(' '),
          };
          resp = await ffetch(url, { method, headers });
        } catch (err) {
          msg = `${siteId} [${id}] [managed] ${envId || host} purging ${batch.length} surrogate key(s) failed: ${err}`;
          log.error(msg);
          throw new Error(msg);
        }
        const result = await resp.text();
        if (resp.ok) {
          log.info(`${siteId} [managed] ${host} purging ${keys.length} surrogate key(s) succeeded: ${resp.status} - ${result}`);
        } else {
          msg = `${siteId} [managed] ${host} purging ${keys.length} surrogate key(s) failed: ${resp.status} - ${result}`;
          log.error(msg);
          throw new Error(msg);
        }
      }
    }
  }
}
