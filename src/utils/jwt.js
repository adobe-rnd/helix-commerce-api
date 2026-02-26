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

import { SignJWT, jwtVerify } from 'jose';

/**
 * Get or create a secret key for JWT signing
 * @param {Context} ctx
 * @returns {Promise<CryptoKey>}
 */
async function getSecretKey(ctx) {
  const secret = ctx.env.JWT_SECRET;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Create a JWT token for an authenticated user
 *
 * @param {Context} ctx
 * @param {string} email
 * @param {string[]} [roles=['user']]
 * @param {string} [expiresIn='24h']
 * @returns {Promise<string>} JWT
 */
export async function createToken(ctx, email, roles = ['user'], expiresIn = '24h') {
  const { requestInfo } = ctx;
  const { org, site } = requestInfo;

  const key = await getSecretKey(ctx);

  const token = await new SignJWT({
    email,
    roles,
    org,
    site,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setSubject(email)
    .sign(key);

  return token;
}

/**
 * Create a JWT-based service token with explicit permissions
 *
 * @param {Context} ctx
 * @param {string[]} permissions
 * @param {number} ttlSeconds
 * @returns {Promise<string>} JWT
 */
export async function createServiceToken(ctx, permissions, ttlSeconds) {
  const { requestInfo } = ctx;
  const { org, site } = requestInfo;

  const key = await getSecretKey(ctx);

  const expiresIn = `${ttlSeconds}s`;
  const token = await new SignJWT({
    type: 'service_token',
    permissions,
    org,
    site,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setSubject('service_token')
    .sign(key);

  return token;
}

/**
 * Verify and decode a JWT token
 * Rejects if token is invalid or expired
 *
 * @param {Context} ctx
 * @param {string} token
 * @returns {Promise<DecodedJWT>} decoded payload
 */
export async function verifyToken(ctx, token) {
  const key = await getSecretKey(ctx);

  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
  });

  /** @type {DecodedJWT} */
  return {
    // @ts-ignore
    email: payload.email,
    // @ts-ignore
    roles: payload.roles,
    // @ts-ignore
    org: payload.org,
    // @ts-ignore
    site: payload.site,
    iat: payload.iat,
    exp: payload.exp,
    // @ts-ignore - service token fields
    type: payload.type,
    // @ts-ignore
    permissions: payload.permissions,
  };
}

/**
 * Extract JWT from request cookies or Authorization header
 *
 * @param {Request} req
 * @returns {string|null} JWT token or null if not found
 */
export function extractToken(req) {
  // try cookie first
  const cookies = req.headers.get('cookie');
  if (cookies) {
    const match = cookies.match(/auth_token=([^;]+)/);
    if (match) {
      return match[1];
    }
  }

  // fallback to Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length);
  }

  return null;
}
