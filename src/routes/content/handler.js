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

import { errorResponse } from '../../utils/http.js';
import adobeCommerce from './adobe-commerce.js';
import helixCommerce from './helix-commerce.js';

const ALLOWED_METHODS = ['GET'];

/**
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
export default async function contentHandler(ctx) {
  const {
    log,
    // url,
    config,
    info: { method },
  } = ctx;

  if (!ALLOWED_METHODS.includes(method)) {
    return errorResponse(405, 'method not allowed');
  }

  if (!config.pageType) {
    return errorResponse(404, 'invalid config for tenant site (missing pageType)');
  }
  log.debug('config: ', JSON.stringify(config, null, 2));

  if (config.catalogSource === 'helix') {
    // TODO: if ends with json, get from product bus
    return helixCommerce(ctx);
  }
  return adobeCommerce(ctx);
}
