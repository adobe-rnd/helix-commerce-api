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

import { gql } from '../util.js';

export default ({ sku }) => gql`{
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
