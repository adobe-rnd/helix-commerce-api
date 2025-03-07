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

import { JSONTemplate } from '../JSONTemplate.js';

/**
 * @typedef {import('../../../types.d.ts').Product} Product
 * @typedef {import('../../../types.d.ts').Variant} Variant
 */

export default class extends JSONTemplate {
  // eslint-disable-next-line class-methods-use-this
  renderBrand() {
    return {
      brand: {
        '@type': 'Brand',
        name: this.product.attributeMap?.brand ?? 'Visual Comfort',
      },
    };
  }

  renderOffers() {
    const baseOffers = super.renderOffers();
    return baseOffers.map((o) => ({
      ...o,
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: {
            '@type': 'Country',
            name: 'US',
          },
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          businessDays: {
            '@type': 'OpeningHoursSpecification',
          },
        },
      },
    }));
  }
}
