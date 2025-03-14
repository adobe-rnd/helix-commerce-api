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

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx) {
  const {
    env,
    log,
    info: { filename },
    config: { org, site },
  } = ctx;

  const key = `${org}/${site}/media/${filename}`;
  log.debug('fetching media: ', key);
  const resp = await env.CATALOG_BUCKET.get(key);
  if (!resp) {
    return errorResponse(404, 'File not found');
  }

  // @ts-ignore
  return new Response(resp.body, {
    headers: {
      'Content-Type': resp.httpMetadata.contentType,
    },
  });
}
