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

import { computeAuthoredContentKey, computeProductSkuKey, computeProductUrlKeyKey } from '@dylandepass/helix-product-shared';
import { FastlyPurgeClient } from './clients/fastly.js';
import { CloudflarePurgeClient } from './clients/cloudflare.js';
import { ManagedPurgeClient } from './clients/managed.js';
import { AkamaiPurgeClient } from './clients/akamai.js';
import { fetchHelixConfig, resolveProductPath } from '../../utils/config.js';

/**
 * Map of CDN type identifiers to their corresponding purge client implementations.
 * Supported CDN types:
 * - fastly: Fastly CDN with surrogate key purging
 * - akamai: Akamai CDN with Edge Grid authentication
 * - cloudflare: Cloudflare CDN with cache tag purging
 * - managed: Adobe-managed CDN (Fastly-backed)
 */
const PURGE_CLIENTS = {
  fastly: FastlyPurgeClient,
  akamai: AkamaiPurgeClient,
  cloudflare: CloudflarePurgeClient,
  managed: ManagedPurgeClient,
};

/**
 * Purges cached content from the production CDN using surrogate keys.
 *
 * This function validates the CDN configuration, selects the appropriate purge client
 * based on the CDN type, and executes the purge operation. If validation fails, the
 * purge is skipped with a warning (to handle partially-configured customer setups).
 *
 * @param {Context} ctx - The request context with logging and configuration
 * @param {Object} cdnConfig - CDN-specific configuration (type, credentials, etc.)
 * @param {string} cdnConfig.type - CDN provider type
 *   ('fastly', 'cloudflare', 'akamai', 'managed')
 * @param {Object} params - Purge parameters
 * @param {Array<string>} [params.keys] - Surrogate keys (cache tags) to purge
 * @throws {Error} If the CDN type is not supported
 */
async function purgeProductionCDN(ctx, cdnConfig, { keys }) {
  const { type } = cdnConfig;

  /* c8 ignore next 3 */
  if ((!keys || !keys.length)) {
    return;
  }

  const client = PURGE_CLIENTS[type];
  if (!client) {
    throw new Error(`Unsupported 'cdn.prod.type' value: ${type}`);
  }
  try {
    client.validate(cdnConfig);
  } catch (e) {
    // ignore the production purge since customers might have
    // deliberately configured their setup only partially
    ctx.log.warn(`ignoring production cdn purge config for type "${type}": ${e.message}`);
    return;
  }

  await client.purge(ctx, cdnConfig, { keys });
}

/**
 * Purges cached product data from the production CDN by SKU and/or URL key.
 *
 * This function computes surrogate keys for the given product identifiers and
 * optionally includes the authored content key if a contentBusId is configured.
 * It then triggers a purge of all matching cache entries across the configured
 * CDN provider. This is typically called after product updates to ensure cache
 * freshness.
 *
 * The function gracefully handles missing configurations by logging warnings and
 * skipping the purge operation.
 *
 * @param {Context} ctx - The request context with logging, config, and env
 * @param {string} [sku] - Product SKU to purge (optional)
 * @param {string} [urlKey] - Product URL key to purge (optional)
 * @returns {Promise<void>}
 *
 * @example
 * // Purge by both SKU and URL key
 * await purge(ctx, 'PROD-123', 'awesome-product');
 *
 * @example
 * // Purge by SKU only
 * await purge(ctx, 'PROD-123', null);
 */
export async function purge(ctx, sku, urlKey) {
  const { log } = ctx;

  const {
    org, site, storeCode, storeViewCode,
  } = ctx.config;

  const helixConfig = await fetchHelixConfig(ctx, org, site);
  const cdnConfig = helixConfig?.cdn?.prod;

  if (!cdnConfig) {
    log.warn('No production CDN configuration found, skipping purge');
    return;
  }

  const keys = [];
  if (sku) {
    keys.push(await computeProductSkuKey(org, site, storeCode, storeViewCode, sku));
  }
  if (urlKey) {
    keys.push(await computeProductUrlKeyKey(org, site, storeCode, storeViewCode, urlKey));
  }

  if (helixConfig?.content?.contentBusId) {
    const path = resolveProductPath(helixConfig.public, {
      sku, urlKey, storeCode, storeViewCode,
    });
    if (path) {
      keys.push(await computeAuthoredContentKey(helixConfig.content.contentBusId, path));
    }
  }

  if (!keys.length) {
    log.warn('No keys to purge, skipping purge');
    return;
  }

  await purgeProductionCDN(ctx, cdnConfig, { keys });
}
