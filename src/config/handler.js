/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { errorResponse } from '../utils/http.js';
import { assertAuthorization } from '../utils/auth.js';
import { validate } from '../utils/validation.js';
import ConfigSchema from '../schemas/Config.js';

/**
 * @param {Context} ctx
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function configHandler(ctx, req) {
  const { method } = ctx.info;
  if (!['GET', 'POST'].includes(method)) {
    return errorResponse(405, 'method not allowed');
  }

  await assertAuthorization(ctx);

  if (method === 'GET') {
    return new Response(ctx.config.confMapStr, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  let json;
  try {
    json = await req.json();
  } catch {
    return errorResponse(400, 'invalid JSON');
  }

  const errors = validate(json, ConfigSchema);
  if (errors && errors.length) {
    return errorResponse(400, 'invalid body', { errors });
  }

  // valid, persist it
  await ctx.env.CONFIGS.put(ctx.config.siteKey, JSON.stringify(json));
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
