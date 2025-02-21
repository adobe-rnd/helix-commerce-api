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

import { assertAuthorization } from '../../utils/auth.js';
import { errorResponse } from '../../utils/http.js';
import { updateToken } from './update.js';

/**
 * @param {Context} ctx
 */
export default async function rotate(ctx) {
  const { data } = ctx;
  if (data.token) {
    return errorResponse(400, 'token can not be provided on rotate');
  }

  await assertAuthorization(ctx);

  const token = await updateToken(ctx);
  return new Response(JSON.stringify({ token }), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
