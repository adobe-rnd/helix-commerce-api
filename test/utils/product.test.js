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

import { strict as assert } from 'node:assert';
import { sortImagesByRole } from '../../src/utils/product.js';

describe('product utils', () => {
  describe('sortImagesByRole()', () => {
    it('should sort images by role', () => {
      /** @type {Product['images']} */
      const images = [{
        url: 'https://example.com/image4.jpg',
        label: 'four',
        roles: ['teriary'],
      }, {
        url: 'https://example.com/image1.jpg',
        label: 'one',
        roles: ['thumbnail'],
      }, {
        url: 'https://example.com/image2.jpg',
        label: 'two',
        roles: ['primary'],
      }, {
        url: 'https://example.com/image3.jpg',
        label: 'three',
        roles: ['thumbnail', 'secondary'],
      }];

      const sortedImages = sortImagesByRole(images, ['thumbnail', 'primary']);
      assert.deepStrictEqual(sortedImages, [{
        url: 'https://example.com/image1.jpg',
        label: 'one',
        roles: ['thumbnail'],
      }, {
        url: 'https://example.com/image3.jpg',
        label: 'three',
        roles: ['thumbnail', 'secondary'],
      }, {
        url: 'https://example.com/image2.jpg',
        label: 'two',
        roles: ['primary'],
      }, {
        url: 'https://example.com/image4.jpg',
        label: 'four',
        roles: ['teriary'],
      }]);
    });
  });
});
