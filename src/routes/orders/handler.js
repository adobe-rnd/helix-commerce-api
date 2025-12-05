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

import { errorResponse } from '../../utils/http.js';
import list from './list.js';
import retrieve from './retrieve.js';
import create from './create.js';
import remove from './remove.js';

/**
 * @type {Record<string, RouteHandler>}
 */
const allHandlers = {
  // GET ${org}/${site}/orders
  GET: list,
  // POST ${org}/${site}/orders
  POST: create,
  OPTIONS: async () => new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  }),
};

/**
 * @type {Record<string, RouteHandler>}
 */
const oneHandlers = {
  // GET ${org}/${site}/orders/${id}
  GET: retrieve,
  // DELETE ${org}/${site}/orders/${id}
  DELETE: remove,
  OPTIONS: async () => new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  }),
};

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx, request) {
  const {
    variables,
    config,
    info: { method },
  } = ctx;

  const { orderId } = variables;
  const handlers = orderId ? oneHandlers : allHandlers;

  Object.assign(config, {
    orderId,
  });

  const fn = handlers[method];
  if (!fn) {
    return errorResponse(405, 'method not allowed');
  }

  return fn(ctx, request);
}
