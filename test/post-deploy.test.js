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
    const expected = await getHTMLFixture('expected1');

    assert.strictEqual(res.status, 200);
    const actual = await res.text();

    const differ = new HtmlDiffer();

    // @ts-ignore
    // const resp = differ.diffHtml(actual, expected);
    // console.log('diff: ', resp);

    // @ts-ignore
    assert.ok(differ.isEqual(actual, expected));
  });
});
