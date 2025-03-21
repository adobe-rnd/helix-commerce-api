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

import { JSONTemplate } from './JSONTemplate.js';
import OVERRIDES from './overrides/index.js';

/**
 * @typedef {import('../../types.d.ts').Product} Product
 * @typedef {import('../../types.d.ts').Variant} Variant
 */

/**
 * @param {Context} ctx
 * @param {Product} product
 * @param {Variant[]} variants
 */
export default function fromContext(ctx, product, variants) {
  if (!ctx.attributes.jsonTemplate) {
    const Cls = OVERRIDES[ctx.config.siteKey] ?? JSONTemplate;
    ctx.attributes.jsonTemplate = new Cls(ctx, product, variants);
  }
  return ctx.attributes.jsonTemplate;
}
