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

import { extractToken, verifyToken } from '../../utils/jwt.js';

/**
 * Handle logout request
 *
 * @type {RouteHandler}
 */
export default async function logout(ctx, req) {
  const { requestInfo, env } = ctx;
  const { org, site } = requestInfo;

  // 1. check if auth_token cookie or bearer token exists
  // @ts-ignore
  const token = extractToken(req);

  // 2. if it doesn't, still respond 201 and remove cookie
  if (!token) {
    return new Response(null, {
      status: 201,
      headers: {
        'Set-Cookie': 'auth_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
      },
    });
  }

  // 3. check if the token is valid and not expired
  let isValid = false;
  try {
    await verifyToken(ctx, token);
    isValid = true;
  } catch (error) {
    // token is invalid or expired, continue to remove cookie
    ctx.log.debug('Token verification failed during logout', { error: error.message });
  }

  // 4. if it's valid, revoke the token
  if (isValid) {
    const key = `${org}/${site}/revoked-tokens/${token}`;
    try {
      await env.AUTH_BUCKET.put(key, '', {
        customMetadata: {
          revokedAt: new Date().toISOString(),
        },
      });
      ctx.log.debug('Token revoked', { token: token.substring(0, 20) });
    } catch (error) {
      ctx.log.error('Failed to revoke token', { error: error.message });
      // continue to remove cookie even if revocation fails
    }
  }

  return new Response(null, {
    status: 201,
    headers: {
      'Set-Cookie': 'auth_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
    },
  });
}
