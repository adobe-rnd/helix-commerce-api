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

import { assertSuperuser } from '../../../utils/auth.js';
import { errorResponse } from '../../../utils/http.js';

/**
 * Create an admin for a site
 * @type {RouteHandler}
 */
export default async function create(ctx) {
  const {
    env,
    requestInfo: { org, site },
  } = ctx;

  // superuser only
  await assertSuperuser(ctx);

  const email = ctx.requestInfo.getVariable('email');
  if (!email) {
    return errorResponse(400, 'missing email');
  }

  const key = `${org}/${site}/admins/${email}`;

  // reject if already exists
  const existing = await env.AUTH_BUCKET.head(key);
  if (existing) {
    return errorResponse(409, 'admin already exists');
  }

  // get the IP address of the requester
  // TODO: use email once superuser is auth'd by email
  const addedBy = ctx.requestInfo.getHeader('cf-connecting-ip') || 'unknown';

  /** @type {AdminMetadata} */
  const metadata = {
    dateAdded: new Date().toISOString(),
    addedBy,
  };
  await env.AUTH_BUCKET.put(key, '', {
    customMetadata: metadata,
  });

  return new Response(JSON.stringify({
    email,
    ...metadata,
  }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
