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

// @ts-nocheck

import assert from 'node:assert';
import sinon from 'sinon';
import { extractAndReplaceImages } from '../../src/utils/media.js';
import { DEFAULT_CONTEXT } from '../fixtures/context.js';

function u8(str) {
  return new TextEncoder().encode(str);
}

async function sha1Hex(buffer) {
  const hashBuf = await crypto.subtle.digest('SHA-1', buffer);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('utils/media extractAndReplaceImages', () => {
  let fetchStub;

  afterEach(() => {
    sinon.restore();
    if (fetchStub) {
      fetchStub.restore();
      fetchStub = undefined;
    }
  });

  it('replaces product and variant image URLs', async () => {
    const img1 = u8('image-one');
    const img2 = u8('image-two');
    const hash1 = await sha1Hex(img1.buffer);
    const hash2 = await sha1Hex(img2.buffer);

    fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub
      .onCall(0).resolves({
        ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => img1.buffer, status: 200,
      })
      .onCall(1).resolves({
        ok: true, headers: new Headers({ 'content-type': 'image/jpeg' }), arrayBuffer: async () => img2.buffer, status: 200,
      });

    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    // first HEAD -> not present, second HEAD -> present
    ctx.env.CATALOG_BUCKET.head.onCall(0).resolves(null);
    ctx.env.CATALOG_BUCKET.head.onCall(1).resolves({});

    const product = {
      images: [{ url: 'https://cdn.example.com/a.png' }],
      variants: [
        { images: [{ url: 'https://cdn.example.com/b.jpg' }] },
      ],
    };

    const result = await extractAndReplaceImages(ctx, 'org', 'site', product);

    assert.equal(result.images[0].url, `./media_${hash1}.png`);
    assert.equal(result.variants[0].images[0].url, `./media_${hash2}.jpg`);

    // first image uploaded, second existed
    assert(ctx.env.CATALOG_BUCKET.put.calledOnce);
  });

  it('skips invalid URLs and does not upload', async () => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });

    const product = { images: [{ url: '' }], variants: [] };
    const result = await extractAndReplaceImages(ctx, 'org', 'site', product);

    assert.equal(result.images[0].url, '');
    assert(ctx.env.CATALOG_BUCKET.head.notCalled);
    assert(ctx.env.CATALOG_BUCKET.put.notCalled);
    assert.equal(ctx.metrics.imageDownloads.length, 0);
    assert.equal(ctx.metrics.imageUploads.length, 0);
  });

  it('processes duplicate URLs only once', async () => {
    const img = u8('same-image');
    const hash = await sha1Hex(img.buffer);

    fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      ok: true, headers: new Headers({ 'content-type': 'image/webp' }), arrayBuffer: async () => img.buffer, status: 200,
    });

    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    ctx.env.CATALOG_BUCKET.head.resolves(null);

    const product = {
      images: [{ url: 'https://cdn.example.com/dup.webp' }, { url: 'https://cdn.example.com/dup.webp' }],
    };

    const result = await extractAndReplaceImages(ctx, 'org', 'site', product);

    assert.equal(result.images[0].url, `./media_${hash}.webp`);
    assert.equal(result.images[1].url, `./media_${hash}.webp`);
    assert.equal(fetchStub.callCount, 1);
    assert(ctx.env.CATALOG_BUCKET.put.calledOnce);
  });

  it('handles URLs without file extension (uses everything after last dot)', async () => {
    const img = u8('noext');
    const hash = await sha1Hex(img.buffer);

    fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => img.buffer, status: 200,
    });

    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    ctx.env.CATALOG_BUCKET.head.resolves(null);

    const product = { images: [{ url: 'https://cdn.example.com/image?id=123' }] };
    const result = await extractAndReplaceImages(ctx, 'org', 'site', product);

    // current implementation appends everything after the last dot
    assert.equal(result.images[0].url, `./media_${hash}.com/image?id=123`);
    assert(ctx.env.CATALOG_BUCKET.put.calledOnce);
  });

  it('logs and continues when image fetch fails', async () => {
    fetchStub = sinon.stub(globalThis, 'fetch').resolves({ ok: false, status: 404 });
    const errorStub = sinon.stub();
    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub(), error: errorStub },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    const product = { images: [{ url: 'https://cdn.example.com/missing.png' }] };

    await extractAndReplaceImages(ctx, 'org', 'site', product);

    const errorLogCalls = errorStub.getCalls();
    assert(errorLogCalls.length === 1);
    assert(errorLogCalls[0].args[0].includes('error processing image: '));
    assert(errorLogCalls[0].args[1].toString().includes('Failed to fetch image: https://cdn.example.com/missing.png (404)'));

    assert(ctx.env.CATALOG_BUCKET.put.notCalled);
  });

  it('retries on 429 up to limit, then continues with other images', async () => {
    const okImg = u8('eventual-success');
    const okHash = await sha1Hex(okImg.buffer);

    // make backoff instantly resolve
    const setTimeoutStub = sinon.stub(globalThis, 'setTimeout')
      .callsFake((fn) => {
        fn();
        return 0;
      });

    fetchStub = sinon.stub(globalThis, 'fetch');
    // first image: 4 attempts => still fails (0,1,2 retries, then throw on attempt 3)
    fetchStub
      .onCall(0)
      .resolves({ ok: false, status: 429 })
      .onCall(1)
      .resolves({ ok: false, status: 429 })
      .onCall(2)
      .resolves({ ok: false, status: 429 })
      .onCall(3)
      .resolves({ ok: false, status: 429 })
      // second image: succeeds immediately
      .onCall(4)
      .resolves({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => okImg.buffer,
        status: 200,
      });

    const errorStub = sinon.stub();
    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub(), error: errorStub },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    ctx.env.CATALOG_BUCKET.head.onCall(0).resolves(null);

    const product = {
      images: [{ url: 'https://cdn.example.com/will-throttle.png' }],
      variants: [
        { images: [{ url: 'https://cdn.example.com/ok.png' }] },
      ],
    };

    const result = await extractAndReplaceImages(ctx, 'org', 'site', product);

    // first image failed after retries, original URL remains
    assert.equal(result.images[0].url, 'https://cdn.example.com/will-throttle.png');
    // second image processed and replaced
    assert.equal(result.variants[0].images[0].url, `./media_${okHash}.png`);

    // only the successful second image is uploaded
    assert(ctx.env.CATALOG_BUCKET.put.calledOnce);
    assert.equal(fetchStub.callCount, 5);

    // error logged once for the failed image, with original status included
    const calls = errorStub.getCalls();
    assert.equal(calls.length, 1);
    assert(calls[0].args[0].includes('error processing image: '));
    assert(calls[0].args[1].toString().includes('Failed to fetch image: https://cdn.example.com/will-throttle.png (429)'));

    setTimeoutStub.restore();
  });

  it('retries on 403 then succeeds and uploads image', async () => {
    const img = u8('retry-then-success');
    const hash = await sha1Hex(img.buffer);

    // make backoff instantly resolve
    const setTimeoutStub = sinon.stub(globalThis, 'setTimeout')
      .callsFake((fn) => {
        fn();
        return 0;
      });

    fetchStub = sinon.stub(globalThis, 'fetch');
    // two retryable failures, then success
    fetchStub
      .onCall(0)
      .resolves({ ok: false, status: 403 })
      .onCall(1)
      .resolves({ ok: false, status: 403 })
      .onCall(2)
      .resolves({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => img.buffer,
        status: 200,
      });

    const errorStub = sinon.stub();
    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub(), error: errorStub },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    ctx.env.CATALOG_BUCKET.head.resolves(null);

    const product = { images: [{ url: 'https://cdn.example.com/photo.jpg' }] };
    const result = await extractAndReplaceImages(ctx, 'org', 'site', product);

    assert.equal(result.images[0].url, `./media_${hash}.jpg`);
    assert(ctx.env.CATALOG_BUCKET.put.calledOnce);
    assert.equal(fetchStub.callCount, 3);
    assert.equal(errorStub.callCount, 0);

    setTimeoutStub.restore();
  });
});
