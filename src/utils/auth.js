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

import { sendEmail } from './email.js';
import { errorWithResponse } from './http.js';

const DEFAULT_FROM_EMAIL = 'noreply@adobecommerce.live';
const REVOKED_TOKEN_EXPIRATION_MS = 86400000; // 1 day
const OTP_EXPIRATION_MIN = 5;
export const OTP_EXPIRATION_MS = OTP_EXPIRATION_MIN * 60 * 1000; // 5 minutes
export const OTP_SUBJECT = 'Your login code';

/**
 * OTP body template
 * @param {string} code
 * @returns {string}
 */
const DEFAULT_OTP_BODY_TEMPLATE = (code) => `Your login code is: ${code}\n\nThis code will expire in ${OTP_EXPIRATION_MIN} minutes.`;

/**
 * Constant-time string comparison
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean} true if equal, false otherwise
 */
export function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();

  const aenc = encoder.encode(a);
  const benc = encoder.encode(b);

  if (aenc.byteLength !== benc.byteLength) {
    return false;
  }

  // @ts-ignore incorrect cloudflare workers types
  return crypto.subtle.timingSafeEqual(aenc, benc);
}

/**
 * Create HMAC hash for OTP verification
 *
 * @param {string} email
 * @param {string} org
 * @param {string} site
 * @param {string} code
 * @param {number} exp - expiration timestamp in milliseconds
 * @param {string} secret
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function createOTPHash(email, org, site, code, exp, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${email}:${org}:${site}:${code}:${exp}`);
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
 * Generate a random 6-digit OTP code, cryptographically secure
 * @returns {string}
 */
export function generateOTPCode() {
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
 *
 * @param {Context} ctx
 * @param {string} token
 * @returns {Promise<boolean>} true if token is revoked, false otherwise
 */
export async function isTokenRevoked(ctx, token) {
  const { env, requestInfo } = ctx;
  const { org, site } = requestInfo;
  const key = `${org}/${site}/revoked/tokens/${token}`;
  const revoked = await env.AUTH_BUCKET.head(key);
  return !!revoked;
}

/**
 *
 * @param {Context} ctx
 * @param {string} token
 */
export async function revokeToken(ctx, token) {
  const { env, requestInfo } = ctx;
  const { org, site } = requestInfo;

  const key = `${org}/${site}/revoked/tokens/${token}`;
  try {
    await env.AUTH_BUCKET.put(key, '', {
      customMetadata: {
        revokedAt: new Date().toISOString(),
        expiresAt: String(Date.now() + REVOKED_TOKEN_EXPIRATION_MS),
      },
    });
    ctx.log.debug('Token revoked', { token: token.substring(0, 20) });
  } catch (error) {
    ctx.log.error('Failed to revoke token', { error: error.message });
    throw errorWithResponse(500, 'failed to revoke token');
  }
  return true;
}

/**
 * Get SHA-256 hash of email
 * @param {string} email
 * @returns {Promise<string>} SHA-256 hash of email
 */
export async function hashEmail(email) {
  const encoder = new TextEncoder();
  const data = encoder.encode(email);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

/**
 * Send an OTP email
 * @param {Context} ctx
 * @param {string} toEmail
 * @param {string} code
 * @param {ProductBusConfig} config
 */
export async function sendOTPEmail(ctx, toEmail, code, config) {
  const { env, requestInfo, log } = ctx;
  const { org, site } = requestInfo;

  const {
    otpEmailSender,
    otpEmailBodyTemplate,
    otpEmailSubject,
    otpEmailBodyUrl,
  } = config;

  // determine sender
  let fromEmail = otpEmailSender;
  if (!fromEmail) {
    log.warn(`fromEmail is not set, using fallback for ${org}/${site}`);
    fromEmail = env.FROM_EMAIL || DEFAULT_FROM_EMAIL;
    if (!fromEmail) {
      log.error(`fromEmail and fallback not defined for ${org}/${site}`);
      throw errorWithResponse(500, 'internal server error');
    }
  }

  // determine email body
  let body;
  // try for template first
  if (otpEmailBodyUrl) {
    const templateUrl = `https://helix-to-email.adobeaem.workers.dev?url=${encodeURIComponent(otpEmailBodyUrl)}`;
    const templateResp = await fetch(templateUrl);
    if (!templateResp.ok) {
      log.error(`failed to fetch OTP email body template from ${otpEmailBodyUrl}`);
      throw errorWithResponse(404, `template fetch failed (${templateResp.status})`);
    }
    const templateText = await templateResp.text();
    body = templateText.replace(/{{code}}/g, code);
  } else if (otpEmailBodyTemplate) {
    body = otpEmailBodyTemplate.replace(/{{code}}/g, code);
  } else {
    body = DEFAULT_OTP_BODY_TEMPLATE(code);
  }

  // determine subject
  let subject = otpEmailSubject;
  if (!subject) {
    subject = OTP_SUBJECT;
  }

  await sendEmail(ctx, fromEmail, toEmail, subject, body);
}
