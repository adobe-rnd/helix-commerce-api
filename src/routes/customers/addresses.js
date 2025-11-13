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
 * @param {Address} address
 * @returns {Promise<string>}
 */
async function getAddressId(address) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ ...address, id: undefined })));
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
  const { email } = ctx.config;
  const segments = ctx.url.pathname.split('/').filter(Boolean).slice(['org', 'site', 'route', 'email', 'subroute'].length);
  const [addressId] = segments;
  switch (ctx.info.method) {
    case 'GET': {
      const address = await retrieveAddress(ctx, email, addressId);
      if (!address) {
        return errorResponse(404, 'Not found');
      }
      return new Response(JSON.stringify({ address }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    case 'POST': {
      // if addressId is defined, update address
      if (addressId) {
        return errorResponse(501, 'Not implemented');
      }

      // else create
      assertValidAddress(ctx.data);
      const address = await createAddress(ctx, email, ctx.data);
      return new Response(JSON.stringify({ address }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    default:
      return errorResponse(405, 'Method not allowed');
  }
}
