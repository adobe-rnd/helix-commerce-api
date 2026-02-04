/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { errorResponse } from '@dylandepass/helix-product-shared';
import { assertValidConfig } from '../../utils/config.js';

/**
 * Update the config for an org/site
 *
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
async function update(ctx) {
  const {
    requestInfo: { org, site },
    env: {
      CONFIGS_BUCKET: configsBucket,
    },
    data,
  } = ctx;

  assertValidConfig(ctx, data);

  const config = JSON.stringify(data);
  try {
    await configsBucket.put(`${org}/${site}/config.json`, config);
  } catch (e) {
    ctx.log.error('Error updating config', { error: e });
    return errorResponse(500, 'Error updating config');
  }

  return new Response(config, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Remove the config for an org/site
 *
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
async function remove(ctx) {
  const {
    requestInfo: { org, site },
    env: {
      CONFIGS_BUCKET: configsBucket,
    },
  } = ctx;

  try {
    await configsBucket.delete(`${org}/${site}/config.json`);
  } catch (e) {
    ctx.log.error('Error removing config', { error: e });
    return errorResponse(500, 'Error removing config');
  }

  return new Response(null, {
    status: 204,
  });
}

/**
 * Retrieve the config for an org/site
 *
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
async function retrieve(ctx) {
  const {
    requestInfo: { org, site },
    env: {
      CONFIGS_BUCKET: configsBucket,
    },
  } = ctx;

  const config = await configsBucket.get(`${org}/${site}/config.json`);
  if (!config) {
    return errorResponse(404, 'Config not found');
  }

  return new Response(JSON.stringify(await config.json()), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx) {
  const { requestInfo } = ctx;
  const {
    method, org, site,
  } = requestInfo;

  switch (method) {
    case 'GET':
      ctx.authInfo.assertPermissions('config:read');
      ctx.authInfo.assertOrgSite(org, site);
      return retrieve(ctx);
    case 'POST':
      ctx.authInfo.assertPermissions('config:write');
      ctx.authInfo.assertOrgSite(org, site);
      return update(ctx);
    case 'DELETE':
      ctx.authInfo.assertPermissions('config:write');
      ctx.authInfo.assertOrgSite(org, site);
      return remove(ctx);
    default:
      return errorResponse(405, 'method not allowed');
  }
}
