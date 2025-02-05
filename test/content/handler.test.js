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

// @ts-nocheck

import assert from 'node:assert';
import sinon from 'sinon';
import esmock from 'esmock';

describe('contentHandler', () => {
  let helixStub;
  let adobeStub;
  let contentHandler;

  beforeEach(async () => {
    helixStub = sinon.stub().resolves();
    adobeStub = sinon.stub().resolves();
    contentHandler = await esmock('../../src/content/handler.js', {
      '../../src/content/helix-commerce.js': { handle: helixStub },
      '../../src/content/adobe-commerce.js': { handle: adobeStub },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('returns 405 for non-GET methods', async () => {
    const ctx = {
      info: { method: 'POST' },
      url: { pathname: '/content/product/test' },
      config: { pageType: 'product' },
    };

    const response = await contentHandler(ctx);
    assert.equal(response.status, 405);
  });

  it('returns 404 if pageType is missing', async () => {
    const ctx = {
      info: { method: 'GET' },
      url: { pathname: '/content/product/test' },
      config: {},
    };

    const response = await contentHandler(ctx);
    assert.equal(response.status, 404);
  });

  it('calls handleHelixCommerce if catalogSource is helix', async () => {
    const ctx = {
      log: { debug: () => {} },
      info: { method: 'GET' },
      url: { pathname: '/content/product/us/p/product-urlkey' },
      config: {
        pageType: 'product',
        catalogSource: 'helix',
        confMap: {
          '/us/p/{{urlkey}}': { some: 'config' },
        },
      },
    };

    await contentHandler(ctx);
    assert(helixStub.calledOnce);
    assert.deepStrictEqual(helixStub.firstCall.args[0], ctx);
  });

  it('calls handleAdobeCommerce', async () => {
    const ctx = {
      log: { debug: () => {} },
      info: { method: 'GET' },
      url: { pathname: '/content/product/us/p/product-urlkey' },
      config: {
        pageType: 'product',
        confMap: {
          '/us/p/{{urlkey}}': { some: 'config' },
        },
      },
    };

    await contentHandler(ctx);
    assert(adobeStub.calledOnce);
    assert.deepStrictEqual(adobeStub.firstCall.args[0], ctx);
  });
});
