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

/**
 * @param {{
*  sku: string;
*  url: string;
*  description: string;
*  image: string;
*  name: string;
*  brandName: string;
*  reviewCount: number;
*  ratingValue: number;
* }} param0
* @returns {string}
*/
export default ({
  sku,
  url,
  name,
  description,
  image,
  brandName,
  reviewCount,
  ratingValue,
}) => JSON.stringify({
  '@context': 'http://schema.org',
  '@type': 'Product',
  '@id': url,
  name,
  sku,
  description,
  image,
  productID: sku,
  brand: {
    '@type': 'Brand',
    name: brandName,
  },
  offers: [],
  ...(typeof reviewCount === 'number'
     && typeof ratingValue === 'number'
     && reviewCount > 0
    ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue,
        reviewCount,
      },
    }
    : {}),
});
