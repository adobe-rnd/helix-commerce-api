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
// @ts-check

import { errorResponse, errorWithResponse, makeContext } from './util.js';
import getProductQueryCS, { adapter } from './queries/cs-product.js';
import getProductQueryCore from './queries/core-product.js';
import HTML_TEMPLATE from './templates/html.js';
import { resolveConfig } from './config.js';

/**
 * @param {string} sku
 * @param {Config} config
 */
async function fetchProductCS(sku, config) {
  const query = getProductQueryCS({ sku });

  const resp = await fetch(`https://catalog-service.adobe.io/graphql?query=${encodeURIComponent(query)}`, {
    headers: {
      origin: 'https://api.adobecommerce.live',
      'x-api-key': config.apiKey,
      'Magento-Environment-Id': config.magentoEnvironmentId,
      'Magento-Website-Code': config.magentoWebsiteCode,
      'Magento-Store-View-Code': config.magentoStoreViewCode,
    },
  });
  if (!resp.ok) {
    console.warn('failed to fetch product: ', resp.status, resp.statusText);
    throw errorWithResponse(resp.status, 'failed to fetch product');
  }

  const json = await resp.json();
  try {
    const [productData] = json.data.products;
    if (!productData) {
      throw errorWithResponse(404, 'could not find product', json.errors);
    }
    const product = adapter(productData);
    return product;
  } catch (e) {
    console.error('failed to parse product: ', e);
    throw errorWithResponse(500, 'failed to parse product response');
  }
}

/**
 * @param {{ urlkey: string } | { sku: string }} opt
 * @param {Config} config
 */
// eslint-disable-next-line no-unused-vars
async function fetchProductCore(opt, config) {
  const query = getProductQueryCore(opt);
  if (!config.coreEndpoint) {
    throw errorWithResponse(400, 'coreEndpoint not configured');
  }

  const resp = await fetch(`${config.coreEndpoint}?query=${encodeURIComponent(query)}`, {
    headers: {
      origin: 'https://api.adobecommerce.live',
      'x-api-key': config.apiKey,
      'Magento-Environment-Id': config.magentoEnvironmentId,
      'Magento-Website-Code': config.magentoWebsiteCode,
      'Magento-Store-View-Code': config.magentoStoreViewCode,
    },
  });
  if (!resp.ok) {
    console.warn('failed to fetch product: ', resp.status, resp.statusText);
    throw errorWithResponse(resp.status, 'failed to fetch product');
  }

  const json = await resp.json();
  try {
    const [product] = json.data.products;
    if (!product) {
      throw errorWithResponse(404, 'could not find product', json.errors);
    }
    return product;
  } catch (e) {
    console.error('failed to parse product: ', e);
    throw errorWithResponse(500, 'failed to parse product response');
  }
}

/**
 * @param {Context} ctx
 * @param {Config} config
 */
async function handlePDPRequest(ctx, config) {
  const { sku, urlkey } = config.params;
  if (!sku && !urlkey) {
    return errorResponse(404, 'missing sku or urlkey');
  }

  // const product = await fetchProductCore({ sku }, config);
  const product = await fetchProductCS(sku.toUpperCase(), config);
  const html = HTML_TEMPLATE(product);
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html',
    },
  });
}

/**
 * @type {Record<string, (ctx: Context, config: Config) => Promise<Response>>}
 */
const handlers = {
  content: async (ctx, config) => {
    if (config.pageType !== 'product') {
      return errorResponse(404, 'page type not supported');
    }
    return handlePDPRequest(ctx, config);
  },
  // eslint-disable-next-line no-unused-vars
  graphql: async (ctx, config) => errorResponse(501, 'not implemented'),
};

export default {
  /**
   * @param {Request} request
   * @param {Record<string, string>} env
   * @param {import("@cloudflare/workers-types/experimental").ExecutionContext} pctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, pctx) {
    const ctx = makeContext(pctx, request, env);
    if (ctx.info.method !== 'GET') {
      return errorResponse(405, 'method not allowed');
    }

    const [_, tenant, route] = ctx.url.pathname.split('/');
    if (!tenant) {
      return errorResponse(404, 'missing tenant');
    }
    if (!route) {
      return errorResponse(404, 'missing route');
    }

    const overrides = Object.fromEntries(ctx.url.searchParams.entries());
    const config = resolveConfig(ctx, tenant, overrides);
    if (!config) {
      return errorResponse(404, 'config not found');
    }

    try {
      return handlers[route](ctx, config);
    } catch (e) {
      if (e.response) {
        return e.response;
      }
      ctx.log.error(e);
      return errorResponse(500, 'internal server error');
    }
  },
};
