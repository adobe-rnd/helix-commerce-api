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

import { errorWithResponse, ffetch } from './http.js';
import { validate } from './validation.js';
import ConfigSchema from '../schemas/Config.js';

/**
 * Fetch config from the config service.
 */
export async function fetchHelixConfig(ctx, org, site /* we ignore ref for now , ref */) {
  const { log } = ctx;

  const fopts = {
    headers: {
      'cache-control': 'no-cache', // respected by runtime
      'x-access-token': ctx.env.HLX_CONFIG_SERVICE_TOKEN,
      'x-backend-type': 'aws',
    },
  };

  const url = `https://config.aem.page/main--${site}--${org}/config.json?scope=raw`;

  try {
    const response = await ffetch(url, fopts);
    const { ok, status } = response;
    if (ok) {
      log.info(`loaded config from ${url}`);
      const config = await response.json();
      return config.legacy ? null : config;
    }
    if (status !== 404) {
      log.warn(`error loading config from ${url}: ${response.status}`);
    }
    return null;
  } catch (e) {
    const msg = `Fetching config from ${url} failed: ${e.message}`;
    throw errorWithResponse(502, msg);
  }
}

/**
 * @param {Context} ctx
 * @param {any} config
 * @returns {asserts config is ProductBusConfig}
 */
export function assertValidConfig(ctx, config) {
  const { log } = ctx;
  const errors = validate(config, ConfigSchema);
  if (errors) {
    log.info('Invalid config', { errors });
    throw errorWithResponse(400, 'Invalid config', { errors });
  }
}

/**
 * @param {Context} ctx
 * @returns {Promise<ProductBusConfig|null>}
 */
export async function fetchProductBusConfig(ctx) {
  const {
    log,
    requestInfo: {
      org,
      site,
    },
    env: {
      CONFIGS_BUCKET: configsBucket,
    },
  } = ctx;

  const key = `${org}/${site}/config.json`;
  if (!ctx.attributes.configs) {
    ctx.attributes.configs = {};
  }
  if (ctx.attributes.configs?.[key]) {
    return ctx.attributes.configs[key];
  }

  const body = await configsBucket.get(key);
  try {
    if (body) {
      const config = await body.json();
      ctx.attributes.configs[key] = config;
      return config;
    }
  } catch (e) {
    log.error('Error fetching config', { error: e });
    // treat invalid JSON as empty config
    return {};
  }
  return null;
}
