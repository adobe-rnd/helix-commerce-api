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
import rotate from './rotate.js';

/**
 * @type {Record<string, Record<string, RouteHandler>>}
 */
const handlers = {
  token: {
    GET: retrieve,
    PUT: update,
    POST: rotate,
  },
};

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx, req) {
  const { requestInfo } = ctx;

  const subRoute = requestInfo.getVariable('subRoute');
  const { method } = requestInfo;

  const fn = handlers[subRoute]?.[method];
  if (!fn) {
    return errorResponse(404);
  }
  return fn(ctx, req);
}
