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
 *  baseUrl?: string;
 * }} opts
 * @returns {Context}
 */
export const DEFAULT_CONTEXT = (
  overrides = {},
  {
    path = '',
    baseUrl = 'https://www.example.com/org/site/content',
  } = {},
) => {
  const defaultRequestInfo = {
    org: 'org',
    site: 'site',
    path,
    method: 'GET',
    headers: {},
    variables: {},
    route: undefined,
    get siteKey() {
      return `${this.org}--${this.site}`;
    },
    getHeader: (name) => ({}[name.toLowerCase()]),
    getVariable(name) {
      return this.variables?.[name];
    },
  };

  const requestInfo = {
    ...defaultRequestInfo,
    ...(overrides.requestInfo ?? {}),
    // Ensure methods and getters are preserved
    getHeader: overrides.requestInfo?.getHeader || defaultRequestInfo.getHeader,
    getVariable: overrides.requestInfo?.getVariable || defaultRequestInfo.getVariable,
    get siteKey() {
      return `${this.org}--${this.site}`;
    },
  };

  // Filter out requestInfo from overrides to avoid replacement
  const { requestInfo: _, ...otherOverrides } = overrides;

  return {
    url: new URL(`${baseUrl}${path}`),
    log: console,
    requestInfo,
    ...otherOverrides,
    attributes: {
      key: 'test-key',
      ...(overrides.attributes ?? {}),
    },
    env: {
      SUPERUSER_KEY: 'su-test-key',
      KEYS: {
      // @ts-ignore
        get: async () => 'test-key',
      },
      INDEXER_QUEUE: {
        send: () => Promise.resolve(),
        sendBatch: () => Promise.resolve(),
      },
      ...(overrides.env ?? {}),
    },
    data: typeof overrides.data === 'string' ? overrides.data : {
      ...(overrides.data ?? {}),
    },
  };
};

export const SUPERUSER_CONTEXT = (overrides = {}) => DEFAULT_CONTEXT({
  ...overrides,
  attributes: {
    key: 'su-test-key',
    ...(overrides.attributes ?? {}),
  },
});

/**
 * @param {string} path
 * @param {string} baseUrl
 * @returns {Context}
 */
export const TEST_CONTEXT = (path, baseUrl) => DEFAULT_CONTEXT(
  {},
  { path, baseUrl },
);
