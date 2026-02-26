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
import { createServiceToken } from '../../../utils/jwt.js';
import { isValidEmail } from '../../../utils/email.js';
import {
  SERVICE_TOKEN_ALLOWED_PERMISSIONS,
  MAX_SERVICE_TOKEN_TTL_SECONDS,
} from '../../../utils/AuthInfo.js';

/**
 * Validate email scope patterns in permissions.
 * Returns an error string if invalid, null if valid.
 *
 * @param {string[]} permissions
 * @returns {string|null}
 */
function validateEmailScopes(permissions) {
  for (const perm of permissions) {
    if (perm.startsWith('emails:send:')) {
      const pattern = perm.slice('emails:send:'.length);
      if (pattern.startsWith('*@')) {
        const domain = pattern.slice(2);
        if (!domain || domain.includes('@') || domain.includes('*')) {
          return `invalid email scope pattern: ${perm}`;
        }
      } else if (!isValidEmail(pattern)) {
        return `invalid email scope pattern: ${perm}`;
      }
    }
  }
  return null;
}

/**
 * Create a new JWT-based service token
 *
 * @type {RouteHandler}
 */
export default async function create(ctx) {
  const { data, requestInfo, authInfo } = ctx;
  const { org, site } = requestInfo;

  authInfo.assertPermissions('service_token:create');
  authInfo.assertOrgSite(org, site);

  if (authInfo.isServiceToken) {
    return errorResponse(403, 'service tokens cannot create service tokens');
  }

  const { permissions, ttl } = data;

  if (!Array.isArray(permissions) || permissions.length === 0) {
    return errorResponse(400, 'permissions must be a non-empty array');
  }

  if (typeof ttl !== 'number' || ttl <= 0 || !Number.isInteger(ttl)) {
    return errorResponse(400, 'ttl must be a positive integer (seconds)');
  }

  if (ttl > MAX_SERVICE_TOKEN_TTL_SECONDS) {
    return errorResponse(400, `ttl exceeds maximum of ${MAX_SERVICE_TOKEN_TTL_SECONDS} seconds`);
  }

  // validate each permission against the allowlist
  for (const perm of permissions) {
    const basePerm = perm.startsWith('emails:send:') ? 'emails:send' : perm;
    if (!SERVICE_TOKEN_ALLOWED_PERMISSIONS.has(basePerm)) {
      return errorResponse(400, `permission not allowed for service tokens: ${perm}`);
    }
  }

  // if emails:send scopes are present, ensure emails:send base permission is also present
  const hasEmailScopes = permissions.some((p) => p.startsWith('emails:send:'));
  const hasEmailBase = permissions.includes('emails:send');
  if (hasEmailScopes && !hasEmailBase) {
    return errorResponse(400, 'emails:send permission required when email scopes are defined');
  }

  // validate email scope patterns
  const scopeError = validateEmailScopes(permissions);
  if (scopeError) {
    return errorResponse(400, scopeError);
  }

  const token = await createServiceToken(ctx, permissions, ttl);

  return new Response(JSON.stringify({ token, ttl }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
