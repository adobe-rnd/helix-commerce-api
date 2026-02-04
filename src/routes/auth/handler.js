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
import retrieve from './token/retrieve.js';
import update from './token/update.js';
import rotate from './token/rotate.js';
import login from './login.js';
import callback from './callback.js';
import listAdmins from './admins/list.js';
import retrieveAdmin from './admins/retrieve.js';
import createAdmin from './admins/create.js';
import removeAdmin from './admins/remove.js';
import logout from './logout.js';

/**
 * @type {Record<string, Record<string, RouteHandler>>}
 */
const handlers = {
  token: {
    GET: retrieve,
    PUT: update,
    POST: rotate,
  },
  login: {
    POST: login,
  },
  logout: {
    POST: logout,
  },
  callback: {
    POST: callback,
  },
  admins: {
    GET: (ctx, req) => {
      const email = ctx.requestInfo.getVariable('email');
      if (email) {
        return retrieveAdmin(ctx, req);
      }
      return listAdmins(ctx, req);
    },
    PUT: createAdmin,
    DELETE: removeAdmin,
  },
};

/**
 * @type {RouteHandler}
 */
export default async function handler(ctx, req) {
  const { requestInfo } = ctx;
  const subRoute = requestInfo.getVariable('subRoute');
  const { method } = requestInfo;

  // for PUT /{org}/sites/{site}/auth with superuser permissions,
  // create a sitefile in <AUTH_BUCKET/sites/{org}/{site}
  // this is used to track which sites have auth enabled

  if (method === 'PUT' && !subRoute && ctx.authInfo.isSuperuser()) {
    const { org, site } = requestInfo;
    const key = `sites/${org}/${site}`;

    // check if sitefile exists already
    const existing = await ctx.env.AUTH_BUCKET.head(key);
    if (existing) {
      return errorResponse(409, 'sitefile already exists');
    }

    await ctx.env.AUTH_BUCKET.put(key, '', {
      customMetadata: {
        createdAt: new Date().toISOString(),
        createdBy: ctx.authInfo.email || 'unknown',
      },
    });
    return new Response('', {
      status: 201,
    });
  }

  const fn = handlers[subRoute]?.[method];
  if (!fn) {
    return errorResponse(404);
  }
  return fn(ctx, req);
}
