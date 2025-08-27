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
import logMetrics from './utils/metrics.js';

/**
 * @param {import("@cloudflare/workers-types").Request} req
 */
async function parseData(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return Object.fromEntries(new URL(req.url).searchParams.entries());
  }
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const text = await req.text();
    if (text.trim().length) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }

    const params = new URL(req.url).searchParams;
    if (params.size) {
      return Object.fromEntries(params.entries());
    }
  }
  return {};
}

/**
 * @param {import("@cloudflare/workers-types").ExecutionContext} eCtx
 * @param {import("@cloudflare/workers-types").Request} req
 * @param {Env} env
 * @returns {Promise<Context>}
 */
export async function makeContext(eCtx, req, env) {
  /** @type {Context} */
  // @ts-ignore
  const ctx = {
    executionContext: eCtx,
  };
  // @ts-ignore
  ctx.attributes = {};
  ctx.env = env;
  ctx.url = new URL(req.url);
  ctx.log = console;
  ctx.metrics = {
    startedAt: Date.now(),
    payloadValidationMs: [],
    imageDownloads: [],
    imageUploads: [],
    productUploadsMs: [],
  };
  ctx.progress = {
    total: 0,
    processed: 0,
    failed: 0,
  };
  const filename = ctx.url.pathname.split('/').pop() ?? '';
  ctx.info = {
    filename,
    method: req.method.toUpperCase(),
    extension: filename.split('.').pop(),
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
   * @param {import("@cloudflare/workers-types").Request} request
   * @param {Env} env
   * @param {import("@cloudflare/workers-types").ExecutionContext} eCtx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, eCtx) {
    const ctx = await makeContext(eCtx, request, env);

    try {
      ctx.config = await resolveConfig(ctx);
      console.debug('resolved config: ', JSON.stringify(ctx.config, null, 2));

      const fn = handlers[ctx.config.route];
      if (!fn) {
        return errorResponse(404, 'route not found');
      }
      const resp = await fn(ctx, request);
      return resp;
    } catch (e) {
      if (e.response) {
        return e.response;
      }
      ctx.log.error(e);
      return errorResponse(500, 'internal server error');
    } finally {
      logMetrics(ctx);
    }
  },
};
