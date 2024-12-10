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

import { errorWithResponse } from './http.js';

/**
 * This function finds ordered matches between a list of patterns and a given path.
 * @param {string[]} patterns - An array of pattern strings to match against.
 * @param {string} path - The path string to match patterns against.
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
 * This function extracts path parameters from a pattern and a path.
 * @param {string} pattern - The pattern string.
 * @param {string} path - The path string.
 * @returns {Record<string, string>} - The path parameters.
 */
function extractPathParams(pattern, path) {
  // create a RegExp with named groups from the string contained in '{{}}'
  const re = new RegExp(pattern.replace(/\{\{([^}]+)\}\}/g, '(?<$1>[^{]+)').replace(/\*/g, '([^/]+)'));
  const match = path.match(re);
  return match ? match.groups : {};
}

/**
 * This function resolves the configuration for a given context and overrides.
 * @param {Context} ctx - The context object.
 * @param {Partial<Config>} [overrides={}] - The overrides object.
 * @returns {Promise<Config|null>} - A promise that resolves to the configuration.
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

  /**
   * @type {ConfigMap}
   */
  const confMap = await ctx.env.CONFIGS.get(siteKey, 'json');
  const confMapStr = JSON.stringify(confMap);
  if (!confMap) {
    return null;
  }
  if (typeof confMap !== 'object') {
    ctx.log.warn('invalid config for ', siteKey);
    return null;
  }

  // if route is `config` don't resolve further
  if (route === 'config') {
    return {
      ...confMap.base,
      headers: confMap.base?.headers ?? {},
      params: {},
      confMap,
      confMapStr,
      org,
      site,
      route,
      siteKey,
      matchedPatterns: [],
      ...overrides,
    };
  }

  // order paths by preference
  const suffix = `/${ctx.url.pathname.split('/').slice(3).join('/')}`;
  const paths = findOrderedMatches(
    Object.keys(confMap).filter((p) => p !== 'base'),
    suffix,
  );

  // merge configs
  /** @type {Config} */
  // @ts-ignore
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
    }),
    confMap,
    confMapStr,
    org,
    site,
    route,
    siteKey,
    matchedPatterns: paths,
    ...overrides,
  };

  return resolved;
}
