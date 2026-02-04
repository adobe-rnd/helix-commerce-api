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
import Router, { nameSelector } from './utils/router/index.js';
import { RequestInfo } from './utils/RequestInfo.js';
import handlers from './routes/index.js';
import logMetrics from './utils/metrics.js';
import AuthInfo from './utils/AuthInfo.js';

const router = new Router(nameSelector)
  .add('/:org/sites/:site/catalog/*', handlers.catalog)
  .add('/:org/sites/:site/auth/:subRoute', handlers.auth)
  .add('/:org/sites/:site/auth/:subRoute/:email', handlers.auth)
  .add('/:org/sites/:site/auth', handlers.auth)
  .add('/:org/sites/:site/orders/:orderId', handlers.orders)
  .add('/:org/sites/:site/orders', handlers.orders)
  .add('/:org/sites/:site/customers/:email/:subroute', handlers.customers)
  .add('/:org/sites/:site/customers/:email', handlers.customers)
  .add('/:org/sites/:site/customers', handlers.customers)
  .add('/:org/sites/:site/cache', handlers.cache)
  .add('/:org/sites/:site/index/*', handlers.indices)
  .add('/:org/sites/:site/operations-log', handlers['operations-log']);

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
  ctx.data = await parseData(req);
  return ctx;
}

/**
 * @param {Response} resp
 * @returns {Promise<Response>}
 */
async function applyCORSHeaders(resp) {
  const origin = resp.headers.get('access-control-allow-origin') || '*';
  const methods = resp.headers.get('access-control-allow-methods') || 'GET, POST, PUT, DELETE, OPTIONS';
  const headers = resp.headers.get('access-control-allow-headers') || 'Content-Type';
  return new Response(await resp.text(), {
    status: resp.status,
    headers: {
      ...Object.fromEntries([...resp.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])),
      'access-control-allow-origin': origin,
      'access-control-allow-methods': methods,
      'access-control-allow-headers': headers,
    },
  });
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
      // Use router to match request and extract variables
      const match = router.match(ctx.url.pathname);

      if (!match) {
        return errorResponse(404, 'route not found');
      }

      const { handler } = match;
      ctx.requestInfo = RequestInfo.fromRouterMatch(request, match);
      // @ts-ignore
      ctx.authInfo = await AuthInfo.create(ctx, request);

      let resp = await handler(ctx, request);
      resp = await applyCORSHeaders(resp);
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
