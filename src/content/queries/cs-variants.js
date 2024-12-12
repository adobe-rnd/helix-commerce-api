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

import { forceImagesHTTPS } from '../../utils/http.js';
import { gql, parseRating, parseSpecialToDate } from '../../utils/product.js';

/**
 * @param {Config} config
 * @param {any} variants
 * @returns {Variant[]}
 */
export const adapter = (config, variants) => variants.map(({ selections, product }) => {
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
    selections: (selections ?? []).sort(),
    // eslint-disable-next-line no-underscore-dangle
    type: product.__typename === 'SimpleProductView' ? 'simple' : 'complex',
  };

  if (product.price) {
    variant.price = {
      regular: product.price.regular,
      final: product.price.final,
      visible: product.price.roles?.includes('visible'),
    };
  }

  if (product.priceRange) {
    variant.priceRange = {
      minimum: {
        regular: product.priceRange.minimum.regular,
        final: product.priceRange.minimum.final,
        visible: product.priceRange.minimum.roles?.includes('visible'),
      },
      maximum: {
        regular: product.priceRange.maximum.regular,
        final: product.priceRange.maximum.final,
        visible: product.priceRange.maximum.roles?.includes('visible'),
      },
    };
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
        __typename
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
