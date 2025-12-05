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
import Router from './utils/router/index.js';
import handlers from './routes/index.js';
import logMetrics from './utils/metrics.js';

/**
 * Name selector for routes.
 */
const nameSelector = (segs) => {
  const literals = segs.filter((seg) => seg !== '*' && !seg.startsWith(':'));
  if (literals.length === 0) {
    return 'org';
  }
  if (literals.at(0) === 'sites' && literals.length > 1) {
    literals.shift();
  }
  return literals.join('-');
};

const router = new Router(nameSelector)
  .add('/:org/sites/:site/catalog/*', handlers.catalog)
  .add('/:org/sites/:site/auth/:subRoute', handlers.auth)
  .add('/:org/sites/:site/orders/:orderId', handlers.orders)
  .add('/:org/sites/:site/orders', handlers.orders)
  .add('/:org/sites/:site/customers/:email/:subroute', handlers.customers)
  .add('/:org/sites/:site/customers/:email', handlers.customers)
  .add('/:org/sites/:site/customers', handlers.customers)
  .add('/:org/sites/:site/cache', handlers.cache)
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

/**
 * @param {Response} resp
 * @returns {Promise<Response>}
 */
async function applyCORSHeaders(resp) {
  const origin = resp.headers.get('access-control-allow-origin') || '*';
  const methods = resp.headers.get('access-control-allow-methods') || 'GET, POST, PUT, DELETE, OPTIONS';
  const headers = resp.headers.get('access-control-allow-headers') || 'Content-Type';
  console.log('origin:', origin);
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

      const { handler, variables } = match;

      // Store variables in context
      ctx.variables = variables;

      // Build config object for backward compatibility
      const { org, site, route } = variables;
      ctx.config = {
        org,
        site,
        route,
        siteKey: `${org}--${site}`,
      };

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
