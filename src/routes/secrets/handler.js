/*
 * Copyright 2026 Adobe. All rights reserved.
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
import { validate, validateSecretsPath } from '../../utils/validation.js';
import { deriveKey, encrypt } from '../../utils/encryption.js';
import secretSchemas from '../../schemas/secrets/index.js';

/**
 * Write a secret to the secrets bucket.
 *
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
async function write(ctx) {
  const {
    requestInfo: { org, site, path },
    env: { SECRETS_BUCKET, SECRETS_PK },
    data,
  } = ctx;

  const { valid, error, filename } = validateSecretsPath(path);
  if (!valid) {
    return errorResponse(400, error);
  }

  const schema = secretSchemas[filename];
  if (!schema) {
    return errorResponse(404, `unknown secret store: ${filename}`);
  }

  const errors = validate(data, schema);
  if (errors) {
    return errorResponse(400, 'invalid payload', { errors });
  }

  const key = await deriveKey(SECRETS_PK, org, site);
  const encrypted = await encrypt(key, JSON.stringify(data));

  const storageKey = `${org}/${site}/secrets${path}`;
  try {
    await SECRETS_BUCKET.put(storageKey, encrypted, {
      httpMetadata: { contentType: 'application/octet-stream' },
    });
  } catch (e) {
    ctx.log.error('Error writing secret', { error: e });
    return errorResponse(500, 'error writing secret');
  }

  return new Response(null, { status: 204 });
}

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx) {
  const { requestInfo, authInfo } = ctx;
  const { method, org, site } = requestInfo;

  authInfo.assertAuthenticated();
  authInfo.assertPermissions('secrets:write');
  authInfo.assertOrgSite(org, site);

  if (authInfo.isServiceToken) {
    return errorResponse(403, 'service tokens cannot write secrets');
  }

  switch (method) {
    case 'PUT':
      return write(ctx);
    default:
      return errorResponse(405, 'method not allowed');
  }
}
