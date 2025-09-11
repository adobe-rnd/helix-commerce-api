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

config();

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {{url: URL} & RequestInit}
 */
function getFetchOptions(path, init = {}) {
  return {
    url: new URL(`https://adobe-commerce-api-ci.adobeaem.workers.dev${path}`),
    cache: 'no-store',
    redirect: 'manual',
    ...init,
    headers: {
      authorization: `bearer ${process.env.SUPERUSER_KEY}`,
      ...(init.headers ?? {}),
    },
  };
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

  describe('Catalog', () => {
    const sku = `sku${Math.floor(Math.random() * 1000)}`;
    const testImage = {
      url: 'https://main--helix-website--adobe.aem.live/docs/media_178c546132aab5d14ad1801ccbb6a70a461b127a8.png?width=750&format=png&optimize=medium',
      label: 'Test Image',
      roles: ['thumbnail'],
    };
    const testProduct = {
      name: 'Test Product',
      sku,
      urlKey: `product-${sku}`,
      description: 'A test product for integration testing',
      images: [
        testImage,
      ],
    };
    const apiPrefix = '/maxakuru/productbus-test/catalog/main/default';

    it('can PUT, GET, lookup, and DELETE a product', async () => {
      const putOpts = getFetchOptions(
        `${apiPrefix}/products/${testProduct.sku}.json`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(testProduct),
        },
      );
      const putRes = await fetch(putOpts.url, putOpts);
      assert.strictEqual(putRes.status, 201, 'PUT request should succeed');

      const { url, ...getOpts } = getFetchOptions(`${apiPrefix}/products/${testProduct.sku}.json`);
      const getRes = await fetch(url, getOpts);
      assert.strictEqual(getRes.status, 200, 'GET request should succeed');

      const retrievedProduct = await getRes.json();
      assert.strictEqual(retrievedProduct.name, testProduct.name);
      assert.strictEqual(retrievedProduct.sku, testProduct.sku);
      assert.strictEqual(retrievedProduct.description, testProduct.description);
      // should process a single image synchronously
      assert.deepStrictEqual(retrievedProduct.images[0], {
        ...testImage,
        url: './media_1b236d4445641e7aa141e11c62ea50a634d98022.png?width=750&format=png&optimize=medium',
      });

      const lookupOptions = {
        ...getFetchOptions(`${apiPrefix}/lookup?urlKey=${testProduct.urlKey}`),
      };
      const lookupRes = await fetch(lookupOptions.url, lookupOptions);
      assert.strictEqual(lookupRes.status, 301, 'Lookup request should succeed');

      const lookupLocation = lookupRes.headers.get('Location');
      assert.strictEqual(lookupLocation, `https://adobe-commerce-api-ci.adobeaem.workers.dev${apiPrefix}/products/${testProduct.sku}.json`);

      const lookupRes2 = await fetch(lookupLocation, lookupOptions);
      assert.strictEqual(lookupRes2.status, 200, 'Lookup request should succeed');

      const lookupProduct = await lookupRes2.json();
      assert.strictEqual(lookupProduct.sku, testProduct.sku);

      const deleteOptions = {
        ...getFetchOptions(`${apiPrefix}/products/${testProduct.sku}.json`),
        method: 'DELETE',
      };
      const deleteRes = await fetch(deleteOptions.url, deleteOptions);
      assert.strictEqual(deleteRes.status, 200, 'DELETE request should succeed');

      const lookupAfterDeleteOptions = {
        ...getFetchOptions(`${apiPrefix}/lookup?urlKey=${testProduct.urlKey}`),
      };
      const lookupAfterDeleteRes = await fetch(lookupAfterDeleteOptions.url, lookupAfterDeleteOptions);
      assert.strictEqual(lookupAfterDeleteRes.status, 404, 'Lookup request should return 404 after deletion');

      const getAfterDeleteOptions = {
        ...getFetchOptions(`${apiPrefix}/products/${testProduct.sku}.json`),
      };
      const getAfterDeleteRes = await fetch(getAfterDeleteOptions.url, getAfterDeleteOptions);
      assert.strictEqual(getAfterDeleteRes.status, 404, 'GET request should return 404 after deletion');
    }).timeout(100000);
  });

  describe('async images', () => {
    const sku = `sku${Math.floor(Math.random() * 1000)}`;
    const testImage = {
      url: 'https://main--helix-website--adobe.aem.live/docs/media_178c546132aab5d14ad1801ccbb6a70a461b127a8.png?width=750&format=png&optimize=medium',
      label: 'Test Image',
      roles: ['thumbnail'],
    };
    const testProduct = {
      name: 'Test Product',
      sku,
      urlKey: `product-${sku}`,
      description: 'A test product for integration testing',
      images: [
        testImage,
      ],
    };
    const apiPrefix = '/maxakuru/productbus-test/catalog/main/default';

    it('can PUT, GET, lookup, and DELETE a product with async image processing', async () => {
      const putOpts = getFetchOptions(
        `${apiPrefix}/products/${testProduct.sku}.json?asyncImages=true`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(testProduct),
        },
      );
      const putRes = await fetch(putOpts.url, putOpts);
      assert.strictEqual(putRes.status, 201, 'PUT request should succeed');

      const { url, ...getOpts } = getFetchOptions(`${apiPrefix}/products/${testProduct.sku}.json`);
      const getRes = await fetch(url, getOpts);
      assert.strictEqual(getRes.status, 200, 'GET request should succeed');

      const retrievedProduct = await getRes.json();
      assert.strictEqual(retrievedProduct.name, testProduct.name);
      assert.strictEqual(retrievedProduct.sku, testProduct.sku);
      assert.strictEqual(retrievedProduct.description, testProduct.description);
      // should process images asynchronously
      assert.deepStrictEqual(retrievedProduct.images[0], testImage);

      // eventually the image should be processed
      // poll every 10 seconds until it is
      let newRetrievedProduct;
      for (let i = 0; i < 60; i += 1) {
        /* eslint-disable no-await-in-loop */
        // eslint-disable-next-line no-promise-executor-return
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        const res = await fetch(url, getOpts);
        assert.strictEqual(getRes.status, 200, 'GET request should succeed');
        newRetrievedProduct = await res.json();
        /* eslint-enable no-await-in-loop */
        if (retrievedProduct.images[0].url !== newRetrievedProduct.images[0].url) {
          // changed, done processing
          break;
        }
      }

      // should be processed into a media url
      assert.deepStrictEqual(newRetrievedProduct.images[0], {
        ...testImage,
        url: './media_1b236d4445641e7aa141e11c62ea50a634d98022.png?width=750&format=png&optimize=medium',
      });

      const lookupOptions = {
        ...getFetchOptions(`${apiPrefix}/lookup?urlKey=${testProduct.urlKey}`),
      };
      const lookupRes = await fetch(lookupOptions.url, lookupOptions);
      assert.strictEqual(lookupRes.status, 301, 'Lookup request should succeed');

      const lookupLocation = lookupRes.headers.get('Location');
      assert.strictEqual(lookupLocation, `https://adobe-commerce-api-ci.adobeaem.workers.dev${apiPrefix}/products/${testProduct.sku}.json`);

      const lookupRes2 = await fetch(lookupLocation, lookupOptions);
      assert.strictEqual(lookupRes2.status, 200, 'Lookup request should succeed');

      const lookupProduct = await lookupRes2.json();
      assert.strictEqual(lookupProduct.sku, testProduct.sku);

      const deleteOptions = {
        ...getFetchOptions(`${apiPrefix}/products/${testProduct.sku}.json`),
        method: 'DELETE',
      };
      const deleteRes = await fetch(deleteOptions.url, deleteOptions);
      assert.strictEqual(deleteRes.status, 200, 'DELETE request should succeed');

      const lookupAfterDeleteOptions = {
        ...getFetchOptions(`${apiPrefix}/lookup?urlKey=${testProduct.urlKey}`),
      };
      const lookupAfterDeleteRes = await fetch(lookupAfterDeleteOptions.url, lookupAfterDeleteOptions);
      assert.strictEqual(lookupAfterDeleteRes.status, 404, 'Lookup request should return 404 after deletion');

      const getAfterDeleteOptions = {
        ...getFetchOptions(`${apiPrefix}/products/${testProduct.sku}.json`),
      };
      const getAfterDeleteRes = await fetch(getAfterDeleteOptions.url, getAfterDeleteOptions);
      assert.strictEqual(getAfterDeleteRes.status, 404, 'GET request should return 404 after deletion');
    }).timeout(100000);
  });
});
