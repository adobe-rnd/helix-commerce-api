/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

// sku: string;
// urlKey: string;
// title: string;
// metaTitle?: string;
// description: string;
// metaDescription?: string;
// url?: string;
// inStock?: boolean;
// images: HelixProductImage[];
// prices?: HelixProductPrice[];
// attributes?: HelixProductAttribute[];
// options?: HelixProductOption[];
// variants?: HelixProductVariant[];
// rating?: HelixProductRating;
// links?: HelixProductLink[];

/** @type {import("../utils/validation.js").AnySchema} */
const Product = {
  type: 'object',
  properties: {
    sku: { type: 'string' },
    urlKey: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    title: { type: 'string' },
    metaTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    url: { type: 'string' },
    brand: { type: 'string' },
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          label: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    prices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          currency: { type: 'string' },
          regular: { type: 'string' },
          final: { type: 'string' },
          visible: { type: 'boolean' },
        },
        required: ['currency', 'final'],
      },
    },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'string' },
          priceCurrency: { type: 'string' },
          url: { type: 'string' },
          image: { type: 'string' },
          availability: {
            type: 'string',
            enum: [
              'BackOrder',
              'Discontinued',
              'InStock',
              'InStoreOnly',
              'LimitedAvailability',
              'MadeToOrder',
              'OnlineOnly',
              'OutOfStock',
              'PreOrder',
              'PreSale',
              'Reserved',
              'SoldOut',
            ],
          },
        },
        additionalProperties: true,
      },
    },
  },
  required: ['sku', 'urlKey', 'name'],
  additionalProperties: true,
};

/** @type {import("../utils/validation.js").AnySchema} */
const ProductBusEntry = {
  type: 'object',
  properties: {
    product: Product,
    jsonld: { type: 'string' },
    public: {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
  },
};

export default ProductBusEntry;
