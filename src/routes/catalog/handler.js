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
import retrieve from './retrieve.js';
import update from './update.js';
import remove from './remove.js';

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx, request) {
  const {
    variables,
    info: { method },
  } = ctx;

  const { path } = variables;
  if (!path) {
    return errorResponse(404, 'path is required');
  }

  switch (method) {
    case 'GET':
      return retrieve(ctx, request);
    case 'POST':
      if (path !== '/*') {
        return errorResponse(400, 'POST only allowed for bulk operations at /*');
      }
      return update(ctx, request);
    case 'PUT':
      return update(ctx, request);
    case 'DELETE':
      return remove(ctx, request);
    default:
      return errorResponse(405, 'method not allowed');
  }
}
