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

/* eslint-disable no-await-in-loop */

import { getPreviewPublishPaths } from './product.js';

/**
 * @typedef {Object} AdminUrlConfig
 * @property {string} [org] The owner of the repository.
 * @property {string} [site] The name of the repository.
 * @property {string} [ref='main'] The reference branch, defaults to 'main'.
 * @property {string} [adminVersion] - The version of the admin to use
 */

/**
 * The origin of the Admin API.
 * @type {string}
 */
export const ADMIN_ORIGIN = 'https://admin.hlx.page';

/**
 * Creates an Admin API URL for an API and path.
 * @param {AdminUrlConfig} config The config object
 * @param {string} api The API endpoint to call
 * @param {string} [path] The resource path
 * @param {URLSearchParams} [searchParams] The search parameters
 * @returns {URL} The admin URL
 */
export function createAdminUrl(
  {
    org, site, ref = 'main', adminVersion,
  },
  api,
  path = '',
  searchParams = new URLSearchParams(),
) {
  const adminUrl = new URL(`${ADMIN_ORIGIN}/${api}`);
  if (org && site && ref) {
    adminUrl.pathname += `/${org}/${site}/${ref}`;
  }
  adminUrl.pathname += path;
  if (adminVersion) {
    searchParams.append('hlx-admin-version', adminVersion);
  }
  searchParams.forEach((value, key) => {
    adminUrl.searchParams.append(key, value);
  });
  return adminUrl;
}

/**
 * Makes a call to the [AEM Admin API]{@link https://www.aem.live/docs/admin.html}
 * and returns the response.
 * @param {AdminUrlConfig} config The config object
 * @param {string} api The API endpoint to call
 * @param {string} [path] The resource path
 * @param {Object} [opts] The request options
 * @param {string} [opts.method] The method to use
 * @param {Object} [opts.body] The body to send
 * @param {Object} [opts.headers] The headers to send
 * @param {URLSearchParams} [opts.searchParams] The search parameters
 * @returns {Promise<Response>} The admin response
 */
export async function callAdmin(
  config,
  api,
  path = '',
  {
    method = 'get',
    body = undefined,
    headers = {},
    searchParams = new URLSearchParams(),
  } = {},
) {
  const url = createAdminUrl(config, api, path, searchParams);
  const requestHeaders = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  };
  return fetch(url, {
    method,
    headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Calls the Admin API to publish a product to the preview and live environments.
 * @param {Config} config The config object
 * @param {string} method The method to use (e.g., POST or DELETE)
 * @param {string} sku The SKU of the product
 * @param {string} urlKey The URL key of the product
 */
export async function callPreviewPublish(config, method, sku, urlKey) {
  const purgePaths = getPreviewPublishPaths(config, sku, urlKey);
  const result = { paths: {} };

  for (const path of purgePaths) {
    result.paths[path] = {};

    const requestOptions = {
      method,
      headers: config.helixApiKey ? { authorization: `token ${config.helixApiKey}` } : {},
    };

    const callAdminWithOp = async (op) => {
      const response = await callAdmin(config, op, path, requestOptions);
      const error = response.headers.get('x-error');
      return {
        op,
        status: response.status,
        message: error || null,
      };
    };

    // Conditional sequencing or parallel execution based on the method
    const operations = method === 'POST'
      ? [await callAdminWithOp('preview'), await callAdminWithOp('live')]
      : await Promise.all(['preview', 'live'].map(callAdminWithOp));

    operations.forEach(({ op, status, message }) => {
      result.paths[path][op] = { status, ...(message && { message }) };
    });
  }

  return result;
}
