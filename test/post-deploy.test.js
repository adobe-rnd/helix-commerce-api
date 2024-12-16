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

/* eslint-disable max-len */

import assert from 'assert';
import { h1NoCache } from '@adobe/fetch';
import { config } from 'dotenv';
import fs from 'fs/promises';
import { resolve } from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import { HtmlDiffer } from 'html-differ';

config();

/**
 * @param {string} path
 * @returns {{url: URL} & RequestInit}
 */
function getFetchOptions(path) {
  return {
    url: new URL(`https://adobe-commerce-api-ci.adobeaem.workers.dev${path}`),
    cache: 'no-store',
    redirect: 'manual',
  };
}

/**
 * @param {string} name
 * @returns {Promise<string>}
 */
async function getHTMLFixture(name) {
  // eslint-disable-next-line no-underscore-dangle
  const content = await fs.readFile(resolve(global.__testdir, `./fixtures/post-deploy/${name}.html`), 'utf-8');
  return content;
}

describe('Post-Deploy Tests', () => {
  const fetchContext = h1NoCache();

  after(async () => {
    await fetchContext.reset();
  });

  it('returns 404 for missing site param', async () => {
    const { url, ...opts } = getFetchOptions('/missing');
    const res = await fetch(url, opts);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get('x-error'), 'missing site');
  });

  it('valid pdp renders html', async () => {
    const { url, ...opts } = getFetchOptions('/dylandepass/commerce-boilerplate/content/product/products/bella-tank/wt01');
    const res = await fetch(url, opts);
    const expected = await getHTMLFixture('bella-tank');

    assert.strictEqual(res.status, 200);
    let actual = await res.text();
    const differ = new HtmlDiffer();

    const regex = /<meta\s+property="product:lastModifiedAt"\s+content="[^"]*"\s*>/;
    const match = actual.match(regex);
    assert(match, 'product:lastModifiedAt should be present');

    actual = actual.replace(regex, '');

    // @ts-ignore
    assert.ok(differ.isEqual(actual, expected));
  });

  describe('Catalog', () => {
    let testProduct;

    before(() => {
      const sku = `sku${Math.floor(Math.random() * 1000)}`;
      testProduct = {
        name: 'Test Product',
        sku,
        urlKey: `product-${sku}`,
        description: 'A test product for integration testing',
      };
    });

    it('can PUT, GET, lookup, and DELETE a product', async () => {
      const putOpts = {
        ...getFetchOptions(`/dylandepass/commerce-boilerplate/catalog/main_website_store/default/product/${testProduct.sku}`),
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testProduct),
      };
      const putRes = await fetch(putOpts.url, putOpts);
      assert.strictEqual(putRes.status, 201, 'PUT request should succeed');

      const { url, ...getOpts } = getFetchOptions(`/dylandepass/commerce-boilerplate/catalog/main_website_store/default/product/${testProduct.sku}`);
      const getRes = await fetch(url, getOpts);
      assert.strictEqual(getRes.status, 200, 'GET request should succeed');

      const retrievedProduct = await getRes.json();
      assert.strictEqual(retrievedProduct.name, testProduct.name);
      assert.strictEqual(retrievedProduct.sku, testProduct.sku);
      assert.strictEqual(retrievedProduct.description, testProduct.description);

      const lookupOptions = {
        ...getFetchOptions(`/dylandepass/commerce-boilerplate/catalog/main_website_store/default/lookup?urlKey=${testProduct.urlKey}`),
      };
      const lookupRes = await fetch(lookupOptions.url, lookupOptions);
      assert.strictEqual(lookupRes.status, 301, 'Lookup request should succeed');

      const lookupLocation = lookupRes.headers.get('Location');
      assert.strictEqual(lookupLocation, `https://adobe-commerce-api-ci.adobeaem.workers.dev/dylandepass/commerce-boilerplate/catalog/main_website_store/default/product/${testProduct.sku}`);

      const lookupRes2 = await fetch(lookupLocation, lookupOptions);
      assert.strictEqual(lookupRes2.status, 200, 'Lookup request should succeed');

      const lookupProduct = await lookupRes2.json();
      assert.strictEqual(lookupProduct.sku, testProduct.sku);

      const deleteOptions = {
        ...getFetchOptions(`/dylandepass/commerce-boilerplate/catalog/main_website_store/default/product/${testProduct.sku}`),
        method: 'DELETE',
      };
      const deleteRes = await fetch(deleteOptions.url, deleteOptions);
      assert.strictEqual(deleteRes.status, 200, 'DELETE request should succeed');

      const lookupAfterDeleteOptions = {
        ...getFetchOptions(`/dylandepass/commerce-boilerplate/catalog/main_website_store/default/lookup?urlKey=${testProduct.urlKey}`),
      };
      const lookupAfterDeleteRes = await fetch(lookupAfterDeleteOptions.url, lookupAfterDeleteOptions);
      assert.strictEqual(lookupAfterDeleteRes.status, 404, 'Lookup request should return 404 after deletion');

      const getAfterDeleteOptions = {
        ...getFetchOptions(`/dylandepass/commerce-boilerplate/catalog/main_website_store/default/product/${testProduct.sku}`),
      };
      const getAfterDeleteRes = await fetch(getAfterDeleteOptions.url, getAfterDeleteOptions);
      assert.strictEqual(getAfterDeleteRes.status, 404, 'GET request should return 404 after deletion');
    }).timeout(100000);
  });
});
