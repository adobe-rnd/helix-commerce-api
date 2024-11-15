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

import { strict as assert } from 'node:assert';
import esmock from 'esmock';
import sinon from 'sinon';
import {
  createAdminUrl, callAdmin, ADMIN_ORIGIN,
} from '../../src/utils/admin.js';

describe('admin utils', () => {
  let fetchStub;

  beforeEach(() => {
    // Setup fetch stub before each test
    // eslint-disable-next-line no-multi-assign
    global.fetch = fetchStub = sinon.stub();
  });

  afterEach(() => {
    // Restore all stubs after each test
    sinon.restore();
  });

  describe('createAdminUrl', () => {
    it('creates basic admin URL with required parameters', () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
      };
      const url = createAdminUrl(config, 'preview');

      assert.equal(url.toString(), `${ADMIN_ORIGIN}/preview/adobe/blog/main`);
    });

    it('creates URL with custom path', () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
      };
      const url = createAdminUrl(config, 'preview', '/content/index');

      assert.equal(url.toString(), `${ADMIN_ORIGIN}/preview/adobe/blog/main/content/index`);
    });

    it('handles admin version parameter', () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
        adminVersion: '1.2.3',
      };
      const url = createAdminUrl(config, 'preview');

      assert.equal(url.searchParams.get('hlx-admin-version'), '1.2.3');
    });

    it('handles custom search parameters', () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
      };
      const searchParams = new URLSearchParams();
      searchParams.append('foo', 'bar');

      const url = createAdminUrl(config, 'preview', '', searchParams);

      assert.equal(url.searchParams.get('foo'), 'bar');
    });

    it('creates URL without org/site/ref when not all are provided', () => {
      const config = {
        org: 'adobe',
        // site missing
        ref: 'main',
      };
      const url = createAdminUrl(config, 'preview');

      assert.equal(url.toString(), `${ADMIN_ORIGIN}/preview`);
    });
  });

  describe('callAdmin', () => {
    it('makes GET request by default', async () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
      };

      fetchStub.resolves(new Response());

      await callAdmin(config, 'preview');

      assert(fetchStub.calledOnce);
      const [url, opts] = fetchStub.firstCall.args;
      assert.equal(url.toString(), `${ADMIN_ORIGIN}/preview/adobe/blog/main`);
      assert.equal(opts.method, 'get');
      assert.equal(opts.headers, undefined);
      assert.equal(opts.body, undefined);
    });

    it('makes POST request with JSON body', async () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
      };

      const body = { hello: 'world' };
      fetchStub.resolves(new Response());

      await callAdmin(config, 'preview', '', {
        method: 'post',
        body,
      });

      assert(fetchStub.calledOnce);
      const [_, opts] = fetchStub.firstCall.args;
      assert.equal(opts.method, 'post');
      assert.deepEqual(opts.headers, { 'Content-Type': 'application/json' });
      assert.equal(opts.body, JSON.stringify(body));
    });

    it('includes search parameters in request', async () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
      };

      const searchParams = new URLSearchParams();
      searchParams.append('test', 'value');
      fetchStub.resolves(new Response());

      await callAdmin(config, 'preview', '', { searchParams });

      assert(fetchStub.calledOnce);
      const [url] = fetchStub.firstCall.args;
      assert.equal(url.searchParams.get('test'), 'value');
    });
  });

  describe('callPreviewPublish', () => {
    let callPreviewPublish;
    const mockPaths = ['/products/sku1'];

    beforeEach(async () => {
      const adminModule = await esmock('../../src/utils/admin.js', {
        '../../src/utils/product.js': {
          getPreviewPublishPaths: () => mockPaths,
        },
      });

      callPreviewPublish = adminModule.callPreviewPublish;
    });

    it('handles POST requests with API key', async () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
        helixApiKey: 'test-key',
      };

      fetchStub.resolves(new Response(null, { status: 200 }));

      const result = await callPreviewPublish(config, 'POST', 'sku1', 'product-1');

      assert.equal(fetchStub.callCount, 2);

      fetchStub.getCalls().forEach((call) => {
        assert.equal(call.args[1].headers.authorization, 'token test-key');
      });

      const calls = fetchStub.getCalls();
      assert(calls[0].args[0].pathname.includes('/preview'));
      assert(calls[1].args[0].pathname.includes('/live'));

      assert.deepEqual(result, {
        paths: {
          '/products/sku1': {
            preview: { status: 200 },
            live: { status: 200 },
          },
        },
      });
    });

    it('handles DELETE requests without API key', async () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
      };

      fetchStub.resolves(new Response(null, { status: 200 }));

      await callPreviewPublish(config, 'DELETE', 'sku1', 'product-1');

      assert.equal(fetchStub.callCount, 2);

      fetchStub.getCalls().forEach((call) => {
        assert.equal(call.args[1].headers, undefined);
      });

      const calls = fetchStub.getCalls();
      assert(calls[0].args[0].pathname.includes('/preview') || calls[0].args[0].pathname.includes('/live'));
      assert(calls[1].args[0].pathname.includes('/preview') || calls[1].args[0].pathname.includes('/live'));
    });

    it('handles error responses', async () => {
      const config = {
        org: 'adobe',
        site: 'blog',
        ref: 'main',
      };

      const errorResponse = new Response(null, {
        status: 404,
        headers: { 'x-error': 'Not found' },
      });
      fetchStub.resolves(errorResponse);

      const result = await callPreviewPublish(config, 'POST', 'sku1', 'product-1');

      assert.deepEqual(result, {
        paths: {
          '/products/sku1': {
            preview: { status: 404, message: 'Not found' },
            live: { status: 404, message: 'Not found' },
          },
        },
      });
    });
  });
});
