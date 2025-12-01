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

import { assertRequiredProperties, nextRequestId } from '../../../utils/cache.js';
import { ffetch } from '../../../utils/http.js';

/**
 * Default timeout in milliseconds to wait for a response from Akamai.
 * Set to 10 seconds to account for Edge Grid authentication overhead.
 */
const DEFAULT_TIMEOUT_MS = 10000; // 10s

/**
 * Computes SHA-256 hash of the given text and returns it as a base64-encoded string.
 *
 * @param {string} text - The text to hash
 * @returns {Promise<string>} Base64-encoded SHA-256 hash
 */
const sha256 = async (text) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
};

/**
 * Computes HMAC-SHA256 signature using the given secret and data.
 *
 * @param {string} secret - The secret key for HMAC
 * @param {string} data - The data to sign
 * @returns {Promise<string>} Base64-encoded HMAC signature
 */
const hmac = async (secret, data) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder()
    .encode(secret).buffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data).buffer);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

/**
 * Computes the content hash for the request body (required for Edge Grid auth).
 * Only POST requests with non-empty bodies are hashed.
 *
 * @param {Object} request - The request object
 * @param {string} request.method - HTTP method
 * @param {string} [request.body] - Request body
 * @returns {Promise<string>} SHA-256 hash of body, or empty string if not applicable
 */
async function contentHash(request) {
  /* c8 ignore next */
  const body = request.body || '';
  if (request.method === 'POST' && body.length > 0) {
    return sha256(body);
  }
  /* c8 ignore next */
  return '';
}

/**
 * Constructs the canonical data string to be signed for Edge Grid authentication.
 * The format follows Akamai's Edge Grid specification with tab-separated values.
 *
 * @param {Object} request - The request object with url and method
 * @param {string} authHeader - The partial authorization header (without signature)
 * @returns {Promise<string>} Tab-separated canonical data string
 */
async function dataToSign(request, authHeader) {
  const {
    protocol, host, pathname, search,
  } = new URL(request.url);
  const data = [
    request.method.toUpperCase(),
    protocol.replace(':', ''),
    host,
    `${pathname}${search}`,
    '',
    await contentHash(request),
    authHeader,
  ];
  return data.join('\t');
}

/**
 * Signs the request using Akamai Edge Grid authentication with HMAC-SHA256.
 * Implements the two-stage HMAC process: key derivation from timestamp,
 * then signing the canonical request data.
 *
 * @param {Object} request - The request to sign
 * @param {string} timestamp - ISO 8601 timestamp for signature
 * @param {string} clientSecret - Akamai client secret
 * @param {string} authHeader - Partial authorization header
 * @returns {Promise<string>} Base64-encoded signature
 */
async function signRequest(request, timestamp, clientSecret, authHeader) {
  const key = await hmac(clientSecret, timestamp);
  return hmac(key, await dataToSign(request, authHeader));
}

/**
 * Computes the complete Edge Grid Authorization header for an Akamai API request.
 * Generates timestamp, nonce, and cryptographic signature according to Edge Grid spec.
 *
 * @param {Object} config - Akamai configuration with credentials
 * @param {string} config.clientToken - Edge Grid client token
 * @param {string} config.accessToken - Edge Grid access token
 * @param {string} config.clientSecret - Edge Grid client secret
 * @param {Object} request - The request to authenticate
 * @returns {Promise<string>} Complete Authorization header value
 */
async function computeAuthorizationHeader(config, request) {
  const ts = `${new Date().toISOString().replaceAll('-', '').split('.')[0]}+0000`;
  const nonce = crypto.randomUUID();

  const { clientToken, accessToken, clientSecret } = config;

  const obj = {
    client_token: clientToken,
    access_token: accessToken,
    timestamp: ts,
    nonce,
  };
  let joinedPairs = '';

  Object.entries(obj).forEach(([key, value]) => {
    joinedPairs = `${joinedPairs}${key}=${value};`;
  });

  const authHeader = `EG1-HMAC-SHA256 ${joinedPairs}`;
  const signedAuthHeader = `${authHeader}signature=${await signRequest(request, ts, clientSecret, authHeader)}`;

  return signedAuthHeader;
}

/**
 * Purge client for Akamai CDN using Edge Grid authentication and tag-based purging.
 *
 * This client implements Akamai's Fast Purge API with Edge Grid authentication,
 * which uses HMAC-SHA256 signatures for request security. Supports purging by
 * cache tags (surrogate keys) or URLs with a 10-second timeout per request.
 */
export class AkamaiPurgeClient {
  /**
   * Validates that all required Akamai Edge Grid configuration properties are present.
   *
   * Required properties: host, endpoint, clientSecret, clientToken, accessToken
   *
   * @param {import('@adobe/helix-admin-support').AkamaiConfig} config - Akamai config
   * @throws {Error} If any required property is missing or falsy
   */
  static validate(config) {
    assertRequiredProperties(config, 'invalid purge config', 'host', 'endpoint', 'clientSecret', 'clientToken', 'accessToken');
  }

  /**
   * Indicates whether this client supports purging by cache tags.
   *
   * @returns {boolean} Always returns true (Akamai supports tag-based purging)
   */
  static supportsPurgeByKey() {
    return true;
  }

  /**
   * Sends an authenticated purge request to Akamai's Fast Purge API.
   *
   * This helper method constructs the request with Edge Grid authentication headers,
   * sets up an abort signal with timeout, and executes the HTTP request. The request
   * is signed using Akamai's Edge Grid HMAC-SHA256 signature protocol.
   *
   * @param {Context} ctx - Request context (used for logging in caller)
   * @param {import('@adobe/helix-admin-support').AkamaiConfig} config - Akamai credentials
   * @param {string} type - Purge type: 'url' for URL-based or 'tag' for cache tag purging
   * @param {Array<string>} data - Array of URLs or tags to purge
   * @returns {Promise<Response>} HTTP response from Akamai API
   */
  static async sendPurgeRequest(ctx, config, type, data) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    // timeout signal
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const { signal } = controller;

    const request = {
      url: `https://${config.endpoint}/ccu/v3/delete/${type}/production`,
      method: 'POST',
      headers,
      body: JSON.stringify({ objects: data }),
      signal,
    };
    headers.Authorization = await computeAuthorizationHeader(config, request);
    try {
      return ffetch(request.url, request);
    } finally {
      // avoid pending timers which prevent node process from exiting
      clearTimeout(timerId);
    }
  }

  /**
   * Purges cached content from Akamai CDN by cache tags.
   *
   * This method sends a single purge request to Akamai's Fast Purge API using
   * cache tags. Unlike other CDN clients, this does not implement batching as
   * Akamai's API can handle large tag arrays in a single request. Each request
   * includes Edge Grid authentication and has a 10-second timeout.
   *
   * @param {Context} ctx - Request context with logging and config
   * @param {import('@adobe/helix-admin-support').AkamaiConfig} purgeConfig - Akamai config
   * @param {Object} params - Purge parameters
   * @param {Array<string>} [params.keys] - Cache tags to purge
   * @throws {Error} If the API request fails or returns a non-OK status
   */
  static async purge(ctx, purgeConfig, { keys }) {
    const { log, config } = ctx;
    const { siteKey, storeCode, storeViewCode } = config;
    const siteId = `${siteKey}/${storeCode}/${storeViewCode}`;
    const { host } = purgeConfig;

    let msg;
    let resp;

    if (keys?.length) {
      const id = nextRequestId(ctx);
      try {
        /* c8 ignore next */
        log.info(`${siteId} [${id}] [akamai] ${host} purging keys '${keys}'`);
        resp = await AkamaiPurgeClient.sendPurgeRequest(ctx, purgeConfig, 'tag', keys);
      } /* c8 ignore next 4 */ catch (err) {
        msg = `${siteId} [${id}] [akamai] ${host} key purge failed: ${err}`;
        log.error(msg);
        throw new Error(msg);
      }
      const result = await resp.text();
      if (resp.ok) {
        /* c8 ignore next */
        log.info(`${siteId} [${id}] [akamai] ${host} key purge succeeded: ${resp.status} - ${result}`);
      } else {
        /* c8 ignore next */
        msg = `${siteId} [${id}] [akamai] ${host} key purge failed: ${resp.status} - ${result}`;
        log.error(msg);
        throw new Error(msg);
      }
    }
  }
}
