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

import { errorWithResponse } from './util.js';

/**
 * @param {string[]} patterns
 * @param {string} path
 */
function findOrderedMatches(patterns, path) {
  return patterns
    .map((pattern) => {
      const re = new RegExp(pattern.replace(/\{\{([^}]+)\}\}/g, '([^{]+)').replace(/\*/g, '([^/]+)'));
      const match = path.match(re);
      return match ? pattern : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);
}

/**
 * @param {string} pattern
 * @param {string} path
 * @returns {Record<string, string>}
 */
function extractPathParams(pattern, path) {
  // create a RegExp with named groups from the string contained in '{{}}'
  const re = new RegExp(pattern.replace(/\{\{([^}]+)\}\}/g, '(?<$1>[^{]+)').replace(/\*/g, '([^/]+)'));
  const match = path.match(re);
  return match ? match.groups : {};
}

/**
 * @param {Context} ctx
 * @param {string} tenant
 * @param {Partial<Config>} [overrides={}]
 * @returns {Promise<Config|null>}
 */
export async function resolveConfig(ctx, overrides = {}) {
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
  const confMap = await ctx.env.CONFIGS.get(siteKey, 'json');
  if (!confMap) {
    return null;
  }
  if (typeof confMap !== 'object') {
    ctx.log.warn('invalid config for', siteKey);
    return null;
  }

  // order paths by preference
  const suffix = `/${ctx.url.pathname.split('/').slice(3).join('/')}`;
  const paths = findOrderedMatches(
    Object.keys(confMap).filter((p) => p !== 'base'),
    suffix,
  );

  // merge configs
  /** @type {Config} */
  const resolved = {
    ...paths.reduce((conf, key) => ({
      ...conf,
      ...confMap[key],
      headers: {
        ...conf.headers,
        ...(confMap[key]?.headers ?? {}),
      },
      params: {
        ...conf.params,
        ...extractPathParams(key, suffix),
      },
    }), {
      ...(confMap.base ?? {}),
      headers: confMap.base?.headers ?? {},
      params: {},
      confMap,
    }),
    org,
    site,
    route,
    ...overrides,
  };

  // If the route is catalog, get the environment from the path segment
  if (route === 'catalog') {
    const pathSegments = ctx.url.pathname.split('/');
    const catalogIndex = pathSegments.indexOf('catalog');

    // Ensure that there are exactly 4 segments after 'catalog' (env, store, storeView, product)
    if (catalogIndex !== -1 && pathSegments.length >= catalogIndex + 4) {
      resolved.env = pathSegments[catalogIndex + 1];
      resolved.storeCode = pathSegments[catalogIndex + 2];
      resolved.storeViewCode = pathSegments[catalogIndex + 3];
      resolved.subRoute = pathSegments[catalogIndex + 4];
      resolved.sku = pathSegments[catalogIndex + 5];
    } else {
      throw new Error('Invalid URL structure: Missing required segments after "catalog". Expected format: /catalog/{env}/{store}/{storeView}/{product}[/{sku}]');
    }
  }

  // ensure validity
  // TODO: make this more robust
  if (!resolved.pageType && route !== 'catalog') {
    ctx.log.warn('invalid config for tenant site (missing pageType)', siteKey);
    return null;
  }

  return resolved;
}
