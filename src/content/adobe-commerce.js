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

import { errorResponse, errorWithResponse, ffetch } from '../utils/http.js';
import getProductQuery, { adapter as productAdapter } from './queries/cs-product.js';
import getVariantsQuery, { adapter as variantsAdapter } from './queries/cs-variants.js';
import getProductSKUQuery from './queries/core-product-sku.js';
import HTML_TEMPLATE from '../templates/html.js';

/**
 * @param {string} sku
 * @param {Config} config
 */
async function fetchProduct(sku, config) {
  const { catalogEndpoint = 'https://catalog-service.adobe.io/graphql' } = config;
  const query = getProductQuery({ sku });
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

  const json = await resp.json();
  try {
    const [productData] = json.data?.products ?? [];
    if (!productData) {
      throw errorWithResponse(404, 'could not find product', json.errors);
    }
    const product = productAdapter(productData);
    return product;
  } catch (e) {
    console.error('failed to parse product: ', e);
    throw errorWithResponse(500, 'failed to parse product response');
  }
}

/**
 * @param {string} sku
 * @param {Config} config
 */
async function fetchVariants(sku, config) {
  const { catalogEndpoint = 'https://catalog-service.adobe.io/graphql' } = config;
  const query = getVariantsQuery(sku);
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

  const json = await resp.json();
  try {
    const { variants } = json.data.variants;
    return variantsAdapter(variants);
  } catch (e) {
    console.error('failed to parse variants: ', e);
    throw errorWithResponse(500, 'failed to parse variants response');
  }
}

/**
 * @param {string} urlkey
 * @param {Config} config
 */
async function lookupProductSKU(urlkey, config) {
  const query = getProductSKUQuery({ urlkey });
  if (!config.coreEndpoint) {
    throw errorResponse(400, 'missing coreEndpoint');
  }
  console.debug(query);

  const resp = await ffetch(`${config.coreEndpoint}?query=${encodeURIComponent(query)}`, {
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
    console.warn('failed to fetch product sku: ', resp.status, resp.statusText);
    try {
      console.info('body: ', await resp.text());
    } catch { /* noop */ }
    throw errorWithResponse(resp.status, 'failed to fetch product sku');
  }

  const json = await resp.json();
  try {
    const [product] = json.data?.products?.items ?? [];
    if (!product) {
      throw errorWithResponse(404, 'could not find product sku', json.errors);
    }
    return product.sku;
  } catch (e) {
    console.error('failed to parse product sku: ', e);
    throw errorWithResponse(500, 'failed to parse product sku response');
  }
}

/**
 * @param {Context} ctx
 * @param {Config} config
 * @returns {Promise<Response>}
 */
export async function handle(ctx, config) {
  const { urlkey } = config.params;
  let { sku } = config.params;

  if (!sku && !urlkey) {
    return errorResponse(404, 'missing sku or urlkey');
  } else if (!sku && !config.coreEndpoint) {
    return errorResponse(400, 'missing sku and coreEndpoint');
  }

  if (!sku) {
    // lookup sku by urlkey with core
    // TODO: test if livesearch if enabled
    sku = await lookupProductSKU(urlkey, config);
  }

  // const product = await fetchProductCore({ sku }, config);
  const [product, variants] = await Promise.all([
    fetchProduct(sku.toUpperCase(), config),
    fetchVariants(sku.toUpperCase(), config),
  ]);
  const html = HTML_TEMPLATE(product, variants);
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html',
    },
  });
}
