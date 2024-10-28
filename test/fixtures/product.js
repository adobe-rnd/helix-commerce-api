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

/**
 * Generates a configurable product fixture.
 * @param {Object} overrides - An object containing properties to override.
 * @returns {Object} - The product fixture.
 */
export function createProductFixture(overrides = {}) {
  const product = {
    sku: 'test-sku',
    name: 'Test Product Name',
    metaTitle: 'Test Product - test-sku | Test Brand',
    metaDescription: 'Experience the excellence of our Test Product, engineered to meet all your everyday needs with unmatched reliability and performance. Discover quality and innovation that sets you apart, available now at unbeatable prices.',
    metaKeyword: 'Keyword 1, Keyword 2, Keyword 3',
    description: 'Introducing our Test Product, designed to deliver exceptional performance and reliability for all your daily tasks. Crafted with premium materials, it ensures durability and a sleek, modern aesthetic that complements any environment. Whether you’re using it at home or in the office, its user-friendly features make it effortless to operate and maintain. Experience unparalleled functionality combined with innovative technology that sets our Test Product apart from the competition. Upgrade your lifestyle today with a product that promises quality, efficiency, and outstanding value.',
    url: 'https://www.example.com/products/test-product-url-key',
    urlKey: 'test-product-url-key',
    shortDescription: '',
    addToCartAllowed: true,
    inStock: true,
    externalId: '123456',
    images: [
      {
        url: 'https://www.example.com/media/catalog/product/t/s/test-sku.png',
        label: '',
      },
    ],
    attributes: [
      {
        name: 'color_options',
        label: 'Color Options',
        value: 'Matte Black',
      },
      {
        name: 'material_type',
        label: 'Material Type',
        value: 'Brushed Aluminum',
      },
      {
        name: 'warranty_period',
        label: 'Warranty Period',
        value: '2 Years',
      },
      {
        name: 'country_of_origin',
        label: 'Country of Origin',
        value: 'USA',
      },
      {
        name: 'weight',
        label: 'Weight',
        value: '1.5 lbs',
      },
    ],
    options: [
      {
        id: 'finish_filter',
        label: 'Finish',
        typename: 'ProductViewOptionValueConfiguration',
        required: false,
        multiple: null,
        items: [
          { id: 'Y29uZmlndXJhYmxlLzI0NjEvMzU1MzE=', label: 'Label 1', inStock: true },
          { id: 'Y29uZmlndXJhYmxlLzI0NjEvMzYxMTE=', label: 'Label 2', inStock: true },
          { id: 'Y29uZmlndXJhYmxlLzI0NjEvMzYzNDE=', label: 'Label 3', inStock: true },
        ],
      },
      {
        id: 'shade_filter',
        label: 'Shade',
        typename: 'ProductViewOptionValueConfiguration',
        required: false,
        multiple: null,
        items: [
          { id: 'Y29uZmlndXJhYmxlLzE2NTEvODI3MQ==', label: 'Label 4', inStock: true },
        ],
      },
    ],
    prices: {
      regular: {
        amount: 799, currency: 'USD', maximumAmount: 799, minimumAmount: 799,
      },
      final: {
        amount: 799, currency: 'USD', maximumAmount: 799, minimumAmount: 799,
      },
      visible: true,
    },
    ...overrides,
  };

  // Deep merge defaults with overrides
  return product;
}
