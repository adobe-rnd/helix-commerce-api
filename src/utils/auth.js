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

import { errorWithResponse } from './http.js';

/**
 * @param {Context} ctx
 */
export async function assertAuthorization(ctx) {
  let actual;
  if (typeof ctx.attributes.key === 'undefined') {
    ctx.attributes.key = ctx.info.headers.authorization?.slice('Bearer '.length);
    actual = ctx.attributes.key;
  }
  if (actual === ctx.env.SUPERUSER_KEY) {
    ctx.log.info('acting as superuser');
    return;
  }

  if (!actual) {
    throw errorWithResponse(403, 'invalid key');
  }
  const expected = await ctx.env.KEYS.get(ctx.config.siteKey);
  if (!expected) {
    throw errorWithResponse(403, 'no key found for site');
  }
  if (actual !== expected) {
    throw errorWithResponse(403, 'access denied');
  }
}
