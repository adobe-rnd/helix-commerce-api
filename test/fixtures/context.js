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

import { errorWithResponse } from '../../src/utils/http.js';

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
  // eslint-disable-next-line no-unused-vars
  const { requestInfo: _, ...otherOverrides } = overrides;

  // Create default unauthenticated authInfo stub
  const defaultAuthInfo = {
    isSuperuser: () => false,
    isAdmin: () => false,
    issuedAt: () => undefined,
    expiresAt: () => undefined,
    isExpired: () => false,
    assertRole: () => { throw errorWithResponse(403, 'access denied'); },
    assertPermissions: (...permissions) => {
      const perm = permissions[0] || 'unknown';
      throw errorWithResponse(403, `access denied, lacking ${perm}`);
    },
    assertAuthenticated: () => { throw errorWithResponse(401, 'unauthorized'); },
    assertEmail: () => { throw errorWithResponse(403, 'access denied'); },
  };

  return {
    url: new URL(`${baseUrl}${path}`),
    log: console,
    // @ts-ignore
    requestInfo,
    // @ts-ignore
    authInfo: overrides.authInfo ?? defaultAuthInfo,
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

/**
 * Create an authInfo mock with specific permissions
 *
 * @param {string[]} permissions
 * @param {string} [email] - Optional email for the authenticated user
 * @returns {object}
 */
export const createAuthInfoMock = (permissions = [], email = null) => {
  const permissionSet = new Set(permissions);
  return {
    isSuperuser: () => permissions.includes('admins:read') || permissions.includes('admins:write'),
    isAdmin: () => permissions.includes('catalog:write') && permissions.includes('orders:write'),
    issuedAt: () => Date.now() / 1000,
    expiresAt: () => (Date.now() / 1000) + 86400,
    isExpired: () => false,
    assertRole: (role) => {
      // Simple role check based on permissions
      if (role === 'admin' && !permissions.includes('catalog:write')) {
        throw errorWithResponse(403, 'access denied');
      }
      if (role === 'superuser' && !permissions.includes('admins:read')) {
        throw errorWithResponse(403, 'access denied');
      }
    },
    assertPermissions: (...perms) => {
      for (const perm of perms) {
        if (!permissionSet.has(perm)) {
          throw errorWithResponse(403, `access denied, lacking ${perm}`);
        }
      }
    },
    assertAuthenticated: () => {
      if (permissions.length === 0) {
        throw errorWithResponse(401, 'unauthorized');
      }
    },
    assertEmail: (targetEmail, allowAdmin = true) => {
      // Allow if admin
      if (allowAdmin && permissions.includes('catalog:write') && permissions.includes('orders:write')) {
        return;
      }
      // Allow if email matches
      if (email && email === targetEmail) {
        return;
      }
      throw errorWithResponse(403, 'access denied');
    },
  };
};

export const SUPERUSER_CONTEXT = (overrides = {}) => {
  const superuserPermissions = [
    'catalog:read',
    'catalog:write',
    'orders:read',
    'orders:write',
    'index:read',
    'index:write',
    'customers:read',
    'customers:write',
    'service_token:read',
    'service_token:write',
    'admins:read',
    'admins:write',
  ];

  return DEFAULT_CONTEXT({
    ...overrides,
    authInfo: overrides.authInfo ?? createAuthInfoMock(superuserPermissions),
    attributes: {
      key: 'su-test-key',
      ...(overrides.attributes ?? {}),
    },
  });
};

/**
 * @param {string} path
 * @param {string} baseUrl
 * @returns {Context}
 */
export const TEST_CONTEXT = (path, baseUrl) => DEFAULT_CONTEXT(
  {},
  { path, baseUrl },
);
