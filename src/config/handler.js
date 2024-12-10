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

/**
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
export default async function configHandler(ctx) {
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

  // TODO: validate config body, set config in kv
  return errorResponse(501, 'not implemented');
}
