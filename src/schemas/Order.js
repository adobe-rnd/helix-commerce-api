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

import { ProductBusPrice } from './ProductBus.js';

/** @type {import("../utils/validation.js").ObjectSchema} */
export const OrderItem = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    note: { type: 'string' },
    sku: { type: 'string' },
    quantity: { type: 'number' },
    price: ProductBusPrice,
  },
  required: ['sku', 'quantity', 'price'],
};

/** @type {import("../utils/validation.js").ObjectSchema} */
const Order = {
  type: 'object',
  properties: {
    // managed by service
    // id: { type: 'string' },
    // createdAt: { type: 'string' },
    // updatedAt: { type: 'string' },
    // state: { type: 'string', enum: ['pending', 'processing', 'completed', 'cancelled'] },

    // provided by client
    storeCode: { type: 'string' },
    storeViewCode: { type: 'string' },
    items: { type: 'array', items: OrderItem },
  },
  required: ['storeCode', 'storeViewCode', 'items'],
};

export default Order;
