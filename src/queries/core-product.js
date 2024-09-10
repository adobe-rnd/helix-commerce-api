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

/**
 * @param {{ urlKey?: string; sku?: string; }} param0
 */
export default ({ urlKey, sku }) => gql`{
  products(
    filter: { ${urlKey ? 'url_key' : 'sku'}: { eq: "${urlKey ?? sku}" } }
  ) {
    items {
      sku
      name
      meta_title
      meta_keyword
      meta_description
      short_description {
        html
      }
      description {
        html
      }
      image {
        url
        label
        disabled
      }
      thumbnail {
        url
        label
      }
      media_gallery {
        url
        label
      }
      categories {
        category_seo_name
        breadcrumbs {
          category_name
          category_level
        }
      }
    }
  }
}`;
