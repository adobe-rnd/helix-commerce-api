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
 * @param {any} productData
 * @returns {Product}
 */
export const adapter = (config, productData) => {
  let minPrice = productData.priceRange?.minimum ?? productData.price;
  let maxPrice = productData.priceRange?.maximum ?? productData.price;

  if (minPrice == null) {
    minPrice = maxPrice;
  } else if (maxPrice == null) {
    maxPrice = minPrice;
  }
  /** @type {Product} */
  const product = {
    sku: productData.sku,
    name: productData.name,
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
    images: forceImagesHTTPS(productData.images) ?? [],
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
 * }} opts
 */
export default ({ sku, imageRoles = [] }) => gql`{
    products(
      skus: ["${sku}"]
    ) {
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
      externalId
      images(roles: [${imageRoles.map((s) => `"${s}"`).join(',')}]) { 
        url
        label
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
