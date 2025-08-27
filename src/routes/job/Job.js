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

/**
 * @template T
 * @implements {AsyncJob<T>}
 */
export default class Job {
  /** @type {Context} */
  ctx = undefined;

  /** @type {Progress} */
  progress = undefined;

  /** @type {string} */
  name = undefined;

  /** @type {string} */
  topic = undefined;

  /** @type {AsyncJob['state']} */
  state = undefined;

  /** @type {string} */
  startTime = undefined;

  /** @type {string} */
  endTime = undefined;

  /** @type {boolean} */
  cancelled = false;

  /** @type {string} */
  error = undefined;

  /** @type {T} */
  data = undefined;

  /**
   * @param {Context} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * @template T
   * @param {Context} ctx
   * @param {string} topic
   * @param {string} name
   * @param {T} [data]
   * @returns {Job<T>}
   */
  static create(ctx, topic, name, data) {
    const job = new Job(ctx);
    job.data = data;
    job.topic = topic;
    job.name = name;
    job.startTime = new Date().toISOString();
    job.state = 'running';
    job.progress = ctx.progress; // share progress object between job and context
    return job;
  }

  /**
   * Hydrate a minimal job from object metadata
   * Returns null if the job does not exist
   *
   * @param {Context} ctx
   * @param {string} topic
   * @param {string} name
   * @returns {Promise<Job<any> | null>}
   */
  static async fromMetadata(ctx, topic, name) {
    const job = new Job(ctx);
    job.topic = topic;
    job.name = name;
    const resp = await ctx.env.CATALOG_BUCKET.head(job.filename);
    if (!resp) {
      return null;
    }
    job.state = resp.httpMetadata['x-state'];
    job.startTime = resp.httpMetadata['x-start-time'];
    job.endTime = resp.httpMetadata['x-end-time'];
    job.cancelled = resp.httpMetadata['x-cancelled'] === 'true';
    job.progress = ctx.progress; // share progress object between job and context
    return job;
  }

  /**
   * Hydrate a full job from file contents
   * Returns null if the job does not exist
   *
   * @param {Context} ctx
   * @param {string} topic
   * @param {string} name
   * @returns {Promise<Job<any> | null>}
   */
  static async fromFile(ctx, topic, name) {
    const job = new Job(ctx);
    job.topic = topic;
    job.name = name;
    const resp = await ctx.env.CATALOG_BUCKET.get(job.filename);
    if (!resp) {
      return null;
    }

    const json = await resp.json();
    job.cancelled = json.cancelled;
    job.data = json.data;
    job.endTime = json.endTime;
    job.progress = json.progress;
    job.state = json.state;
    job.startTime = json.startTime;
    return job;
  }

  get filename() {
    const { config } = this.ctx;
    return `${config.org}/${config.site}/job/${this.topic}/${this.name}.json`;
  }

  get links() {
    const { config } = this.ctx;
    return {
      self: `${this.ctx.url.origin}/${config.org}/${config.site}/job/${this.topic}/${this.name}`,
      details: `${this.ctx.url.origin}/${config.org}/${config.site}/job/${this.topic}/${this.name}/details`,
    };
  }

  async save() {
    const { env } = this.ctx;
    await env.CATALOG_BUCKET.put(this.filename, JSON.stringify(this.toJSON()), {
      customMetadata: {
        'x-state': this.state,
        'x-start-time': this.startTime,
        'x-end-time': this.endTime,
        'x-cancelled': String(this.cancelled),
      },
    });
  }

  async complete() {
    this.state = 'completed';
    this.endTime = new Date().toISOString();
    await this.save();
  }

  // TODO: poll head on each batch to check if cancelled
  async cancel() {
    this.cancelled = true;
    this.endTime = new Date().toISOString();
    await this.save();
  }

  /**
   * @param {string} message
   */
  async fail(message) {
    this.state = 'failed';
    this.endTime = new Date().toISOString();
    this.error = message;
    await this.save();
  }

  /**
   * @returns {AsyncJob<T>}
   */
  toJSON() {
    return {
      topic: this.topic,
      name: this.name,
      error: this.error,
      state: this.state,
      startTime: this.startTime,
      endTime: this.endTime,
      cancelled: this.cancelled,
      progress: this.progress,
      data: this.data,
    };
  }

  /**
   * @returns {Response}
   */
  toResponse() {
    return new Response(JSON.stringify({
      job: this.toJSON(),
      links: this.links,
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
