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

import { findProductImage } from '../utils/product.js';
import JSON_LD_TEMPLATE from './json-ld.js';

/**
 * Create a meta tag with a name attribute
 * @param {string} name
 * @param {string|boolean|number|undefined|null} [content]
 * @returns {string}
 */
const metaName = (name, content) => (content ? `<meta name="${name}" content="${content}">` : '');

/**
 * Create a meta tag with a property attribute
 * @param {string} name
 * @param {string|boolean|number|undefined|null} [content]
 * @returns {string}
 */
const metaProperty = (name, content) => `<meta property="${name}" content="${content}">`;

/**
 * Create a price range string
 * @param {number|undefined} min
 * @param {number|undefined} max
 * @returns {string}
 */
const priceRange = (min, max) => (min !== max ? ` (${min} - ${max})` : '');

/**
 * Create the document meta tags
 * @param {Product} product
 * @returns {string}
 */
export const renderDocumentMetaTags = (product) => /* html */ `
  <title>${product.metaTitle || product.name}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${metaProperty('description', product.metaDescription)}
  ${metaName('keywords', product.metaKeyword)} 
`;

/**
 * Create the Open Graph meta tags
 * @param {Product} product
 * @param {Image} image
 * @returns {string}
 */
export const renderOpenGraphMetaTags = (product, image) => /* html */ `
  ${metaProperty('og:title', product.metaTitle || product.name)}
  ${metaProperty('og:image', image?.url)}
  ${metaProperty('og:image:secure_url', image?.url)}
  ${metaProperty('og:type', 'product')}
`;

/**
 * Create the Twitter meta tags
 * @param {Product} product
 * @param {Image} image
 * @returns {string}
 */
export const renderTwitterMetaTags = (product, image) => /* html */ `
  ${metaName('twitter:card', 'summary_large_image')}
  ${metaName('twitter:title', product.name)}
  ${metaName('twitter:image', image?.url)}
  ${metaName('twitter:description', product.metaDescription)}
  ${metaName('twitter:label1', 'Price')}
  ${metaName('twitter:data1', product.prices.final.amount)}
  ${metaName('twitter:label2', 'Availability')}
  ${metaName('twitter:data2', product.inStock ? 'In stock' : 'Out of stock')}
`;

/**
 * Create the Commerce meta tags
 * @param {Product} product
 * @returns {string}
 */
export const renderCommerceMetaTags = (product) => /* html */ `
  ${metaName('sku', product.sku)}
  ${metaName('urlKey', product.urlKey)}
  ${metaName('externalId', product.externalId)}
  ${metaName('addToCartAllowed', product.addToCartAllowed)}
  ${metaName('inStock', product.inStock ? 'true' : 'false')}
  ${metaProperty('product:availability', product.inStock ? 'In stock' : 'Out of stock')}
  ${metaProperty('product:price.amount', product.prices.final.amount)}
  ${metaProperty('product:price.currency', product.prices.final.currency)}
`;

/**
 * Create the Helix dependencies script tags
 * @returns {string}
 */
export const renderHelixDependencies = () => /* html */ `
  <script src="/scripts/aem.js" type="module"></script>
  <script src="/scripts/scripts.js" type="module"></script>
  <link rel="stylesheet" href="/styles/styles.css">
`;

/**
 * Create the JSON-LD script tag
 * @param {Product} product
 * @param {Variant[]} variants
 * @returns {string}
 */
export const renderJSONLD = (product, variants) => /* html */ `
  <script type="application/ld+json">
    ${JSON_LD_TEMPLATE(product, variants)}
  </script>
`;

/**
 * Create the head tags
 * @param {Product} product
 * @param {Variant[]} variants
 * @param {Object} [options]
 * @returns {string}
 */
export const renderHead = (
  product,
  variants,
  {
    documentMetaTags = renderDocumentMetaTags,
    openGraphMetaTags = renderOpenGraphMetaTags,
    twitterMetaTags = renderTwitterMetaTags,
    commerceMetaTags = renderCommerceMetaTags,
    helixDependencies = renderHelixDependencies,
    JSONLD = renderJSONLD,
  } = {},
) => {
  const image = findProductImage(product, variants);

  return /* html */ `
    <head>
      ${documentMetaTags(product)}
      ${openGraphMetaTags(product, image)}
      ${twitterMetaTags(product, image)}
      ${commerceMetaTags(product)}
      ${helixDependencies()}
      ${JSONLD(product, variants)}
    </head>
  `;
};

/**
 * Create the product images
 * @param {Image[]} images
 * @returns {string}
 */
const renderProductImages = (images) => /* html */ `
  <div class="product-images">
    <div>
      ${images.map((img) => /* html */ `
        <div>
          <picture>
            <source type="image/webp" srcset="${img.url}" alt="" media="(min-width: 600px)">
            <source type="image/webp" srcset="${img.url}">
            <source type="image/png" srcset="${img.url}" media="(min-width: 600px)">
            <img loading="lazy" alt="${img.label}" src="${img.url}">
          </picture>
        </div>
      `).join('\n')}
    </div>
  </div>
`;

/**
 * Create the product attributes
 * @param {Attribute[]} attributes
 * @returns {string}
 */
const renderProductAttributes = (attributes) => /* html */ `
<div class="product-attributes">
  ${attributes.map((attr) => `
    <div>
      <div>${attr.name}</div>
      <div>${attr.label}</div>
      <div>${attr.value}</div>
    </div>
  `).join('\n')}
</div>`;

/**
 * Create the product items
 * @param {OptionValue[]} items
 * @returns {string}
 */
const renderProductItems = (items) => items.map((item) => /* html */ `
  <div>
    <div>option</div>
    <div>${item.id}</div>
    <div>${item.label}</div>
    <div>${item.value ?? ''}</div>
    <div>${item.selected ? 'selected' : ''}</div>
    <div>${item.inStock ? 'inStock' : ''}</div>
  </div>
`).join('\n');

/**
 * Create the product options
 * @param {ProductOption[]} options
 * @returns {string}
 */
const renderProductOptions = (options) => /* html */ `
  <div class="product-options">
    ${options.map((opt) => /* html */ `
      <div>
        <div>${opt.id}</div>
        <div>${opt.label}</div>
        <div>${opt.typename}</div>
        <div>${opt.type ?? ''}</div>
        <div>${opt.multiple ? 'multiple' : ''}</div>
        <div>${opt.required === true ? 'required' : ''}</div>
      </div>
      ${renderProductItems(opt.items)}
    `).join('\n')}
  </div>
`;

/**
 * Create the variant images
 * @param {Image[]} images
 * @returns {string}
 */
const renderVariantImages = (images) => images.map((img) => /* html */ `
  <picture>
    <source type="image/webp" srcset="${img.url}" alt="" media="(min-width: 600px)">
    <source type="image/webp" srcset="${img.url}">
    <source type="image/png" srcset="${img.url}" media="(min-width: 600px)">
    <img loading="lazy" alt="${img.label}" src="${img.url}">
  </picture>
`).join('\n');

/**
 * Create the variant prices
 * @param {Pick<Prices, 'regular' | 'final'>} prices
 * @returns {string}
 */
const renderVariantPrices = (prices) => /* html */ `
  <div>Regular: ${prices.regular.amount} ${prices.regular.currency}${priceRange(prices.regular.minimumAmount, prices.regular.maximumAmount)}</div>
  <div>Final: ${prices.final.amount} ${prices.final.currency}${priceRange(prices.final.minimumAmount, prices.final.maximumAmount)}</div>
`;

/**
 * Create the product variants
 * @param {Variant[]} variants
 * @returns {string}
 */
const renderProductVariants = (variants) => /* html */ `
  <div class="product-variants">
    ${variants.map((v) => /* html */ `
      <div>
        <div>${v.sku}</div>
        <div>${v.name}</div>
        <div>${v.description}</div>
        <div>${v.inStock ? 'inStock' : ''}</div>
        ${renderVariantPrices(v.prices)}
        <div>${renderVariantImages(v.images)}</div>
        <div>${v.selections.join(', ')}</div>
      </div>
    `).join('\n')}
  </div>
`;

/**
 * Create the variant attributes
 * @param {Variant[]} variants
 * @returns {string}
 */
const renderProductVariantsAttributes = (variants) => /* html */ `
  <div class="variant-attributes">
  ${variants?.map((v) => `
    <div>
      <div>sku</div>
      <div>${v.sku}</div>
      <div></div>
      <div></div>
    </div>
    ${v.attributes?.map((attribute) => `
      <div>
        <div>attribute</div>
        <div>${attribute.name}</div>
        <div>${attribute.label}</div>
        <div>${attribute.value}</div>
      </div>
    `).join('\n')}
  `).join('\n')}
  </div>
`;

/**
 * Create the HTML document
 * @param {Product} product
 * @param {Variant[]} variants
 * @returns {string}
 */
export default (product, variants) => {
  const {
    name,
    description,
    attributes,
    options,
    images,
  } = product;

  return /* html */`
    <!DOCTYPE html>
    <html>
      ${renderHead(product, variants)}
      <body>
        <header></header>
        <main>
          <div>
            <h1>${name}</h1>
            ${description ? `<p>${description}</p>` : ''}
            ${renderProductImages(images)}
            ${renderProductAttributes(attributes)}
            ${renderProductOptions(options)}
            ${renderProductVariants(variants)}
            ${renderProductVariantsAttributes(variants)}
          </div>
        </main>
        <footer></footer>
      </body>
    </html>`;
};
