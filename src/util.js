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

/**
 * @param {TemplateStringsArray} strs
 * @param  {...any} params
 * @returns {string}
 */
export function gql(strs, ...params) {
  let res = '';
  strs.forEach((s, i) => {
    res += s;
    if (i < params.length) {
      res += params[i];
    }
  });
  return res.replace(/(\\r\\n|\\n|\\r)/gm, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {number} status
 * @param {string} xError
 * @param {string|Record<string,unknown>} [body='']
 * @returns {Response}
 */
export function errorResponse(status, xError, body = '') {
  return new Response(typeof body === 'object' ? JSON.stringify(body) : body, {
    status,
    headers: { 'x-error': xError },
  });
}

/**
 * @param {number} status
 * @param {string} xError
 * @param {string|Record<string,unknown>} [body='']
 * @returns {Error & {response: Response}}
 */
export function errorWithResponse(status, xError, body = '') {
  const response = errorResponse(status, xError, body);
  const error = new Error(xError);
  error.response = response;
  return error;
}

/**
 * @param {import("@cloudflare/workers-types/experimental").ExecutionContext} pctx
 * @param {Request} req
 * @param {Record<string, string>} env
 * @returns {Context}
 */
export function makeContext(pctx, req, env) {
  /** @type {Context} */
  // @ts-ignore
  const ctx = pctx;
  ctx.env = env;
  ctx.url = new URL(req.url);
  ctx.log = console;
  ctx.info = {
    method: req.method,
    headers: Object.fromEntries(req.headers),
  };
  return ctx;
}

export function pruneUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
