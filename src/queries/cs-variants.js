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

import { gql } from '../util.js';

/**
 * @param {any} variants
 * @returns {Variant[]}
 */
export const adapter = (variants) => variants.map(({ selections, product }) => {
  const minPrice = product.priceRange?.minimum ?? product.price;
  const maxPrice = product.priceRange?.maximum ?? product.price;

  /** @type {Variant} */
  const variant = {
    name: product.name,
    sku: product.sku,
    url: product.url,
    inStock: product.inStock,
    images: product.images ?? [],
    prices: {
      regular: {
        // TODO: determine whether to use min or max
        amount: minPrice.regular.amount.value,
        currency: minPrice.regular.amount.currency,
        maximumAmount: maxPrice.regular.amount.value,
        minimumAmount: minPrice.regular.amount.value,
      },
      final: {
        // TODO: determine whether to use min or max
        amount: minPrice.final.amount.value,
        currency: minPrice.final.amount.currency,
        maximumAmount: maxPrice.final.amount.value,
        minimumAmount: minPrice.final.amount.value,
      },
    },
    selections: selections ?? [],
  };
  return variant;
});

/**
 * @param {string} sku
 */
export default (sku) => gql`
{
  variants(sku: "${sku}") {
    variants {
      selections
      product {
        name
        sku
        inStock
        images {
          url
          label
        }
        ... on SimpleProductView {
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
