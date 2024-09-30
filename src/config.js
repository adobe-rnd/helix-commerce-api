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

/**
 * @param {string[]} patterns
 * @param {string} path
 */
function findOrderedMatches(patterns, path) {
  return patterns
    .map((pattern) => {
      const re = new RegExp(pattern.replace(/\{\{([^}]+)\}\}/g, '([^/]+)').replace(/\*/g, '([^/]+)'));
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
export async function resolveConfig(ctx, tenant, overrides = {}) {
  const confMap = await ctx.env.CONFIGS.get(tenant, 'json');
  if (!confMap) {
    return null;
  }
  if (typeof confMap !== 'object') {
    ctx.log.warn('invalid config for tenant', tenant);
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
    }),
    ...overrides,
  };

  // ensure validity
  // TODO: make this more robust
  if (!resolved.pageType) {
    ctx.log.warn('invalid config for tenant (missing pageType)', tenant);
    return null;
  }

  return resolved;
}
