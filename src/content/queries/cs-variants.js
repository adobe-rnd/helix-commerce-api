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

import { errorWithResponse, forceImagesHTTPS } from '../../utils/http.js';
import { gql, parseRating, parseSpecialToDate } from '../../utils/product.js';

/**
 * @param {Config} config
 * @param {any} variants
 * @returns {Variant[]}
 */
export const adapter = (config, variants) => variants.map(({ selections, product }) => {
  const minPrice = product.priceRange?.minimum ?? product.price;
  const maxPrice = product.priceRange?.maximum ?? product.price;

  /** @type {Variant} */
  const variant = {
    name: product.name,
    sku: product.sku,
    description: product.description,
    url: product.url,
    inStock: product.inStock,
    images: forceImagesHTTPS(product.images) ?? [],
    attributes: product.attributes ?? [],
    attributeMap: Object.fromEntries((product.attributes ?? [])
      .map(({ name, value }) => [name, value])),
    externalId: product.externalId,
    prices: {
      regular: {
        // TODO: determine whether to use min or max
        amount: minPrice?.regular.amount.value,
        currency: minPrice?.regular.amount.currency,
        maximumAmount: maxPrice?.regular.amount.value,
        minimumAmount: minPrice?.regular.amount.value,
      },
      final: {
        // TODO: determine whether to use min or max
        amount: minPrice?.final.amount.value,
        currency: minPrice?.final.amount.currency,
        maximumAmount: maxPrice?.final.amount.value,
        minimumAmount: minPrice?.final.amount.value,
      },
    },
    selections: (selections ?? []).sort(),
  };

  if (!minPrice && !maxPrice) {
    throw errorWithResponse(400, 'no variant price range found');
  }

  if (config.attributeOverrides?.variant) {
    Object.entries(config.attributeOverrides.variant).forEach(([key, value]) => {
      variant.attributeMap[key] = variant.attributeMap[value] ?? variant[key];
    });
  }

  const specialToDate = parseSpecialToDate(variant);
  if (specialToDate) {
    variant.specialToDate = specialToDate;
  }

  const rating = parseRating(variant);
  if (rating) {
    variant.rating = rating;
  }

  return variant;
});

/**
 * @param {{
 *  sku: string;
 *  imageRoles?: string[];
 * }} opts
 */
export default ({ sku, imageRoles = [] }) => gql`
{
  variants(sku: "${sku}") {
    variants {
      selections
      product {
        name
        sku
        inStock
        externalId
        images(roles: [${imageRoles.map((s) => `"${s}"`).join(',')}]) {
          url
          label
        }
        ... on SimpleProductView {
          description
          attributes(roles: ["visible_in_pdp"]) {
            name
            label
            value
          }
          price {
            regular {
              amount {
                value
                currency
              }
            }
            final {
              amount {
                value
                currency
              }
            }
          }
        }
        ... on ComplexProductView {
           priceRange {
            maximum {
              final {
                amount {
                  value
                  currency
                }
              }
              regular {
                amount {
                  value
                  currency
                }
              }
            }
            minimum {
              final {
                amount {
                  value
                  currency
                }
              }
              regular {
                amount {
                  value
                  currency
                }
              }
            }
          }
        }
      }
    }
  }
}`;
