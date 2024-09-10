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

import { errorResponse, makeContext } from './util.js';
import getProductQueryCS from './queries/cs-product.js';
import getProductQueryCore from './queries/core-product.js';
import HTML_TEMPLATE from './templates/html.js';

/**
* @type {Record<string, Config>}
*/
const TENANT_CONFIGS = {
  visualcomfort: {
    apiKey: '59878b5d8af24fe9a354f523f5a0bb62',
    magentoEnvironmentId: '97034e45-43a5-48ab-91ab-c9b5a98623a8',
    magentoWebsiteCode: 'base',
    magentoStoreViewCode: 'default',
    coreEndpoint: 'https://www.visualcomfort.com/graphql',
  },
};

/**
* @param {string} tenant
* @param {Partial<Config>} [overrides={}]
* @returns {Config|null}
*/
function lookupConfig(tenant, overrides) {
  if (!TENANT_CONFIGS[tenant]) {
    return null;
  }
  // @ts-ignore
  return {
    ...TENANT_CONFIGS[tenant],
    ...overrides,
  };
}

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
    console.warn('failed to fetch product: ', resp.status);
    return resp;
  }

  const json = await resp.json();
  try {
    const [product] = json.data.products;
    if (!product) {
      return errorResponse(404, 'could not find product', json.errors);
    }
    return product;
  } catch (e) {
    console.error('failed to parse product: ', e);
    return errorResponse(500, 'failed to parse product response');
  }
}

/**
 * @param {{ urlKey: string } | { sku: string }} opt
 * @param {Config} config
 */
// eslint-disable-next-line no-unused-vars
async function fetchProductCore(opt, config) {
  const query = getProductQueryCore(opt);
  if (!config.coreEndpoint) {
    return errorResponse(400, 'coreEndpoint not configured');
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
    console.warn('failed to fetch product: ', resp.status);
    return resp;
  }

  const json = await resp.json();
  try {
    const [product] = json.data.products;
    if (!product) {
      return errorResponse(404, 'could not find product', json.errors);
    }
    return product;
  } catch (e) {
    console.error('failed to parse product: ', e);
    return errorResponse(500, 'failed to parse product response');
  }
}

function resolvePDPTemplate(product) {
  return HTML_TEMPLATE(product);
}

/**
* @param {Context} ctx
*/
async function handlePDPRequest(ctx) {
  // eslint-disable-next-line no-unused-vars
  const [_, tenant, _route, _pageType, sku] = ctx.url.pathname.split('/');
  if (!sku) {
    return errorResponse(404, 'missing sku');
  }

  const overrides = Object.fromEntries(ctx.url.searchParams.entries());
  const config = lookupConfig(tenant, overrides);
  if (!config) {
    return errorResponse(404, 'config not found');
  }

  // const product = await fetchProductCore({ sku }, config);
  const product = await fetchProductCS(sku, config);
  const html = resolvePDPTemplate(product);
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html',
    },
  });
}

/**
* @param {Context} ctx
*/
async function handleContentRequest(ctx) {
  const [pageType] = ctx.url.pathname.split('/').slice(3);
  switch (pageType) {
    case 'product':
      return handlePDPRequest(ctx);
    default:
      return errorResponse(404, 'unknown content subroute');
  }
}

export default {
  /**
  *
  * @param {Request} request
  * @param {Record<string, string>} env
  * @param {import("@cloudflare/workers-types/experimental").ExecutionContext} pctx
  * @returns {Promise<Response>}
  */
  async fetch(request, env, pctx) {
    const ctx = makeContext(pctx, request, env);
    const [_, tenant, route] = ctx.url.pathname.split('/');
    if (!tenant) {
      return errorResponse(400, 'missing tenant');
    }

    switch (route) {
      case 'content':
        return handleContentRequest(ctx);
      default:
        return errorResponse(404, 'no route found');
    }
  },
};
