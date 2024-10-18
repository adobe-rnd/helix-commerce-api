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

import { gql } from '../../utils/product.js';

/**
 * @param {any} productData
 * @returns {Product}
 */
export const adapter = (productData) => {
  const minPrice = productData.priceRange?.minimum ?? productData.price;
  const maxPrice = productData.priceRange?.maximum ?? productData.price;

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
    images: productData.images ?? [],
    attributes: productData.attributes ?? [],
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
    prices: {
      regular: {
        // TODO: determine whether to use min or max
        amount: minPrice.regular.amount.value,
        currency: minPrice.regular.amount.currency,
        maximumAmount: maxPrice.regular.amount.value,
        minimumAmount: minPrice.regular.amount.value,
        // TODO: add variant?
      },
      final: {
        // TODO: determine whether to use min or max
        amount: minPrice.final.amount.value,
        currency: minPrice.final.amount.currency,
        maximumAmount: maxPrice.final.amount.value,
        minimumAmount: minPrice.final.amount.value,
        // TODO: add variant?
      },
      visible: minPrice.roles?.includes('visible'),
    },
  };

  return product;
};

// @ts-ignore
export default ({ sku }) => gql`{
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
      images(roles: []) { 
        url
        label
      }
      attributes(roles: []) {
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
