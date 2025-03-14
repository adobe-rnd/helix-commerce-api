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

import {
  gql,
  parseRating,
  parseSpecialToDate,
  sortImagesByRole,
  forceImagesHTTPS,
} from '../util.js';

/**
 * @typedef {import('../types.d.ts').Product} Product
 */

function extractMinMaxPrice(data) {
  let minPrice = data.priceRange?.minimum ?? data.price;
  let maxPrice = data.priceRange?.maximum ?? data.price;

  if (minPrice == null) {
    minPrice = maxPrice;
  } else if (maxPrice == null) {
    maxPrice = minPrice;
  }
  return { minPrice, maxPrice };
}

/**
 * @param {Config} config
 * @param {any} productData
 * @returns {Product}
 */
export const adapter = (config, productData) => {
  const { minPrice, maxPrice } = extractMinMaxPrice(productData);
  const images = sortImagesByRole(
    forceImagesHTTPS(productData.images)
    ?? [],
    config.imageRoleOrder,
  );

  /** @type {Product} */
  const product = {
    sku: productData.sku,
    name: productData.name,
    lastModifiedAt: productData.lastModifiedAt,
    metaTitle: productData.metaTitle,
    metaDescription: productData.metaDescription,
    metaKeyword: productData.metaKeyword,
    description: productData.description,
    url: productData.url,
    urlKey: productData.urlKey,
    shortDescription: productData.shortDescription,
    addToCartAllowed: productData.addToCartAllowed,
    inStock: productData.inStock,
    externalId: productData.externalId,
    links: (productData.links ?? []).map((l) => {
      const { minPrice: lMinPrice, maxPrice: lMaxPrice } = extractMinMaxPrice(l.product);
      return {
        sku: l.product.sku,
        urlKey: l.product.urlKey,
        types: l.linkTypes,
        prices: {
          regular: {
            amount: lMinPrice.regular.amount.value,
            currency: lMinPrice.regular.amount.currency,
            maximumAmount: lMaxPrice.regular.amount.value,
            minimumAmount: lMinPrice.regular.amount.value,
          },
          final: {
            amount: lMinPrice.final.amount.value,
            currency: lMinPrice.final.amount.currency,
            maximumAmount: lMaxPrice.final.amount.value,
            minimumAmount: lMinPrice.final.amount.value,
          },
        },
      };
    }),
    images,
    attributes: productData.attributes ?? [],
    attributeMap: Object.fromEntries((productData.attributes ?? [])
      .map(({ name, value }) => [name, value])),
    options: (productData.options ?? []).map((option) => ({
      id: option.id,
      label: option.title,
      // eslint-disable-next-line no-underscore-dangle
      typename: option.values?.[0]?.__typename,
      required: option.required,
      multiple: option.multi,
      items: (option.values ?? []).map((value) => ({
        id: value.id,
        label: value.title,
        inStock: value.inStock,
        type: value.type,
        value: value.value,
        product: value.product
          ? {
            sku: value.product.sku,
            name: value.product.name,
            prices: value.product.price ? {
              regular: value.product.price.regular,
              final: value.product.price.final,
              visible: value.product.price.roles?.includes('visible'),
            } : undefined,
          }
          : undefined,
        quantity: value.quantity,
        isDefault: value.isDefault,
      })),
    })),
    prices: (minPrice && maxPrice) ? {
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
      visible: minPrice.roles?.includes('visible'),
    } : null,
  };

  if (config.attributeOverrides?.product) {
    Object.entries(config.attributeOverrides.product).forEach(([key, value]) => {
      product.attributeMap[key] = product.attributeMap[value] ?? product[key];
    });
  }

  const specialToDate = parseSpecialToDate(product);
  if (specialToDate) {
    product.specialToDate = specialToDate;
  }

  const rating = parseRating(product);
  if (rating) {
    product.rating = rating;
  }

  return product;
};

// @ts-ignore
/**
 * @param {{
 *  sku: string;
 *  imageRoles?: string[];
 *  linkTypes?: string[];
 * }} opts
 */
export default ({ sku, imageRoles = [], linkTypes = [] }) => gql`{
    products(
      skus: ["${sku}"]
    ) {
      id
      sku
      lastModifiedAt
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
      externalId
      images(roles: [${imageRoles.map((s) => `"${s}"`).join(',')}]) { 
        url
        label
        roles
      }
      links(linkTypes: [${linkTypes.map((s) => `"${s}"`).join(',')}]) {
        product {
          sku
          urlKey
          ... on SimpleProductView {
            price {
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
              roles
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
                roles
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
                roles
              }
            }
          }
        }
        linkTypes
      }
      attributes(roles: ["visible_in_pdp"]) {
        name
        label
        value
      }
      ... on SimpleProductView {
        price {
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
          roles
        }
      }
      ... on ComplexProductView {
        options {
          __typename
          id
          title
          required
          multi
          values {
            id
            title
            inStock
            ...on ProductViewOptionValueConfiguration {
              __typename
            }
            ... on ProductViewOptionValueSwatch {
              __typename
              type
              value
            }
            ... on ProductViewOptionValueProduct {
              __typename
              quantity
              isDefault
              product {
                sku
                name
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
                  roles
                }
              }
            }
          }
        }
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
            roles
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
            roles
          }
        }
      }
    }
  }`;
