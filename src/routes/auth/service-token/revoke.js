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

import { errorResponse } from '../../../utils/http.js';
import { verifyToken } from '../../../utils/jwt.js';
import { revokeServiceToken } from '../../../utils/auth.js';

/**
 * Revoke a JWT-based service token
 *
 * @type {RouteHandler}
 */
export default async function revoke(ctx) {
  const { data, requestInfo, authInfo } = ctx;
  const { org, site } = requestInfo;

  authInfo.assertPermissions('service_token:write');
  authInfo.assertOrgSite(org, site);

  if (authInfo.isServiceToken) {
    return errorResponse(403, 'service tokens cannot revoke service tokens');
  }

  const { token } = data;

  if (!token || typeof token !== 'string') {
    return errorResponse(400, 'token is required');
  }

  // verify the token is a valid service token before revoking
  let decoded;
  try {
    decoded = await verifyToken(ctx, token);
  } catch (error) {
    return errorResponse(400, 'invalid or expired token');
  }

  if (decoded.type !== 'service_token') {
    return errorResponse(400, 'token is not a service token');
  }

  if (decoded.org !== org || decoded.site !== site) {
    return errorResponse(403, 'token does not belong to this org/site');
  }

  await revokeServiceToken(ctx, token, decoded.exp);

  return new Response(null, { status: 204 });
}
