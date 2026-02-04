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

import {
  generateOTPCode,
  createOTPHash,
  sendOTPEmail,
  OTP_EXPIRATION_MS,
} from '../../utils/auth.js';
import { errorResponse } from '../../utils/http.js';
import { normalizeEmail, isValidEmail } from '../../utils/email.js';
import { getProductBusSiteConfig } from '../../utils/config.js';

/**
 * @type {RouteHandler}
 */
export default async function login(ctx) {
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

  // 0. check if auth enabled for org/site
  const config = await getProductBusSiteConfig(ctx, org, site);
  if (!config) {
    return errorResponse(409, 'auth is not enabled for this site');
  }

  // 1. validate inputs
  if (!data.email || typeof data.email !== 'string') {
    return errorResponse(400, 'missing or invalid email');
  }

  const email = normalizeEmail(data.email);
  if (!isValidEmail(email)) {
    return errorResponse(400, 'invalid email format');
  }

  // 2. generate OTP code and hash
  const code = generateOTPCode();
  const exp = Date.now() + OTP_EXPIRATION_MS;
  const secret = env.OTP_SECRET;
  const hash = await createOTPHash(email, org, site, code, exp, secret);

  // 3. send email with code
  await sendOTPEmail(ctx, email, code, config);

  // ctx.log.debug('OTP login request', {
  //   email, code, hash, exp,
  // });

  return new Response(JSON.stringify({ email, hash, exp }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
