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

import { errorResponse } from './utils/http.js';
import { resolveConfig } from './utils/config.js';
import handlers from './routes/index.js';

/**
 * @param {Request} req
 */
async function parseData(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return Object.fromEntries(new URL(req.url).searchParams.entries());
  }
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const text = await req.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return null;
}

/**
 * @param {import("@cloudflare/workers-types/experimental").ExecutionContext} pctx
 * @param {Request} req
 * @param {Env} env
 * @returns {Promise<Context>}
 */
export async function makeContext(pctx, req, env) {
  /** @type {Context} */
  // @ts-ignore
  const ctx = pctx;
  // @ts-ignore
  ctx.attributes = {};
  ctx.env = env;
  ctx.url = new URL(req.url);
  ctx.log = console;
  ctx.info = {
    method: req.method.toUpperCase(),
    headers: Object.fromEntries(
      [...req.headers.entries()]
        .map(([k, v]) => [k.toLowerCase(), v]),
    ),
  };
  ctx.data = await parseData(req);
  return ctx;
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {import("@cloudflare/workers-types/experimental").ExecutionContext} pctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, pctx) {
    const ctx = await makeContext(pctx, request, env);

    try {
      const overrides = Object.fromEntries(ctx.url.searchParams.entries());
      ctx.config = await resolveConfig(ctx, overrides);

      console.debug('resolved config: ', JSON.stringify(ctx.config));
      if (!ctx.config) {
        return errorResponse(404, 'config not found');
      }

      return await handlers[ctx.config.route](ctx, request);
    } catch (e) {
      if (e.response) {
        return e.response;
      }
      ctx.log.error(e);
      return errorResponse(500, 'internal server error');
    }
  },
};
