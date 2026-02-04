/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { errorResponse } from '../../../utils/http.js';

/**
 * Remove an admin from a site
 * @type {RouteHandler}
 */
export default async function remove(ctx) {
  const {
    env,
    requestInfo: { org, site },
  } = ctx;

  ctx.authInfo.assertPermissions('admins:write');
  ctx.authInfo.assertOrgSite(org, site);

  const email = ctx.requestInfo.getVariable('email');
  if (!email) {
    return errorResponse(400, 'missing email');
  }

  const key = `${org}/${site}/admins/${email}`;

  // reject if not exist
  const existing = await env.AUTH_BUCKET.head(key);
  if (!existing) {
    return errorResponse(404, 'admin not found');
  }

  // delete the admin file
  await env.AUTH_BUCKET.delete(key);

  return new Response(JSON.stringify({
    email,
    removed: true,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
