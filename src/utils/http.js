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
 * @param {string} url - The URL to fetch.
 * @param {import("@cloudflare/workers-types").RequestInit } init - The request init.
 * @returns {Promise<Response>} - A promise that resolves to the response.
 */
export async function ffetch(url, init) {
  // @ts-ignore
  const resp = await fetch(url, init);
  console.debug({
    url,
    status: resp.status,
    statusText: resp.statusText,
    headers: Object.fromEntries(resp.headers),
  });
  return resp;
}

/**
 * A custom error that includes a response property.
 * @extends Error
 */
export class ResponseError extends Error {
  /**
   * Creates a ResponseError instance.
   * @param {string} message - The error message.
   * @param {Response} response - The associated Response object.
   */
  constructor(message, response) {
    super(message);
    this.response = response;

    // Set the prototype explicitly for correct instance checks
    Object.setPrototypeOf(this, ResponseError.prototype);
  }
}

/**
 * @param {number} status - The HTTP status code.
 * @param {string} [xError] - The error message.
 * @param {string|Record<string,unknown>} [body=''] - The response body.
 * @returns {Response} - A response object.
 */
export function errorResponse(status, xError, body = '') {
  return new Response(typeof body === 'object' ? JSON.stringify(body) : body, {
    status,
    headers: {
      'x-error': xError,
      ...(typeof body === 'object' ? { 'content-type': 'application/json' } : {}),
    },
  });
}

/**
 * @param {number} status - The HTTP status code.
 * @param {string} xError - The error message.
 * @param {string|Record<string,unknown>} [body=''] - The response body.
 * @returns {Error & {response: Response}} - An error object with a response property.
 */
export function errorWithResponse(status, xError, body = '') {
  const response = errorResponse(status, xError, body);
  const error = new ResponseError(xError, response);
  return error;
}

/**
 * @param {string[]} [methods] - allowed methods
 * @param {string[]} [headers] - allowed headers
 * @param {string[]} [origins] - allowed origins
 * @returns {(ctx: Context) => Promise<Response>}
 */
export function optionsHandler(methods = ['POST'], headers = ['Content-Type, Authorization'], origins = ['*']) {
  return async (ctx) => {
    const origin = ctx.requestInfo.getHeader('origin') || '*';
    let acao;
    if (origins.includes(origin) || origins.includes('*')) {
      acao = origin;
    }
    return new Response(null, {
      status: 200,
      headers: {
        ...(methods.length > 0 ? { 'Access-Control-Allow-Methods': methods.join(',') } : {}),
        ...(headers.length > 0 ? { 'Access-Control-Allow-Headers': headers.join(',') } : {}),
        ...(acao ? { 'Access-Control-Allow-Origin': acao } : {}),
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  };
}
