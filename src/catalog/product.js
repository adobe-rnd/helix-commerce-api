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

/* eslint-disable no-await-in-loop */

import { errorResponse } from '../util.js';
import { callAdmin } from '../utils/admin.js';
import { loadProductFromR2, saveProductsToR2 } from '../utils/r2.js';

// import { saveProductsToR2 } from '../utils/r2.js';

// export async function getProduct(ctx, config, sku, urlKey) {
//   const { log } = ctx;
//   try {
//     const query = coreProductQuery({ sku, urlKey });
//     const response = await fetch(config.coreEndpoint, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         Accept: 'application/json',
//       },
//       body: JSON.stringify(query),
//     });

//     if (!response.ok) {
//       log.warn(`Failed to fetch product. Status: ${response.status}`);
//       return null;
//     }

//     const result = await response.json();
//     const products = result?.data?.products;

//     if (!products || products.items.length === 0) {
//       log.warn('No products found.');
//       return null;
//     }

//     return products.items[0];
//   } catch (error) {
//     log.error('Error fetching product:', error);
//     return null;
//   }
// }

// // eslint-disable-next-line no-unused-vars
// export async function handleProductPostRequest(ctx, config) {
//   return new Response('POST method not implemented', { status: 501 });
// }

// Helper function to resolve SKU from either SKU or URL key
// async function resolveSku(ctx, config) {
//   // Get the sku from the last path segment of the url
//   const sku = ctx.url.pathname.split('/').pop();
//   if (config.sku) {
//     // Directly use the provided SKU
//     return config.sku;
//   } else if (config.urlKey) {
//     // Make a HEAD request to retrieve the SKU from metadata based on the URL key
//     const urlKeyPath = `${config.org}/${config.site}/${config.env}/${config.store}
//     /${config.storeView}/urlkeys/${config.urlKey}`;
//     const headResponse = await ctx.env.CATALOG_BUCKET.head(urlKeyPath);

//     if (!headResponse || !headResponse.customMetadata?.sku) {
//       // SKU not found for the provided URL key
//       return null;
//     }
//     // Return the resolved SKU
//     return headResponse.customMetadata.sku;
//   }
//   // Neither SKU nor URL key provided
//   return null;
// }

export async function handleProductGetRequest(ctx, config) {
  // Determine SKU based on either provided SKU or URL key
  const sku = ctx.url.pathname.split('/').pop();

  let product;

  // If SKU is resolved, try to load the product from R2
  if (sku) {
    product = await loadProductFromR2(ctx, config, sku);
  }

  // If product found in R2, return it
  if (product) {
    return new Response(JSON.stringify(product), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // If neither SKU nor urlKey is provided, return a 400 error
  return new Response('Either SKU or urlKey must be provided', { status: 400 });
}

async function putProduct(ctx, config, product) {
  if (!product.sku) {
    return errorResponse(400, 'invalid request body: missing sku');
  }

  await saveProductsToR2(ctx, config, [product]);
  return product;
}

async function bulkPutProducts(ctx, config, products) {
  if (!products || !Array.isArray(products) || products.length === 0) {
    throw new Error('Invalid request body: missing products');
  }

  // Validate each product
  for (const product of products) {
    if (!product.sku) {
      throw new Error('Invalid request body: missing sku in one of the products');
    }
  }

  // Save all products to R2 in a single operation
  await saveProductsToR2(ctx, config, products);
  return products;
}

export async function handleProductPutRequest(ctx, config, request) {
  try {
    let products;

    // Parse the request body only once
    const requestBody = await request.json();
    if (config.sku === '*') {
      products = await bulkPutProducts(ctx, config, requestBody.products);
    } else {
      products = [await putProduct(ctx, config, requestBody)];
    }

    const matchedKeys = Object.keys(config.confMap).filter((key) => {
      const currentItem = config.confMap[key];
      return currentItem.env === config.env;
    });

    for (const product of products) {
      for (const key of matchedKeys) {
        let path = key.replace('{{sku}}', product.sku);

        if (key.includes('{{urlkey}}') && product.urlKey) {
          path = path.replace('{{urlkey}}', product.urlKey);
        }
        const previewResponse = await callAdmin(config, 'preview', path);
        if (!previewResponse.ok) {
          return errorResponse(400, 'failed to preview product');
        }
        // const publishResponse = await callAdmin(config, 'publish', path);
        // if (!publishResponse.ok) {
        //   return errorResponse(400, 'failed to publish product');
        // }
      }
    }
    return new Response(undefined, { status: 201 });
  } catch (e) {
    return errorResponse(400, 'invalid request body');
  }
}
