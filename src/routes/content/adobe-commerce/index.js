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

import { errorResponse, errorWithResponse, ffetch } from '../../../utils/http.js';
import getProductQuery, { adapter as productAdapter } from './queries/cs-product.js';
import getVariantsQuery, { adapter as variantsAdapter } from './queries/cs-variants.js';
import getProductSKUQueryCore from './queries/core-product-sku.js';
import getProductSKUQueryCS from './queries/cs-product-sku.js';
import htmlTemplateFromContext from './templates/html/index.js';

/**
 * @param {string} sku
 * @param {Config} config
 */
async function fetchProduct(sku, config) {
  const { catalogEndpoint = 'https://catalog-service.adobe.io/graphql' } = config;
  const query = getProductQuery({
    sku,
    imageRoles: config.imageRoles,
    linkTypes: config.linkTypes,
  });
  console.debug(query);

  const resp = await ffetch(`${catalogEndpoint}?query=${encodeURIComponent(query)}&view=${config.storeViewCode}`, {
    headers: {
      origin: config.origin ?? 'https://api.adobecommerce.live',
      'x-api-key': config.apiKey,
      'Magento-Environment-Id': config.magentoEnvironmentId,
      'Magento-Website-Code': config.magentoWebsiteCode,
      'Magento-Store-View-Code': config.storeViewCode,
      'Magento-Store-Code': config.storeCode,
      ...config.headers,
    },
    cf: {
      cacheTtl: 0,
      // TODO: use cache tags (including store view) and short but non-zero TTL
    },
  });
  if (!resp.ok) {
    console.warn('failed to fetch product: ', resp.status, resp.statusText);
    try {
      console.info('body: ', await resp.text());
    } catch { /* noop */ }
    throw errorWithResponse(resp.status, 'failed to fetch product');
  }

  try {
    const json = await resp.json();
    const [productData] = json?.data?.products ?? [];
    if (!productData) {
      throw errorWithResponse(404, 'could not find product', json.errors);
    }
    const product = productAdapter(config, productData);
    return product;
  } catch (e) {
    if (e.response) {
      throw errorWithResponse(e.response.status, e.message);
    }
    throw errorWithResponse(500, 'failed to parse product response');
  }
}

/**
 * @param {string} sku
 * @param {Config} config
 */
async function fetchVariants(sku, config) {
  const { catalogEndpoint = 'https://catalog-service.adobe.io/graphql' } = config;
  const query = getVariantsQuery({ sku, imageRoles: config.imageRoles });
  console.debug(query);

  const resp = await ffetch(`${catalogEndpoint}?query=${encodeURIComponent(query)}&view=${config.storeViewCode}`, {
    headers: {
      origin: config.origin ?? 'https://api.adobecommerce.live',
      'x-api-key': config.apiKey,
      'Magento-Environment-Id': config.magentoEnvironmentId,
      'Magento-Website-Code': config.magentoWebsiteCode,
      'Magento-Store-View-Code': config.storeViewCode,
      'Magento-Store-Code': config.storeCode,
      ...config.headers,
    },
    cf: {
      cacheTtl: 0,
    },
  });
  if (!resp.ok) {
    console.warn('failed to fetch variants: ', resp.status, resp.statusText);
    try {
      console.info('body: ', await resp.text());
    } catch { /* noop */ }
    throw errorWithResponse(resp.status, 'failed to fetch variants');
  }

  try {
    const json = await resp.json();
    const { variants } = json?.data?.variants ?? {};
    return variantsAdapter(config, variants);
  } catch (e) {
    if (e.response) {
      throw errorWithResponse(e.response.status, e.message);
    }
    throw errorWithResponse(500, 'failed to parse variants response');
  }
}

/**
 * @param {string} urlkey
 * @param {Config} config
 */
async function lookupProductSKUCS(urlkey, config) {
  const { catalogEndpoint = 'https://catalog-service.adobe.io/graphql' } = config;
  const query = getProductSKUQueryCS({ urlkey });
  console.debug(query);

  const resp = await ffetch(`${catalogEndpoint}?query=${encodeURIComponent(query)}`, {
    headers: {
      origin: config.origin ?? 'https://api.adobecommerce.live',
      'x-api-key': config.apiKey,
      'Magento-Environment-Id': config.magentoEnvironmentId,
      'Magento-Website-Code': config.magentoWebsiteCode,
      'Magento-Store-View-Code': config.storeViewCode,
      'Magento-Store-Code': config.storeCode,
      ...config.headers,
    },
    // don't disable cache, since it's unlikely to change
  });
  if (!resp.ok) {
    console.warn('failed to fetch product sku (cs): ', resp.status, resp.statusText);
    try {
      console.info('body: ', await resp.text());
    } catch { /* noop */ }
    throw errorWithResponse(resp.status, 'failed to fetch product sku (cs)');
  }

  try {
    const json = await resp.json();
    const [product] = json?.data?.productSearch.items ?? [];
    if (!product?.product?.sku) {
      throw errorWithResponse(404, 'could not find product sku (cs)', json.errors);
    }
    return product.product.sku;
  } catch (e) {
    console.error('failed to parse product sku (cs): ', e);
    if (e.response) {
      throw errorWithResponse(e.response.status, e.message);
    }
    throw errorWithResponse(500, 'failed to parse product sku response (cs)');
  }
}

/**
 * @param {string} urlkey
 * @param {Config} config
 */
async function lookupProductSKUCore(urlkey, config) {
  const query = getProductSKUQueryCore({ urlkey });
  if (!config.coreEndpoint) {
    throw errorWithResponse(400, 'missing coreEndpoint');
  }
  console.debug(query);

  const resp = await ffetch(`${config.coreEndpoint}?query=${encodeURIComponent(query)}`, {
    headers: {
      origin: config.origin ?? 'https://api.adobecommerce.live',
      Store: config.storeViewCode,
      ...config.headers,
    },
    // don't disable cache, since it's unlikely to change
  });
  if (!resp.ok) {
    console.warn('failed to fetch product sku (core): ', resp.status, resp.statusText);
    try {
      console.info('body: ', await resp.text());
    } catch { /* noop */ }
    throw errorWithResponse(resp.status, 'failed to fetch product sku (core)');
  }

  try {
    const json = await resp.json();
    const [product] = json?.data?.products?.items ?? [];
    if (!product?.sku) {
      throw errorWithResponse(404, 'could not find product sku (core)', json.errors);
    }
    return product.sku;
  } catch (e) {
    console.error('failed to parse product sku (core): ', e);
    if (e.response) {
      throw errorWithResponse(e.response.status, e.message);
    }
    throw errorWithResponse(500, 'failed to parse product sku response (core)');
  }
}

/**
 * @param {string} urlkey
 * @param {Config} config
 */
function lookupProductSKU(urlkey, config) {
  if (config.liveSearchEnabled) {
    return lookupProductSKUCS(urlkey, config);
  }
  return lookupProductSKUCore(urlkey, config);
}

/**
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
export default async function handler(ctx) {
  const { config } = ctx;
  const { urlkey } = config.params;
  let { sku } = config.params;

  const cslParams = new URLSearchParams(ctx.info.headers['x-content-source-location'] ?? '');
  if (cslParams.has('sku')) {
    // prefer sku from content-source-location
    sku = cslParams.get('sku');
  } else if (urlkey && config.coreEndpoint) {
    // lookup sku by urlkey with core
    sku = await lookupProductSKU(urlkey, config);
  }

  if (!sku && !config.coreEndpoint) {
    return errorResponse(404, 'missing sku and coreEndpoint');
  }
  if (!sku) {
    return errorResponse(404, 'could not find sku');
  }

  // const product = await fetchProductCore({ sku }, config);
  const [product, variants] = await Promise.all([
    fetchProduct(sku, config),
    fetchVariants(sku, config),
  ]);
  const html = htmlTemplateFromContext(ctx, product, variants).render();
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html',
    },
  });
}
