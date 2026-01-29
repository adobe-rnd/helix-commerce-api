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

import { errorResponse } from '../../utils/http.js';
import { normalizeEmail, isValidEmail, sendEmail } from '../../utils/email.js';

const OTP_EXPIRATION_MIN = 5;
export const OTP_EXPIRATION_MS = OTP_EXPIRATION_MIN * 60 * 1000; // 5 minutes
export const OTP_SUBJECT = 'Your login code';

/**
 * OTP body template
 * @param {string} code
 * @returns {string}
 */
const OTP_BODY_TEMPLATE = (code) => `Your login code is: ${code}\n\nThis code will expire in ${OTP_EXPIRATION_MIN} minutes.`;

/**
 * Generate a random 6-digit OTP code, cryptographically secure
 * @returns {string}
 */
function generateOTPCode() {
  const max = 999999;
  const min = 100000;
  const range = max - min + 1; // 900000

  // Find largest multiple of range that fits in Uint32
  const limit = Math.floor(0xFFFFFFFF / range) * range;

  let value;
  do {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    // eslint-disable-next-line prefer-destructuring
    value = array[0];
  } while (value >= limit); // Reject biased values

  return String(min + (value % range));
}

/**
 * Create HMAC hash for OTP verification
 *
 * @param {string} email
 * @param {string} code
 * @param {number} exp - expiration timestamp in milliseconds
 * @param {string} secret
 * @returns {Promise<string>} hex string hash
 */
async function createOTPHash(email, code, exp, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${email}:${code}:${exp}`);
  const keyData = encoder.encode(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, data);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * @type {RouteHandler}
 */
export default async function login(ctx) {
  const { data, env } = ctx;

  // never allow to proceed with undefined secrets
  if (!env.OTP_SECRET) {
    ctx.log.error('OTP secret is not set');
    return errorResponse(500, 'internal server error');
  }
  if (!env.JWT_SECRET) {
    ctx.log.error('JWT secret is not set');
    return errorResponse(500, 'internal server error');
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
  const hash = await createOTPHash(email, code, exp, secret);

  // 3. send email with code (TODO: make the email template, send from the proper sender)
  await sendEmail(ctx, email, OTP_SUBJECT, OTP_BODY_TEMPLATE(code));

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
