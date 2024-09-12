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

import JSON_LD_TEMPLATE from './json-ld.js';

export default (product) => {
  const {
    sku,
    name,
    metaTitle,
    metaDescription,
    description,
    images,
    attributes,
    options,
  } = product;

  const jsonLd = JSON_LD_TEMPLATE({
    sku,
    description: description ?? metaDescription,
    image: images[0].url,
    name,
    // TODO: add following...
    url: '',
    brandName: '',
    reviewCount: 0,
    ratingValue: 0,
  });

  return /* html */`\
<!DOCTYPE html>
  <html>
    <head>
      <title>${metaTitle || name}</title>
      <meta property="description" content="${metaDescription || description}">
      <meta property="og:title" content="${metaTitle || name}">
      <meta property="og:image" content="${images[0].url}">
      <meta property="og:image:secure_url" content="${images[0].url}">
      <meta property="og:type" content="og:product">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${metaTitle || name}">
      <meta name="twitter:image" content="${images[0].url}">
      <meta name="sku" content="${sku}">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script src="/scripts/aem.js" type="module"></script>
      <script src="/scripts/scripts.js" type="module"></script>
      <link rel="stylesheet" href="/styles/styles.css">
      <script type="application/ld+json">
        ${jsonLd}
      </script>
    </head>
    <body>
      <header></header>
      <main>
        <div>
          <h1>${name}</h1>
          <div class="product-gallery">
            <div>
              ${images.map((img) => `
              <div>
                <picture>
                  <source type="image/webp" srcset="${img.url}" alt="" media="(min-width: 600px)">
                  <source type="image/webp" srcset="${img.url}">
                  <source type="image/png" srcset="${img.url}" media="(min-width: 600px)">
                  <img loading="lazy" alt="${img.label}" src="${img.url}">
                </picture>
              </div>`).join('\n')}
            </div>
          </div>
          <div class="product-attributes">
          ${attributes.map((attr) => `
          <div>
            <div>${attr.name}</div>
            <div>${attr.label}</div>
            <div>${attr.value}</div>
          </div>`).join('\n')}
          </div>
          <div class="product-options">
          ${options.map((opt) => `
          <div>
            <div>${opt.id}</div>
            <div>${opt.title}</div>
            <div>${opt.required === true ? 'required' : ''}</div>
          </div>
          ${opt.values.map((val) => `
          <div>
            <div>${val.id}</div>
            <div>${val.title}</div>
          </div>`).join('\n')}`).join('\n')}
          </div>
        </div>
      </main>
      <footer></footer>
    </body>
  </html>`;
};
