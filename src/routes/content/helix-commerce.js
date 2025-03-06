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

import StorageClient from '../catalog/StorageClient.js';
import { errorResponse } from '../../utils/http.js';
import { pruneUndefined } from '../../utils/product.js';

/**
 * @param {string} str
 * @param {number} spaces
 * @returns {string}
 */
const indent = (str, spaces) => str.split('\n').map((line) => `${' '.repeat(spaces)}${line}`).join('\n');

/**
 * @param {ProductBusVariant} variant
 */
const offerTemplate = (variant) => pruneUndefined({
  '@type': 'Offer',
  sku: variant.sku,
  name: variant.name,
  url: variant.url,
  image: variant.images?.find((image) => image.roles?.includes('default'))?.url ?? variant.images?.[0]?.url,
  availability: variant.availability,
  price: variant.price?.final,
  priceCurrency: variant.price?.currency,
  itemCondition: variant.itemCondition,
});

/**
 * @param {ProductBusEntry} product
 * @returns {string}
 */
const jsonldTemplate = (product) => JSON.stringify({
  '@context': 'http://schema.org',
  '@type': 'Product',
  '@id': product.url,
  url: product.url,
  name: product.name,
  sku: product.sku,
  description: product.metaDescription,
  image: product.images?.find((image) => image.roles?.includes('default'))?.url ?? product.images?.[0]?.url,
  productID: product.sku,
  itemCondition: product.itemCondition,
  ...(product.brand ? {
    brand: {
      '@type': 'Brand',
      name: product.brand,
    },
  } : {}),
  ...(product.aggregateRating ? {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: product.aggregateRating.ratingValue,
      reviewCount: product.aggregateRating.reviewCount,
      bestRating: product.aggregateRating.bestRating,
      worstRating: product.aggregateRating.worstRating,
    },
  } : {}),
  ...(product.variants ? {
    offers: product.variants.map(offerTemplate),
  } : {}),
}, null, 2);

/**
 * @param {string} name
 * @param {string|string[]|number|boolean} [value]
 * @returns {string}
 */
const metaName = (name, value) => (value !== undefined ? `\
<meta name="${name}" content="${Array.isArray(value) ? value.join(',') : value}">
` : '');

/**
 *
 * @param {string} property
 * @param {string|string[]|number|boolean} [value]
 * @returns {string}
 */
const metaProperty = (property, value) => (value !== undefined ? `\
<meta property="${property}" content="${Array.isArray(value) ? value.join(',') : value}">
` : '');

/**
 * @param {ProductBusImage} image
 * @returns {string}
 */
const pictureTemplate = (image) => /* html */`\
<picture>
  <source type="image/webp" srcset="${image.url}" alt="" media="(min-width: 600px)">
  <source type="image/webp" srcset="${image.url}">
  <source type="image/png" srcset="${image.url}" media="(min-width: 600px)">
  <img loading="lazy" alt="${image.label}" src="${image.url}">
</picture>`;

/**
 * @param {ProductBusEntry} product
 * @returns {string}
 */
const htmlTemplate = (product) => /* html */`\
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>${product.metaTitle}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${metaName('description', product.metaDescription)}\
    ${metaName('sku', product.sku)}\
    ${metaName('image', product.images?.[0]?.url)}\
    ${metaProperty('og:image', product.images?.[0]?.url)}\
    ${metaProperty('og:title', product.metaTitle)}\
    ${metaProperty('og:description', product.metaDescription)}\
    ${metaProperty('og:type', 'product')}\
    ${metaProperty('product:availability', product.availability)}\
    ${metaProperty('product:price', product.price?.final)}\
    ${metaProperty('product:price.regular', product.price?.regular)}\
    ${metaProperty('product:price.currency', product.price?.currency)}\
    ${metaProperty('product:condition', product.itemCondition)}\
    <script type="application/ld+json">
${product.jsonld ? product.jsonld : jsonldTemplate(product)}
    </script>
  </head>
  <body>
    <header></header>
    <main>
      <div>
        <h1>${product.title}</h1>
        <p>${product.description}</p>
        <p>
${indent(product.images?.map(pictureTemplate).join('\n'), 10)}
        </p>
      </div>
    </main>
    <footer></footer>
  </body>
</html>`;

/**
 * @param {Context} ctx
 * @returns {Promise<Response>}
 */
export default async function handler(ctx) {
  const { config: { params } } = ctx;
  const { urlkey } = params;
  let { sku } = params;
  if (!sku && !urlkey) {
    return errorResponse(404, 'missing sku or urlkey');
  }

  const storage = StorageClient.fromContext(ctx);
  if (!sku) {
    sku = await storage.lookupSku(urlkey);
    if (!sku) {
      return errorResponse(404, 'could not find sku');
    }
  }

  const product = await storage.fetchProduct(sku);
  try {
    const html = htmlTemplate(product);
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html',
      },
    });
  } catch (e) {
    ctx.log.error('failed to render product', e);
    return errorResponse(500, 'failed to render product', e);
  }
}
