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

/**
* @type {Record<string, Config>}
*/
const TENANT_CONFIGS = {
  visualcomfort: {
    apiKey: '59878b5d8af24fe9a354f523f5a0bb62',
    magentoEnvironmentId: '97034e45-43a5-48ab-91ab-c9b5a98623a8',
    magentoWebsiteCode: 'base',
    magentoStoreViewCode: 'default',
  },
};

/**
* @param {TemplateStringsArray} strs
* @param  {...any} params
* @returns {string}
*/
export function gql(strs, ...params) {
  let res = '';
  strs.forEach((s, i) => {
    res += s;
    if (i < params.length) {
      res += params[i];
    }
  });
  return res.replace(/(\\r\\n|\\n|\\r)/gm, ' ').replace(/\s+/g, ' ').trim();
}

/**
* @param {number} status
* @param {string} xError
* @param {string|Record<string,unknown>} [body='']
* @returns
*/
function errorResponse(status, xError, body = '') {
  return new Response(typeof body === 'object' ? JSON.stringify(body) : body, {
    status,
    headers: { 'x-error': xError },
  });
}

/**
* @param {import("@cloudflare/workers-types/experimental").ExecutionContext} pctx
* @param {Request} req
* @param {Record<string, string>} env
* @returns {Context}
*/
function makeContext(pctx, req, env) {
  /** @type {Context} */
  // @ts-ignore
  const ctx = pctx;
  ctx.env = env;
  ctx.url = new URL(req.url);
  ctx.log = console;
  return ctx;
}

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
async function fetchProduct(sku, config) {
  const query = gql`{
   products(
     skus: ["${sku}"]
   ) {
     __typename
     id
     sku
     name
     metaTitle
     metaDescription
     metaKeyword
     description
     url
     urlKey
     shortDescription
     url
     addToCartAllowed
     inStock
     images(roles: []) { 
       url
       label
       roles
       __typename
     }
     attributes(roles: []) {
       name
       label
       value
       roles
       __typename
     }
     ... on SimpleProductView {
       price {
         final {
           amount {
             value
             currency
             __typename
           }
           __typename
         }
         regular {
           amount {
             value
             currency
             __typename
           }
           __typename
         }
         roles
         __typename
       }
       __typename
     }
     ... on ComplexProductView {
       options {
         id
         title
         required
         values {
           id
           title
           ... on ProductViewOptionValueProduct {
             product {
               sku
               name
               __typename
             }
             __typename
           }
           ... on ProductViewOptionValueSwatch {
             type
             value
             __typename
           }
           __typename
         }
         __typename
       }
       priceRange {
         maximum {
           final {
             amount {
               value
               currency
               __typename
             }
             __typename
           }
           regular {
             amount {
               value
               currency
               __typename
             }
             __typename
           }
           roles
           __typename
         }
         minimum {
           final {
             amount {
               value
               currency
               __typename
             }
             __typename
           }
           regular {
             amount {
               value
               currency
               __typename
             }
             __typename
           }
           roles
           __typename
         }
         __typename
       }
       __typename
     }
   }
 }`;

  const resp = await fetch(`https://catalog-service.adobe.io/graphql?query=${encodeURIComponent(query)}`, {
    // method: 'POST',
    // body: query,
    headers: {
      origin: 'https://adobecommerce.live',
      // 'content-type':'application/json',
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
  return /* html */`
<!DOCTYPE html>
 <html>
   <head>
     <title>${product.metaTitle || product.name}</title>
     <script type="importmap">
       {
           "imports": {
               "@dropins/tools/": "/scripts/__dropins__/tools/",
               "@dropins/storefront-pdp/": "/scripts/__dropins__/storefront-pdp/"
           }
       }
     </script>
     <meta property="description" content="${product.metaDescription || product.description}">
     <meta property="og:title" content="${product.metaTitle || product.name}">
     <meta property="og:image" content="${product.images[0].url}">
     <meta property="og:image:secure_url" content="${product.images[0].url}">
     <meta name="twitter:card" content="summary_large_image">
     <meta name="twitter:title" content="${product.metaTitle || product.name}">
     <meta name="twitter:image" content="${product.images[0].url}">
     <meta name="viewport" content="width=device-width, initial-scale=1">
     <script src="/scripts/lib-franklin.js" type="module"></script>
     <script src="/scripts/scripts.js" type="module"></script>
     <link rel="stylesheet" href="/styles/styles.css">
   </head>
   <body>
     <header></header>
     <main>
       <div>
         <h1>${product.name}</h1>
         <div class="product-gallery">
           <div>
               ${product.images.map((img) => `<div>
                   <picture>
                     <source type="image/webp" srcset="${img.url}" media="(min-width: 600px)">
                     <source type="image/webp" srcset="${img.url}">
                     <source type="image/png" srcset="${img.url}" media="(min-width: 600px)">
                     <img loading="lazy" alt="" src="${img.url}">
                   </picture>
                 </div>`).join('\n')}
           </div>
         </div>
         <div class="product-price">
           <div>
             <div>Retail</div>
             <div>1337.00</div>
           </div>
           <div>
             <div>Sale</div>
             <div>1337.00</div>
           </div>
         </div>
         <div class="product-attributes">
           ${product.attributes.map((attr) => `<div>
               <div>${attr.name}</div>
               <div>${attr.label}</div>
               <div>${attr.value}</div>
             </div>`).join('\n')}
         </div>
         <div class="product-options">
           ${product.options.map((opt) => `<div>
               <div>${opt.id}</div>
               <div>${opt.title}</div>
             </div>
             ${opt.values.map((val) => `<div>
                 <div>${val.id}</div>
                 <div>${val.title}</div>
               </div>`).join('\n')}`).join('\n')}
         </div>
       </div>
     </main>
     <footer></footer>
   </body>
 </html>
 `;
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

  const config = lookupConfig(tenant, {}); // TODO: allow config overrides from query params
  if (!config) {
    return errorResponse(404, 'config not found');
  }

  const product = await fetchProduct(sku, config);
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
    // TEMP: allow passthrough to live for helix stuff
    if (ctx.url.pathname.startsWith('/scripts/') || ctx.url.pathname.startsWith('/styles/') || ctx.url.pathname.startsWith('/utils/')) {
      return fetch(`https://main--helix-website--adobe.hlx.live${ctx.url.pathname}`);
    }

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
