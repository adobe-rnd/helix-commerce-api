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
 * @param {Partial<Context>} [overrides = {}]
 * @param {{
 *  path?: string;
 *  configMap?: Record<string, Config>;
 *  baseUrl?: string;
 * }} opts
 * @returns {Context}
 */
export const DEFAULT_CONTEXT = (
  overrides = {},
  {
    path = '',
    configMap = {},
    baseUrl = 'https://www.example.com/org/site/content',
  } = {},
) => ({
  url: new URL(`${baseUrl}${path}`),
  log: console,
  ...overrides,
  attributes: {
    ...(overrides.attributes ?? {}),
  },
  env: {
    CONFIGS: {
      // @ts-ignore
      get: async (id) => configMap[id],
    },
    ...(overrides.env ?? {}),
  },
  info: {
    method: 'GET',
    headers: {},
    ...(overrides.info ?? {}),
  },
});

/**
 * @param {string} path
 * @param {Record<string, Config>} configMap
 * @param {string} baseUrl
 * @returns {Context}
 */
export const TEST_CONTEXT = (path, configMap, baseUrl) => DEFAULT_CONTEXT(
  {},
  { path, configMap, baseUrl },
);
