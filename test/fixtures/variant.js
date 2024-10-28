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
 * Generates a product variation fixture.
 * @param {Object} overrides - An object containing properties to override.
 * @returns {Object} - The product variation fixture.
 */
export function createProductVariationFixture(overrides = {}) {
  const variation = {
    name: 'Test Product Name',
    sku: 'test-sku-1',
    description: 'Test Product Description',
    inStock: true,
    images: [
      {
        url: 'https://www.example.com/media/catalog/product/t/s/test-variation.png',
        label: 'Test Variation Label',
      },
    ],
    attributes: [
      { name: 'criteria_1', label: 'Details', value: 'O/A Height: 50"' },
      { name: 'criteria_2', label: 'Criteria 2', value: 'Fixture Height: 14.25"' },
      { name: 'criteria_3', label: 'Criteria 3', value: 'Min. Custom Height: 20"' },
      { name: 'criteria_4', label: 'Criteria 4', value: 'Width: 4"' },
      { name: 'criteria_5', label: 'Criteria 5', value: 'Canopy: 4.5" Round' },
      { name: 'criteria_6', label: 'Criteria 6', value: 'Socket: E26 Keyless' },
      { name: 'criteria_7', label: 'Criteria 7', value: 'Wattage: 40 T10' },
      { name: 'weight', label: 'Weight', value: 219 },
    ],
    prices: {
      regular: {
        amount: 799,
        currency: 'USD',
        maximumAmount: 799,
        minimumAmount: 799,
      },
      final: {
        amount: 799,
        currency: 'USD',
        maximumAmount: 799,
        minimumAmount: 799,
      },
    },
    selections: [
      'Y29uZmlndXJhYmxlLzE2NTEvODI3MQ==',
      'Y29uZmlndXJhYmxlLzI0NjEvMzYzNDE=',
    ],
    ...overrides,
  };

  return variation;
}

/**
 * Generates a default set of product variations.
 * @returns {Array} - An array of product variation fixtures.
 */
export function createDefaultVariations() {
  return [
    createProductVariationFixture({ sku: 'test-sku-1' }),
    createProductVariationFixture({ sku: 'test-sku-2' }),
    createProductVariationFixture({ sku: 'test-sku-3' }),
  ];
}
