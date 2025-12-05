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

import { computeAuthoredContentKey /* computeProductPathKey */ } from '@dylandepass/helix-product-shared';
import { FastlyPurgeClient } from './clients/fastly.js';
import { CloudflarePurgeClient } from './clients/cloudflare.js';
import { ManagedPurgeClient } from './clients/managed.js';
import { AkamaiPurgeClient } from './clients/akamai.js';

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
 * Purges cached product data from the production CDN by path.
 *
 * This function computes surrogate keys for the given product path and
 * optionally includes the authored content key if a contentBusId is configured.
 * It then triggers a purge of all matching cache entries across the configured
 * CDN provider. This is typically called after product updates to ensure cache
 * freshness.
 *
 * The function gracefully handles missing configurations by logging warnings and
 * skipping the purge operation.
 *
 * @param {Context} ctx - The request context with logging, config, and env
 * @param {string} path - Product path to purge (without .json extension)
 * @returns {Promise<void>}
 *
 * @example
 * // Purge by path
 * await purge(ctx, '/us/en/products/awesome-product');
 */
export async function purge(ctx, path) {
  const { log } = ctx;

  // const { org, site } = ctx.config;

  const helixConfig = ctx.attributes.helixConfigCache;
  const cdnConfig = helixConfig?.cdn?.prod;

  if (!cdnConfig) {
    log.warn('No production CDN configuration found, skipping purge');
    return;
  }

  const keys = [];
  if (path) {
    // keys.push(await computeProductPathKey(org, site, path));
  }

  if (helixConfig?.content?.contentBusId) {
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

/**
 * Purges cached product data for multiple products in a single batched operation.
 *
 * This function computes all surrogate keys for all products upfront, then makes
 * a single call to the CDN (or minimal batched calls based on CDN limits). This is
 * significantly more efficient than calling purge() once per product, as it avoids
 * N separate CDN API requests.
 *
 * Each product entry should contain:
 * - path: Product path (without .json extension)
 *
 * The function automatically deduplicates cache keys and handles missing configurations
 * gracefully by logging warnings.
 *
 * @param {Context} ctx - The request context with logging and config
 * @param {Object} config - The site configuration (org, site)
 * @param {string} config.org - Organization identifier
 * @param {string} config.site - Site identifier
 * @param {Array<{path: string}>} products
 *   Array of product objects to purge. Each product must have a path.
 * @returns {Promise<void>}
 *
 * @example
 * await purgeBatch(ctx, { org: 'myorg', site: 'mysite' }, [
 *   { path: '/us/en/products/blender-pro-500' },
 *   { path: '/us/en/products/mixer-deluxe' }
 * ]);
 */
export async function purgeBatch(ctx, config, products) {
  const { log } = ctx;
  // const { org, site } = config;

  const helixConfig = ctx.attributes.helixConfigCache;
  const cdnConfig = helixConfig?.cdn?.prod;

  if (!cdnConfig) {
    log.warn('No production CDN configuration found, skipping batch purge');
    return;
  }

  // Collect all cache keys from all products
  const keyPromises = [];
  for (const product of products) {
    const { path } = product;

    if (path) {
      // keyPromises.push(computeProductPathKey(org, site, path));

      if (helixConfig?.content?.contentBusId) {
        keyPromises.push(computeAuthoredContentKey(helixConfig.content.contentBusId, path));
      }
    }
  }

  // Await all key computations
  const allKeys = await Promise.all(keyPromises);

  // Deduplicate keys (use Set to remove duplicates)
  const uniqueKeys = [...new Set(allKeys)];

  if (!uniqueKeys.length) {
    log.warn('No keys to purge in batch, skipping purge');
    return;
  }

  log.info(`Purging ${uniqueKeys.length} unique cache keys for ${products.length} products`);

  // Make a single CDN call with all keys
  // The CDN clients will automatically batch internally based on their limits
  // (Fastly: 256, Cloudflare: 30, Managed: 256, Akamai: unlimited)
  await purgeProductionCDN(ctx, cdnConfig, { keys: uniqueKeys });
}
