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

import { assertAuthorization } from '../../utils/auth.js';
import { errorResponse, errorWithResponse } from '../../utils/http.js';

const generateToken = () => crypto.randomUUID().toUpperCase();

/**
 *
 * @param {Context} ctx
 * @param {string} [token]
 * @returns {Promise<string>}
 */
export async function updateToken(ctx, token = generateToken()) {
  const { requestInfo } = ctx;
  const { siteKey } = requestInfo;

  try {
    await ctx.env.KEYS.put(siteKey, token);
  } catch (e) {
    ctx.log.error('failed to update token', e);
    throw errorWithResponse(503, 'failed to update token');
  }
  return token;
}

/**
 * @type {RouteHandler}
 */
export default async function update(ctx) {
  const { data } = ctx;
  if (!data.token || typeof data.token !== 'string') {
    return errorResponse(400, 'missing or invalid token');
  }

  await assertAuthorization(ctx);

  const token = await updateToken(ctx, data.token);
  return new Response(JSON.stringify({ token }), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
