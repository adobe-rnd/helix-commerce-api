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

// eslint-disable-next-line import/no-extraneous-dependencies
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import assert from 'assert';
import { h1NoCache } from '@adobe/fetch';
import { config } from 'dotenv';
import { OTP_SUBJECT } from '../src/routes/auth/login.js';
import { createImapListener } from './fixtures/imap.js';

// required env variables
// POSTDEPLOY_SERVICE_TOKEN allows catalog APIs
// IMAP_APP_PASSWORD allows login to IMAP for test users
// TEST_USER_EMAIL email for test user (customer)
// TEST_ADMIN_EMAIL email for test user (site admin)
// CLOUDFLARE_ACCOUNT_ID for R2 storage
// CLOUDFLARE_ACCESS_KEY_ID for R2 storage, access to helix-commerce-auth-dev R2 bucket
// CLOUDFLARE_SECRET_ACCESS_KEY for R2 storage, access to helix-commerce-auth-dev R2 bucket

config();

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {{url: URL} & RequestInit}
 */
function getFetchOptions(path, init = {}) {
  return {
    url: new URL(`https://adobe-commerce-api-ci.adobeaem.workers.dev${path}`),
    // url: new URL(`http://localhost:8787${path}`),
    cache: 'no-store',
    redirect: 'manual',
    ...init,
    headers: {
      authorization: `bearer ${process.env.POSTDEPLOY_SERVICE_TOKEN}`,
      ...(init.headers ?? {}),
    },
  };
}

/**
 * @param {S3Client} client
 * @param {string} bucket
 * @param {string} key
 * @returns {Promise<Record<string, string>>}
 */
async function headS3File(client, bucket, key) {
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  try {
    const response = await client.send(command);
    return response.Metadata ?? {};
  } catch (error) {
    if (error.name === 'NotFound') {
      return {};
    }
    throw error;
  }
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
    assert.strictEqual(res.headers.get('x-error'), 'route not found');
  });

  describe('Catalog', () => {
    const sku = `sku${Math.floor(Math.random() * 10000)}`;
    const productPath = `/products/product-${sku}`;
    const testImage = {
      url: 'https://main--helix-website--adobe.aem.live/docs/media_178c546132aab5d14ad1801ccbb6a70a461b127a8.png?width=750&format=png&optimize=medium',
      label: 'Test Image',
      roles: ['thumbnail'],
    };
    const testProduct = {
      name: 'Test Product',
      sku,
      path: productPath,
      description: 'A test product for integration testing',
      images: [
        testImage,
      ],
    };
    const apiPrefix = '/maxakuru/sites/productbus-test/catalog';

    it('can PUT, GET, and DELETE a product', async () => {
      const putOpts = getFetchOptions(
        `${apiPrefix}${productPath}.json`,
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

      const { url, ...getOpts } = getFetchOptions(`${apiPrefix}${productPath}.json`);
      const getRes = await fetch(url, getOpts);
      assert.strictEqual(getRes.status, 200, 'GET request should succeed');

      const retrievedProduct = await getRes.json();
      assert.strictEqual(retrievedProduct.name, testProduct.name);
      assert.strictEqual(retrievedProduct.sku, testProduct.sku);
      assert.strictEqual(retrievedProduct.path, testProduct.path);
      assert.strictEqual(retrievedProduct.description, testProduct.description);
      // should process a single image synchronously
      assert.deepStrictEqual(retrievedProduct.images[0], {
        ...testImage,
        url: './media_1b236d4445641e7aa141e11c62ea50a634d98022.png',
      });

      const deleteOptions = {
        ...getFetchOptions(`${apiPrefix}${productPath}.json`),
        method: 'DELETE',
      };
      const deleteRes = await fetch(deleteOptions.url, deleteOptions);
      assert.strictEqual(deleteRes.status, 200, 'DELETE request should succeed');

      const getAfterDeleteOptions = {
        ...getFetchOptions(`${apiPrefix}${productPath}.json`),
      };
      const getAfterDeleteRes = await fetch(getAfterDeleteOptions.url, getAfterDeleteOptions);
      assert.strictEqual(getAfterDeleteRes.status, 404, 'GET request should return 404 after deletion');
    }).timeout(100000);
  });

  describe('async images', () => {
    const sku = `sku${Math.floor(Math.random() * 10000)}`;
    const productPath = `/products/product-${sku}`;
    const testImage = {
      url: 'https://main--helix-website--adobe.aem.live/docs/media_178c546132aab5d14ad1801ccbb6a70a461b127a8.png?width=750&format=png&optimize=medium',
      label: 'Test Image',
      roles: ['thumbnail'],
    };
    const testProduct = {
      name: 'Test Product',
      sku,
      path: productPath,
      description: 'A test product for integration testing',
      images: [
        testImage,
      ],
    };
    const apiPrefix = '/maxakuru/sites/productbus-test/catalog';

    it('can PUT, GET, and DELETE a product with async image processing', async () => {
      const putOpts = getFetchOptions(
        `${apiPrefix}${productPath}.json?asyncImages=true`,
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

      const { url, ...getOpts } = getFetchOptions(`${apiPrefix}${productPath}.json`);
      const getRes = await fetch(url, getOpts);
      assert.strictEqual(getRes.status, 200, 'GET request should succeed');

      const retrievedProduct = await getRes.json();
      assert.strictEqual(retrievedProduct.name, testProduct.name);
      assert.strictEqual(retrievedProduct.sku, testProduct.sku);
      assert.strictEqual(retrievedProduct.path, testProduct.path);
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
        const { url: getUrl, ...newGetOpts } = getFetchOptions(`${apiPrefix}${productPath}.json`);
        const res = await fetch(getUrl, newGetOpts);
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
        url: './media_1b236d4445641e7aa141e11c62ea50a634d98022.png',
      });

      const deleteOptions = {
        ...getFetchOptions(`${apiPrefix}${productPath}.json`),
        method: 'DELETE',
      };
      const deleteRes = await fetch(deleteOptions.url, deleteOptions);
      assert.strictEqual(deleteRes.status, 200, 'DELETE request should succeed');

      const getAfterDeleteOptions = {
        ...getFetchOptions(`${apiPrefix}${productPath}.json`),
      };
      const getAfterDeleteRes = await fetch(getAfterDeleteOptions.url, getAfterDeleteOptions);
      assert.strictEqual(getAfterDeleteRes.status, 404, 'GET request should return 404 after deletion');
    }).timeout(650000);
  });

  describe('auth', () => {
    const apiPrefix = '/maxakuru/sites/productbus-test';
    const userEmail = process.env.TEST_USER_EMAIL;
    const adminEmail = process.env.TEST_ADMIN_EMAIL;
    /** @type {S3Client} */
    let s3Client;
    /** @type {string} */
    let userToken;
    /** @type {string} */
    let adminToken;

    /** @type {ReturnType<typeof createImapListener>} */
    let imapListener;

    beforeEach(async () => {
      s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
          secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
        },
      });
      imapListener = createImapListener({
        email: process.env.TEST_USER_EMAIL,
        password: process.env.IMAP_APP_PASSWORD,
      });
      await imapListener.start();
    });

    afterEach(async () => {
      await imapListener.stop();
    });

    /**
     * @param {string} path
     * @param {RequestInit} init
     * @returns {{url: URL} & RequestInit}
     */
    function getAuthFetchOptions(path, init = {}) {
      return getFetchOptions(path, {
        ...init,
        headers: {
          authorization: undefined,
          ...(init.headers ?? {}),
        },
      });
    }

    it('protected api rejects unauthenticated requests', async () => {
      const listOrdersOpts = getAuthFetchOptions(`${apiPrefix}/customers/${userEmail}/orders`);
      const listOrdersRes = await fetch(listOrdersOpts.url, listOrdersOpts);
      assert.strictEqual(listOrdersRes.status, 403, 'List orders request should return 401 for unauthenticated requests');
    });

    it('can login and logout, make authenticated requests - user', async () => {
      // first setup the email listener promise
      const codeEmailPromise = imapListener.onEmail(
        ({ recipient, subject }) => recipient.includes(userEmail)
            && subject.includes(OTP_SUBJECT),
        60_000, // 60 seconds
      );

      // create OTP request
      const loginOpts = getAuthFetchOptions(`${apiPrefix}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: process.env.TEST_USER_EMAIL,
        }),
      });
      const loginRes = await fetch(loginOpts.url, loginOpts);
      assert.strictEqual(loginRes.status, 200, 'Login request should succeed');
      const { email, hash, exp } = await loginRes.json();

      assert.strictEqual(email, process.env.TEST_USER_EMAIL, 'Email should match');
      assert.ok(hash, 'Hash should be present');
      assert.ok(exp, 'Exp should be present');

      // get initial attempts meta
      let attemptsMeta = await headS3File(s3Client, 'helix-commerce-auth-dev', `maxakuru/productbus-test/attempts/${email}`);
      const attempts = attemptsMeta.attempts ? parseInt(attemptsMeta.attempts, 10) : 0;

      // wait for code email
      const codeEmail = await codeEmailPromise;
      assert.strictEqual(codeEmail.recipient, email, 'Recipient should match');
      assert.strictEqual(codeEmail.subject, OTP_SUBJECT, 'Subject should match');

      // extract code from email
      const code = codeEmail.body.match(/\b(\d{6})\b/)[1];
      assert.ok(code, 'Code should be present');

      // invalid code should return 401
      const callbackOptsInvalid = getAuthFetchOptions(`${apiPrefix}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email, code: '123456', hash, exp,
        }),
      });
      const callbackResInvalid = await fetch(callbackOptsInvalid.url, callbackOptsInvalid);
      assert.strictEqual(callbackResInvalid.status, 401, 'Callback request should return 401 for invalid code');
      assert.strictEqual(callbackResInvalid.headers.get('x-error'), 'invalid code');

      // and it should increment the attempts file
      attemptsMeta = await headS3File(s3Client, 'helix-commerce-auth-dev', `maxakuru/productbus-test/attempts/${email}`);
      assert.strictEqual(attemptsMeta.attempts, (attempts + 1).toString(), 'Attempts should be incremented');

      // create callback request
      const callbackOpts = getAuthFetchOptions(`${apiPrefix}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email, code, hash, exp,
        }),
      });
      const callbackRes = await fetch(callbackOpts.url, callbackOpts);
      assert.strictEqual(callbackRes.status, 200, 'Callback request should succeed');
      const callbackData = await callbackRes.json();
      assert.strictEqual(Object.keys(callbackData).length, 5, 'Callback data should have 5 keys');
      assert.ok(callbackData.success === true, 'Callback should succeed');
      assert.strictEqual(callbackData.email, email, 'Email should match');
      assert.ok(Array.isArray(callbackData.roles), 'Roles should be an array');
      assert.strictEqual(callbackData.roles.length, 1, 'Roles should be an array of length 1');
      assert.strictEqual(callbackData.roles[0], 'user', 'Roles should be user');
      assert.strictEqual(callbackData.org, 'maxakuru', 'Org should match');
      assert.strictEqual(callbackData.site, 'productbus-test', 'Site should match');

      // extract token from cookie
      const setCookie = callbackRes.headers.get('Set-Cookie');
      const token = setCookie.split(';')[0].split('=')[1];
      assert.ok(token, 'Token should be set in cookie');
      userToken = token;

      // attempts should be deleted
      attemptsMeta = await headS3File(s3Client, 'helix-commerce-auth-dev', `maxakuru/productbus-test/attempts/${email}`);
      assert.strictEqual(attemptsMeta.attempts, undefined, 'Attempts should be deleted');

      // list orders using Authorization header - should succeed for current user's orders
      const listOrdersOpts = getAuthFetchOptions(`${apiPrefix}/customers/${email}/orders`, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      const listOrdersRes = await fetch(listOrdersOpts.url, listOrdersOpts);
      assert.strictEqual(listOrdersRes.status, 200, 'List orders request should succeed (header)');
      const { orders } = await listOrdersRes.json();
      assert.ok(Array.isArray(orders), 'Orders should be an array');

      // list orders using cookie - should succeed for current user's orders
      const listOrdersOpts2 = getAuthFetchOptions(`${apiPrefix}/customers/${email}/orders`, {
        headers: {
          cookie: `auth_token=${token}`,
        },
      });
      const listOrdersRes2 = await fetch(listOrdersOpts2.url, listOrdersOpts2);
      assert.strictEqual(listOrdersRes2.status, 200, 'List orders request should succeed (cookie)');
      const { orders: orders2 } = await listOrdersRes2.json();
      assert.ok(Array.isArray(orders2), 'Orders should be an array');
      assert.deepStrictEqual(orders, orders2, 'Orders should be the same');

      // list orders of another user - should return 403
      const listOrdersOpts3 = getAuthFetchOptions(`${apiPrefix}/customers/${adminEmail}/orders`, {
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });
      const listOrdersRes3 = await fetch(listOrdersOpts3.url, listOrdersOpts3);
      assert.strictEqual(listOrdersRes3.status, 403, 'List orders request should return 403 for another user');

      // list all orders - should return 403
      const listOrdersOpts4 = getAuthFetchOptions(`${apiPrefix}/orders`, {
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });
      const listOrdersRes4 = await fetch(listOrdersOpts4.url, listOrdersOpts4);
      assert.strictEqual(listOrdersRes4.status, 403, 'List orders request should return 403 for all orders');
    }).timeout(3 * 60_000); // 3 minutes

    it('can login and logout, make authenticated requests - admin', async () => {
      // first setup the email listener promise
      const codeEmailPromise = imapListener.onEmail(
        ({ recipient, subject }) => recipient.includes(adminEmail)
            && subject.includes(OTP_SUBJECT),
        60_000, // 60 seconds
      );

      // create OTP request
      const loginOpts = getAuthFetchOptions(`${apiPrefix}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: process.env.TEST_ADMIN_EMAIL,
        }),
      });
      const loginRes = await fetch(loginOpts.url, loginOpts);
      assert.strictEqual(loginRes.status, 200, 'Login request should succeed');
      const { email, hash, exp } = await loginRes.json();

      assert.strictEqual(email, process.env.TEST_ADMIN_EMAIL, 'Email should match');
      assert.ok(hash, 'Hash should be present');
      assert.ok(exp, 'Exp should be present');

      // get initial attempts meta
      let attemptsMeta = await headS3File(s3Client, 'helix-commerce-auth-dev', `maxakuru/productbus-test/attempts/${email}`);
      const attempts = attemptsMeta.attempts ? parseInt(attemptsMeta.attempts, 10) : 0;

      // wait for code email
      const codeEmail = await codeEmailPromise;
      assert.strictEqual(codeEmail.recipient, email, 'Recipient should match');
      assert.strictEqual(codeEmail.subject, OTP_SUBJECT, 'Subject should match');

      // extract code from email
      const code = codeEmail.body.match(/\b(\d{6})\b/)[1];
      assert.ok(code, 'Code should be present');

      // invalid code should return 401
      const callbackOptsInvalid = getAuthFetchOptions(`${apiPrefix}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email, code: '123456', hash, exp,
        }),
      });
      const callbackResInvalid = await fetch(callbackOptsInvalid.url, callbackOptsInvalid);
      assert.strictEqual(callbackResInvalid.status, 401, 'Callback request should return 401 for invalid code');
      assert.strictEqual(callbackResInvalid.headers.get('x-error'), 'invalid code');

      // and it should increment the attempts file
      attemptsMeta = await headS3File(s3Client, 'helix-commerce-auth-dev', `maxakuru/productbus-test/attempts/${email}`);
      assert.strictEqual(attemptsMeta.attempts, (attempts + 1).toString(), 'Attempts should be incremented');

      // create callback request
      const callbackOpts = getAuthFetchOptions(`${apiPrefix}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email, code, hash, exp,
        }),
      });
      const callbackRes = await fetch(callbackOpts.url, callbackOpts);
      assert.strictEqual(callbackRes.status, 200, 'Callback request should succeed');
      const callbackData = await callbackRes.json();
      assert.strictEqual(Object.keys(callbackData).length, 5, 'Callback data should have 5 keys');
      assert.ok(callbackData.success === true, 'Callback should succeed');
      assert.strictEqual(callbackData.email, email, 'Email should match');
      assert.ok(Array.isArray(callbackData.roles), 'Roles should be an array');
      assert.strictEqual(callbackData.roles.length, 1, 'Roles should be an array of length 1');
      assert.strictEqual(callbackData.roles[0], 'admin', 'Roles should be admin');
      assert.strictEqual(callbackData.org, 'maxakuru', 'Org should match');
      assert.strictEqual(callbackData.site, 'productbus-test', 'Site should match');

      // extract token from cookie
      const setCookie = callbackRes.headers.get('Set-Cookie');
      const token = setCookie.split(';')[0].split('=')[1];
      assert.ok(token, 'Token should be set in cookie');
      adminToken = token;

      // attempts should be deleted
      attemptsMeta = await headS3File(s3Client, 'helix-commerce-auth-dev', `maxakuru/productbus-test/attempts/${email}`);
      assert.strictEqual(attemptsMeta.attempts, undefined, 'Attempts should be deleted');

      // list orders using Authorization header - should succeed for current user's orders
      const listOrdersOpts = getAuthFetchOptions(`${apiPrefix}/customers/${email}/orders`, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      const listOrdersRes = await fetch(listOrdersOpts.url, listOrdersOpts);
      assert.strictEqual(listOrdersRes.status, 200, 'List orders request should succeed (header)');
      const { orders } = await listOrdersRes.json();
      assert.ok(Array.isArray(orders), 'Orders should be an array');

      // list orders using cookie - should succeed for current user's orders
      const listOrdersOpts2 = getAuthFetchOptions(`${apiPrefix}/customers/${email}/orders`, {
        headers: {
          cookie: `auth_token=${token}`,
        },
      });
      const listOrdersRes2 = await fetch(listOrdersOpts2.url, listOrdersOpts2);
      assert.strictEqual(listOrdersRes2.status, 200, 'List orders request should succeed (cookie)');
      const { orders: orders2 } = await listOrdersRes2.json();
      assert.ok(Array.isArray(orders2), 'Orders should be an array');
      assert.deepStrictEqual(orders, orders2, 'Orders should be the same');

      // list orders of another user - should succeed for admin
      const listOrdersOpts3 = getAuthFetchOptions(`${apiPrefix}/customers/${userEmail}/orders`, {
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      const listOrdersRes3 = await fetch(listOrdersOpts3.url, listOrdersOpts3);
      assert.strictEqual(listOrdersRes3.status, 200, 'List orders request should succeed (header)');
      const { orders: orders3 } = await listOrdersRes3.json();
      assert.ok(Array.isArray(orders3), 'Orders should be an array');
      assert.deepStrictEqual(orders, orders3, 'Orders should be the same');

      // list all orders - should succeed for admin
      const listOrdersOpts4 = getAuthFetchOptions(`${apiPrefix}/orders`, {
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      const listOrdersRes4 = await fetch(listOrdersOpts4.url, listOrdersOpts4);
      assert.strictEqual(listOrdersRes4.status, 200, 'List orders request should succeed (header)');
      const { orders: orders4 } = await listOrdersRes4.json();
      assert.ok(Array.isArray(orders4), 'Orders should be an array');
      assert.deepStrictEqual(orders, orders4, 'Orders should be the same');
    }).timeout(3 * 60_000); // 3 minutes
  });
});
