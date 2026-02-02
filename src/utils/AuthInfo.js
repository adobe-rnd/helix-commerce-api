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

import { errorWithResponse } from './http.js';
import { extractToken, verifyToken } from './jwt.js';
import { isTokenRevoked, timingSafeEqual } from './auth.js';

/**
 * @type {Record<string, string[]>}
 */
const PERMISSIONS = {
  // all site-scoped permissions
  admin: [
    'catalog:read',
    'catalog:write',
    'orders:read',
    'orders:write',
    'index:read',
    'index:write',
    'customers:read',
    'customers:write',
    'service_token:read',
    'service_token:write',
  ],
  // service (ie. ETL) permissions
  service: [
    'catalog:read',
    'catalog:write',
    'orders:read',
    'orders:write',
    'service_token:read',
  ],
  user: [
    'orders:read',
    'orders:write',
  ],
};

// all site-scoped permissions + superuser-only permissions
PERMISSIONS.superuser = [
  ...PERMISSIONS.admin,
  'admins:read',
  'admins:write',
];

export default class AuthInfo {
  /**
   * @type {Set<string>}
   */
  #roles = new Set();

  /**
   * @type {Set<string>}
   */
  #permissions = new Set();

  /**
   * @type {string}
   */
  #email;

  /**
   * JWT issued-at timestamp in seconds since epoch (not milliseconds)
   * @type {number}
   */
  #iat;

  /**
   * JWT expiration timestamp in seconds since epoch (not milliseconds)
   * @type {number}
   */
  #exp;

  /**
   * @type {string}
   */
  #org;

  /**
   * @type {string}
   */
  #site;

  /**
   * @param {Context} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * @returns {string|undefined}
   */
  get email() {
    return this.#email;
  }

  /**
   * Create a new Authorization instance from a request
   *
   * @param {Context} ctx
   * @param {Request} req
   * @returns {Promise<AuthInfo>}
   */
  static async create(ctx, req) {
    // parse roles from JWT
    const token = extractToken(req);
    if (!token) {
      // no token, continue with unauthenticated flow
      return new AuthInfo(ctx);
    }

    try {
      const {
        email,
        roles,
        org,
        site,
        iat,
        exp,
      } = await verifyToken(ctx, token);
      // check if token is revoked
      const revoked = await isTokenRevoked(ctx, token);
      if (revoked) {
        throw errorWithResponse(401, 'token revoked');
      }
      const auth = new AuthInfo(ctx);
      auth.#email = email;
      auth.#roles = new Set(roles);
      auth.#iat = iat;
      auth.#exp = exp;
      auth.#org = org;
      auth.#site = site;
      if (email) {
        auth.#roles.add('user');
      }
      auth.#applyPermissions(...auth.#roles);
      return auth;
    } catch (error) {
      // ignore token, continue with unauthenticated flow
      ctx.log.debug('invalid token', { error: error.message });
      const auth = new AuthInfo(ctx);

      // fallback to service token, check if superuser or org-site scoped
      // TODO: remove this
      if (ctx.env.SUPERUSER_KEY && timingSafeEqual(token, ctx.env.SUPERUSER_KEY)) {
        auth.#roles.add('superuser');
      }

      // if the token looks like a caps uuid, assume it's a service token
      // check if it's the matching org-site scoped token
      if (ctx.requestInfo?.siteKey && token.match(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i)) {
        const expected = await ctx.env.KEYS.get(ctx.requestInfo.siteKey);
        if (expected && timingSafeEqual(token, expected)) {
          auth.#roles.add('service');
          auth.#email = 'service';
          auth.#org = ctx.requestInfo.org;
          auth.#site = ctx.requestInfo.site;
          auth.#applyPermissions('service');
        }
      }

      // apply permissions for superuser if added
      if (auth.#roles.has('superuser')) {
        auth.#applyPermissions('superuser');
      }

      return auth;
    }
  }

  /**
   * @param {string[]} roles
   */
  #applyPermissions(...roles) {
    for (const role of roles) {
      for (const permission of PERMISSIONS[role] ?? []) {
        this.#permissions.add(permission);
      }
    }
  }

  isSuperuser() {
    return this.#roles.has('superuser');
  }

  isAdmin() {
    return this.#roles.has('admin') || this.isSuperuser();
  }

  /**
   * Get the token issued-at timestamp
   * @returns {number|undefined} Timestamp in seconds since epoch (not milliseconds)
   */
  issuedAt() {
    return this.#iat;
  }

  /**
   * Get the token expiration timestamp
   * @returns {number|undefined} Timestamp in seconds since epoch (not milliseconds)
   */
  expiresAt() {
    return this.#exp;
  }

  /**
   * Check if the token is expired
   * @returns {boolean} True if token is expired, false otherwise or if no token
   */
  isExpired() {
    return !!(this.#exp && this.#exp < (Date.now() / 1000));
  }

  /**
   * Assert that the user's profile is scoped to the given org and site
   * @param {string} org
   * @param {string} site
   */
  assertOrgSite(org, site) {
    if (this.isSuperuser()) {
      return;
    }
    if (this.#org !== org || this.#site !== site) {
      throw errorWithResponse(403, 'access denied');
    }
  }

  /**
   * Assert that the user has the given role
   *
   * @param {string} role
   * @throws {ResponseError} if the user does not have the given role
   */
  assertRole(role) {
    if (!this.#roles.has(role)) {
      throw errorWithResponse(403, 'access denied');
    }
  }

  /**
   * Assert that the user has the given permissions
   *
   * @param {string[]} permissions
   * @throws {ResponseError} if the user does not have the given permissions
   */
  assertPermissions(...permissions) {
    for (const permission of permissions) {
      if (!this.#permissions.has(permission)) {
        throw errorWithResponse(403, `access denied, lacking ${permission}`);
      }
    }
  }

  /**
   * Assert that the user is authenticated
   *
   * @throws {ResponseError} if the user is not authenticated
   */
  assertAuthenticated() {
    if (!this.#email) {
      throw errorWithResponse(401, 'unauthorized');
    }
  }

  /**
   * Assert the user has the given email (unless admin)
   *
   * @param {string} email
   * @param {boolean} [allowAdmin=true]
   */
  assertEmail(email, allowAdmin = true) {
    if (allowAdmin && this.isAdmin()) {
      return;
    }
    if (this.#email !== email) {
      throw errorWithResponse(403, 'access denied');
    }
  }
}
