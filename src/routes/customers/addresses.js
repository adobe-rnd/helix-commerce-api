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

import { validate } from '../../utils/validation.js';
import StorageClient from '../../utils/StorageClient.js';
import AddressSchema from '../../schemas/Address.js';
import { errorWithResponse, errorResponse } from '../../utils/http.js';

/**
 * @param {Address} address
 * @returns {asserts address is Address}
 */
function assertValidAddress(address) {
  const errors = validate(address, AddressSchema);
  if (errors) {
    throw errorWithResponse(400, 'Invalid address', { errors });
  }
}

/**
 * Build a normalized object for hashing: strip metadata fields and
 * remove keys whose values are undefined or empty strings so that
 * value-identical addresses always produce the same hash.
 * @param {Address} address
 * @returns {Record<string, unknown>}
 */
function normalizeForHash(address) {
  return Object.fromEntries(
    Object.entries(address)
      .filter(([k, v]) => k !== 'id' && k !== 'isDefault' && v !== undefined && v !== ''),
  );
}

/**
 * @param {Address} address
 * @returns {Promise<string>}
 */
export async function getAddressId(address) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(normalizeForHash(address))));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {Context} ctx
 * @param {string} email associated customer email, may be different from the address' email
 * @param {Address} address
 * @returns {Promise<Address>}
 */
export async function createAddress(ctx, email, address) {
  const storage = StorageClient.fromContext(ctx);
  const id = await getAddressId(address);
  return storage.saveAddress(id, email, address);
}

/**
 * @param {Context} ctx
 * @param {string} email associated customer email, may be different from the address' email
 * @param {string} addressId
 * @returns {Promise<Address>}
 */
async function retrieveAddress(ctx, email, addressId) {
  const storage = StorageClient.fromContext(ctx);
  return storage.getAddress(email, addressId);
}

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx) {
  const { requestInfo } = ctx;
  const {
    email, method, org, site,
  } = requestInfo;
  const addressId = requestInfo.getVariable('resourceId');
  switch (method) {
    case 'GET': {
      ctx.authInfo.assertEmail(email);
      ctx.authInfo.assertOrgSite(org, site);

      if (addressId) {
        // retrieve single address
        const address = await retrieveAddress(ctx, email, addressId);
        if (!address) {
          return errorResponse(404, 'Not found');
        }
        return new Response(JSON.stringify({ address }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // list all addresses
      const storage = StorageClient.fromContext(ctx);
      const addresses = await storage.listAddresses(email);
      return new Response(JSON.stringify({ addresses }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    case 'POST': {
      // if addressId is defined, update address
      if (addressId) {
        return errorResponse(501, 'Not implemented');
      }

      // else create
      ctx.authInfo.assertEmail(email);
      ctx.authInfo.assertOrgSite(org, site);

      assertValidAddress(ctx.data);
      const address = await createAddress(ctx, email, ctx.data);
      return new Response(JSON.stringify({ address }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    case 'DELETE': {
      ctx.authInfo.assertEmail(email);
      ctx.authInfo.assertOrgSite(org, site);

      if (!addressId) {
        return errorResponse(400, 'Missing address ID');
      }

      const storage = StorageClient.fromContext(ctx);
      const deleted = await storage.deleteAddress(email, addressId);
      if (!deleted) {
        return errorResponse(404, 'Not found');
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    default:
      return errorResponse(405, 'Method not allowed');
  }
}
