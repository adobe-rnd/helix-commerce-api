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

import { errorWithResponse, ffetch } from './http.js';

/**
 * Replaces placeholders in a pattern string with provided values.
 *
 * @param {string} patternPath - A string containing placeholders in the form `{{placeholder}}`.
 * @param {Record<string, string>} values - Key-value map of placeholder replacements.
 * @returns {string|null} The resolved string or `null` if any placeholder is missing a value.
 */
function interpolatePattern(patternPath, values) {
  const placeholderRegex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let missingValue = false;

  const resolved = patternPath.replace(placeholderRegex, (_match, key) => {
    const replacementValue = values[key];
    if (!replacementValue) {
      missingValue = true;
      return '';
    }
    return replacementValue;
  });

  return missingValue ? null : resolved;
}

/**
 * Resolves a product URL path based on `public.patterns` definitions.
 *
 * - Uses `storeCode` and `storeViewCode` from `base` if not provided.
 * - Replaces placeholders like `{{urlKey}}`, `{{sku}}`, `{{storeCode}}`, and `{{storeViewCode}}`.
 * - Only returns paths where `pageType` is `"product"`.
 *
 * @param {object} publicConfig - The configuration object containing `patterns`.
 * @param {object} params - Parameters used to resolve the pattern.
 * @param {string} [params.urlKey] - Product URL key (optional if pattern uses SKU).
 * @param {string} [params.sku] - Product SKU (optional if pattern uses URL key).
 * @param {string} [params.storeCode] - Store code; defaults to `base.storeCode`.
 * @param {string} [params.storeViewCode] - Store view code; defaults to `base.storeViewCode`.
 * @returns {string|null} The resolved product path or `null` if no match could be resolved.
 */
export function resolveProductPath(publicConfig, params) {
  const { patterns } = publicConfig;
  const { base } = patterns;

  const effectiveStoreCode = params.storeCode || base.storeCode;
  const effectiveStoreViewCode = params.storeViewCode || base.storeViewCode;

  const templateValues = {
    storeCode: effectiveStoreCode,
    storeViewCode: effectiveStoreViewCode,
    urlKey: params.urlKey,
    sku: params.sku,
  };

  const productEntries = Object.entries(patterns).filter(
    ([key, cfg]) => key !== 'base' && cfg?.pageType === 'product',
  );

  for (const [patternPath] of productEntries) {
    const candidatePath = interpolatePattern(patternPath, templateValues);
    if (candidatePath) return candidatePath;
  }

  return null;
}

/**
 * This function resolves the configuration for a given context.
 * @param {Context} ctx - The context object.
 * @returns {Promise<Config|null>} - A promise that resolves to the configuration.
 */
export async function resolveConfig(ctx) {
  const [_, org, site, route] = ctx.url.pathname.split('/');
  if (!org) {
    throw errorWithResponse(404, 'missing org');
  }
  if (!site) {
    throw errorWithResponse(404, 'missing site');
  }
  if (!route) {
    throw errorWithResponse(404, 'missing route');
  }

  const siteKey = `${org}--${site}`;

  return {
    org,
    site,
    route,
    siteKey,
  };
}

/**
 * Fetch config from the config service.
 */
export async function fetchHelixConfig(ctx, org, site /* we ignore ref for now , ref */) {
  const { log } = ctx;

  const fopts = {
    headers: {
      'cache-control': 'no-cache', // respected by runtime
      'x-access-token': ctx.env.HLX_CONFIG_SERVICE_TOKEN,
      'x-backend-type': 'aws',
    },
  };

  const url = `https://config.aem.page/main--${site}--${org}/config.json?scope=raw`;

  try {
    const response = await ffetch(url, fopts);
    const { ok, status } = response;
    if (ok) {
      log.info(`loaded config from ${url}`);
      const config = await response.json();
      return config.legacy ? null : config;
    }
    if (status !== 404) {
      log.warn(`error loading config from ${url}: ${response.status}`);
    }
    return null;
  } catch (e) {
    const msg = `Fetching config from ${url} failed: ${e.message}`;
    throw errorWithResponse(502, msg);
    /* c8 ignore next 5 */
  } finally {
    if (fopts.signal) {
      fopts.signal.clear();
    }
  }
}
