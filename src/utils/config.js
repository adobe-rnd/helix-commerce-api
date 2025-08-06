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
