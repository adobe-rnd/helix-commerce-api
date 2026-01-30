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
 * Get admin metadata for a specific email
 * @type {RouteHandler}
 */
export default async function retrieve(ctx) {
  const {
    env,
    requestInfo: { org, site },
  } = ctx;

  ctx.authInfo.assertPermissions('admins:read');
  ctx.authInfo.assertOrgSite(org, site);

  const email = ctx.requestInfo.getVariable('email');
  if (!email) {
    return errorResponse(400, 'missing email');
  }

  const key = `${org}/${site}/admins/${email}`;
  const obj = await env.AUTH_BUCKET.head(key);

  if (!obj) {
    return errorResponse(404, 'admin not found');
  }

  return new Response(JSON.stringify({
    email,
    dateAdded: obj.customMetadata?.dateAdded,
    addedBy: obj.customMetadata?.addedBy,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
