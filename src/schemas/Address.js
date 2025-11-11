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

/** @type {import("../utils/validation.js").ObjectSchema} */
const Order = {
  type: 'object',
  properties: {
    // managed by service
    // id: { type: 'string' },

    // provided by client
    name: { type: 'string', maxLength: 255 },
    company: { type: 'string', maxLength: 255 },
    address1: { type: 'string', maxLength: 255 },
    address2: { type: 'string', maxLength: 255 },
    city: { type: 'string', maxLength: 255 },
    state: { type: 'string', maxLength: 255 },
    zip: { type: 'string', maxLength: 255 },
    country: { type: 'string', maxLength: 255 },
    phone: { type: 'string', maxLength: 255 },
    email: { type: 'string', maxLength: 255 },
  },
  required: ['name', 'email', 'address1', 'city', 'state', 'zip', 'country'],
};

export default Order;
