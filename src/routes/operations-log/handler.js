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

const allowedActions = new Set([
  'add-to-cart',
  'added-to-cart',
  'failed-adding-to-cart',
]);

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx) {
  if (ctx.info.method !== 'POST') {
    return errorResponse(404, 'Not found');
  }

  if (!ctx.data || !ctx.data.action) {
    return errorResponse(404, 'Not found');
  }

  const { action } = ctx.data;
  if (!action || !allowedActions.has(action)) {
    return errorResponse(404, 'Not found');
  }

  ctx.log.info({
    org: ctx.config.org,
    site: ctx.config.site,
    action,
    payload: ctx.data,
  });
  return errorResponse(200, 'OK');
}
