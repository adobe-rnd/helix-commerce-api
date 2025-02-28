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

import StorageClient from './StorageClient.js';

/**
 * Handles a GET request for a product.
 * @param {Context} ctx - The context object containing request information and utilities.
 * @returns {Promise<Response>} - A promise that resolves to the product response.
 */
export default async function fetch(ctx) {
  const storage = StorageClient.fromContext(ctx);
  const { sku } = ctx.config;
  const product = await storage.fetchProduct(sku);

  // TODO: use long ttl, add cache keys
  return new Response(JSON.stringify(product), {
    headers: { 'Content-Type': 'application/json' },
  });
}
