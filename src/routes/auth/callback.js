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

import { createOTPHash, hashEmail, timingSafeEqual } from '../../utils/auth.js';
import { normalizeEmail } from '../../utils/email.js';
import { errorResponse, errorWithResponse } from '../../utils/http.js';
import { createToken } from '../../utils/jwt.js';
import { OTP_EXPIRATION_MS } from './login.js';

const MAX_ATTEMPTS = 3;
const MAX_RETRIES = 3;
const JWT_COOKIE_MAX_AGE = 24 * 60 * 60; // 24 hours
const SUPERUSERS = {
  'c2W3+N2djuh2qGa9D3eDDYBTI+Ipc8fQDDpsJLbHAmI=': true,
  '8VpnHjBsIcPxD1boSKHYpnXEF1sPFwWE8VTRgqIHJws=': true,
  'fyLIe7Ajj+m+YJQuIoFqoTPNeJLdpL4d2qRVnKqGaps=': true,
};

/**
 * Increment attempts counter with retry logic for concurrency
 *
 * @param {Context} ctx
 * @param {string} email
 * @returns {Promise<{
 *   success: boolean,
 *   attempts: number,
 *   exceeded: boolean,
 *   earlyReject?: boolean
 * }>}
 */
async function incrementAttempts(ctx, email) {
  const {
    env,
    requestInfo: { org, site },
  } = ctx;

  const key = `${org}/${site}/attempts/${email}`;

  for (let retry = 0; retry < MAX_RETRIES; retry += 1) {
    // get current attempts count
    // eslint-disable-next-line no-await-in-loop
    const existing = await env.AUTH_BUCKET.head(key);
    const currentAttempts = existing?.customMetadata?.attempts
      ? parseInt(existing.customMetadata.attempts, 10)
      : 0;
    const etag = existing?.etag;

    // if limit is already exceeded, halt
    if (currentAttempts >= MAX_ATTEMPTS) {
      return {
        success: false,
        attempts: currentAttempts,
        exceeded: true,
        earlyReject: true,
      };
    }

    // try to increment the attempts count
    const newAttempts = currentAttempts + 1;
    try {
      const putOptions = {
        customMetadata: {
          attempts: String(newAttempts),
          lastAttempt: new Date().toISOString(),
          expiresAt: String(Date.now() + 15 * 60 * 1000), // 15 min TTL
        },
      };

      if (etag) {
        // file exists, use conditional update
        putOptions.onlyIf = { etagMatches: etag };
      } else {
        // new file, ensure we create it atomically
        putOptions.onlyIf = { etagDoesNotMatch: '*' };
      }

      // eslint-disable-next-line no-await-in-loop
      await env.AUTH_BUCKET.put(key, '', putOptions);

      // check if new count exceeds the limit
      // the count may have been incremented by another request
      if (newAttempts > MAX_ATTEMPTS) {
        return {
          success: false,
          attempts: newAttempts,
          exceeded: true,
          earlyReject: false,
        };
      }

      return { success: true, attempts: newAttempts, exceeded: false };
    } catch (error) {
      if (error.code === 'PRECONDITION_FAILED') {
        // conditional PUT failed, modified by another request
        ctx.log.debug('Conditional PUT failed, retrying', { retry, email, error: error.message });

        if (retry === MAX_RETRIES - 1) {
          // out of retries, halt
          throw new Error('Rate limit check failed due to concurrency');
        }

        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await new Promise((r) => setTimeout(r, 10 * (2 ** retry)));
      } else {
        // other error, halt
        ctx.log.error('Failed to increment attempts', { email, error: error.message, stack: error.stack });
        throw error;
      }
    }
  }

  // should never reach this
  throw new Error('Rate limit check failed');
}

/**
 * Conditional PUT to mark hash as revoked
 * If precondition fails, the hash is already revoked
 * If successful, the hash is revoked after the PUT
 *
 * Revoked hashes should expire after the OTP expiration time,
 * so they can be cleaned up asynchronously.
 *
 * @param {Context} ctx
 * @param {string} hash
 * @returns {Promise<boolean>} true if hash is already revoked, ie. should 401
 */
async function checkAndRevokeHash(ctx, hash) {
  const {
    env,
    requestInfo: { org, site },
  } = ctx;

  const key = `${org}/${site}/revoked/codes/${hash}`;
  try {
    await env.AUTH_BUCKET.put(key, '', {
      customMetadata: {
        revokedAt: new Date().toISOString(),
        expiresAt: String(Date.now() + OTP_EXPIRATION_MS + (5 * 60 * 1000)), // 5 min buffer
      },
      onlyIf: {
        etagDoesNotMatch: '*',
      },
    });
  } catch (error) {
    if (error.code === 'PRECONDITION_FAILED') {
      return true;
    }
    throw error;
  }
  return false;
}

/**
 * @type {RouteHandler}
 */
export default async function callback(ctx) {
  const { data, env, requestInfo } = ctx;
  const { org, site } = requestInfo;

  // never allow to proceed with undefined secrets
  if (!env.OTP_SECRET) {
    ctx.log.error('OTP secret is not set');
    return errorResponse(500, 'internal server error');
  }
  if (!env.JWT_SECRET) {
    ctx.log.error('JWT secret is not set');
    return errorResponse(500, 'internal server error');
  }

  if (!data.email || typeof data.email !== 'string') {
    return errorResponse(400, 'missing or invalid email');
  }
  if (!data.code || typeof data.code !== 'string') {
    return errorResponse(400, 'missing or invalid code');
  }
  if (!data.hash || typeof data.hash !== 'string') {
    return errorResponse(400, 'missing or invalid hash');
  }
  if (!data.exp || typeof data.exp !== 'number') {
    return errorResponse(400, 'missing or invalid exp');
  }

  const email = normalizeEmail(data.email);
  const { code, hash, exp } = data;

  // 1. increment attempts with rate limiting
  let attemptsResult;
  try {
    attemptsResult = await incrementAttempts(ctx, email);
  } catch (error) {
    ctx.log.error('Failed to increment attempts', { email, error: error.message });
    return errorResponse(503, 'service temporarily unavailable');
  }

  // 2. check if rate limit exceeded
  if (attemptsResult.exceeded) {
    ctx.log.warn('Rate limit exceeded', { email, attempts: attemptsResult.attempts });
    return errorResponse(401, 'invalid code');
  }

  // 3. check expiration
  if (Date.now() > exp) {
    ctx.log.debug('Code expired', { email, exp, now: Date.now() });
    return errorResponse(401, 'invalid code');
  }

  // 4. recreate hash and compare
  const secret = env.OTP_SECRET;
  let recreatedHash;
  try {
    recreatedHash = await createOTPHash(email, org, site, code, exp, secret);
  } catch (error) {
    ctx.log.error('Failed to recreate hash', { email, error: error.message });
    throw errorWithResponse(500, 'internal server error');
  }

  // 5. timing safe check if hash is valid
  if (!timingSafeEqual(hash, recreatedHash)) {
    ctx.log.debug('Hash mismatch', { email });
    return errorResponse(401, 'invalid code');
  }

  // 6. check if hash is revoked, if not, revoke it in the same operation
  const revoked = await checkAndRevokeHash(ctx, hash);
  if (revoked) {
    ctx.log.warn('Hash already used', { email, hash });
    return errorResponse(401, 'invalid code');
  }

  // 7. get roles (TODO: support other roles)
  const adminKey = `${org}/${site}/admins/${email}`;
  const isAdmin = await env.AUTH_BUCKET.head(adminKey);
  const roles = isAdmin ? ['admin'] : ['user'];

  // add superuser role if granted
  const emailHash = await hashEmail(email);
  if (SUPERUSERS[emailHash]) {
    roles.push('superuser');
  }

  ctx.log.debug('User roles determined', { email, roles });

  // 8. generate JWT
  let token;
  try {
    token = await createToken(ctx, email, roles, '24h');
  } catch (error) {
    ctx.log.error('Failed to create token', { email, error: error.message });
    throw errorWithResponse(500, 'internal server error');
  }

  // 9. delete attempts file on successful authentication
  const attemptsKey = `${org}/${site}/attempts/${email}`;
  await env.AUTH_BUCKET.delete(attemptsKey);

  // 10. respond with JWT in cookie
  const cookieOptions = [
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${JWT_COOKIE_MAX_AGE}`,
  ].join('; ');

  return new Response(JSON.stringify({
    success: true,
    email,
    roles,
    org,
    site,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `auth_token=${token}; ${cookieOptions}`,
    },
  });
}
