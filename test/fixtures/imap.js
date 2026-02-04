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

import { EventEmitter } from 'node:events';
// eslint-disable-next-line import/no-extraneous-dependencies
import Imap from 'imap';
// eslint-disable-next-line import/no-extraneous-dependencies
import { simpleParser } from 'mailparser';

/**
 * @typedef {Object} IMAPListenerConfig
 * @property {string} email - Email address
 * @property {string} password - App password
 * @property {string} [host='imap.gmail.com'] - IMAP host
 * @property {number} [port=993] - IMAP port
 * @property {boolean} [tls=true] - Use TLS
 * @property {number} [pollInterval=2000] - Poll interval in ms
 */

/**
 * @typedef {(
 *   email: {sender: string, recipient: string, subject: string, body: string}
 * ) => boolean} OnEmailCallback
 */

/**
 * IMAP Email Listener for testing
 * @extends EventEmitter
 */
export class IMAPListener extends EventEmitter {
  /**
   * @param {IMAPListenerConfig} config
   */
  constructor(config) {
    super();

    this.config = {
      host: config.host || 'imap.gmail.com',
      port: config.port || 993,
      tls: config.tls !== undefined ? config.tls : true,
      pollInterval: config.pollInterval || 2000,
      user: config.email,
      password: config.password,
    };

    this.imap = null;
    this.polling = false;
    this.pollTimer = null;
    this.seenUids = new Set();
  }

  /**
   * Start polling for emails
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.polling) {
      throw new Error('Already polling');
    }

    this.polling = true;
    await this.#connect();
    this.#startPolling();
    this.emit('started');
  }

  /**
   * Stop polling for emails
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.polling) {
      return;
    }

    this.polling = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.imap) {
      await new Promise((resolve) => {
        this.imap.once('end', resolve);
        this.imap.end();
      });
      this.imap = null;
    }

    this.emit('stopped');
  }

  /**
   * Wait for an email matching the callback criteria
   *
   * @param {OnEmailCallback} callback - returns true if email matches
   * @param {number} [timeout=30000] - timeout in milliseconds
   * @returns {Promise<{sender: string, recipient: string, subject: string, body: string}>}
   */
  async onEmail(callback, timeout = 30000) {
    return new Promise((resolve, reject) => {
      let timeoutId;

      const emailHandler = (email) => {
        try {
          const matches = callback(email);
          if (matches) {
            clearTimeout(timeoutId);
            this.removeListener('email', emailHandler);
            resolve(email);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          this.removeListener('email', emailHandler);
          reject(error);
        }
      };

      timeoutId = setTimeout(() => {
        this.removeListener('email', emailHandler);
        reject(new Error(`Timeout waiting for email after ${timeout}ms`));
      }, timeout);

      this.on('email', emailHandler);
    });
  }

  /**
   * Connect to IMAP server
   *
   * @returns {Promise<void>}
   */
  #connect() {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: { rejectUnauthorized: false },
      });

      this.imap.once('ready', () => {
        this.emit('connected');
        resolve();
      });

      this.imap.once('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.imap.connect();
    });
  }

  /**
   * Start polling for new emails
   */
  #startPolling() {
    const poll = async () => {
      if (!this.polling) {
        return;
      }

      try {
        await this.#checkForNewEmails();
      } catch (error) {
        this.emit('error', error);
      }

      if (this.polling) {
        this.pollTimer = setTimeout(poll, this.config.pollInterval);
      }
    };

    poll();
  }

  /**
   * Check for new emails
   *
   * @returns {Promise<void>}
   */
  #checkForNewEmails() {
    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err, _box) => {
        if (err) {
          reject(err);
          return;
        }

        // Search for unseen messages
        this.imap.search(['UNSEEN'], (searchErr, uids) => {
          if (searchErr) {
            reject(searchErr);
            return;
          }

          if (!uids || uids.length === 0) {
            resolve();
            return;
          }

          // Filter out already seen UIDs
          const newUids = uids.filter((uid) => !this.seenUids.has(uid));
          if (newUids.length === 0) {
            resolve();
            return;
          }

          const fetch = this.imap.fetch(newUids, {
            bodies: '',
            markSeen: true,
          });

          const emails = [];

          fetch.on('message', (msg) => {
            let emailData = '';

            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                emailData += chunk.toString('utf8');
              });
            });

            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(emailData);

                // @ts-ignore - mailparser types
                const fromAddress = parsed.from?.text || parsed.from?.value?.[0]?.address || '';
                // @ts-ignore - mailparser types
                const toAddress = parsed.to?.text || parsed.to?.value?.[0]?.address || '';

                const email = {
                  sender: fromAddress,
                  recipient: toAddress,
                  subject: parsed.subject || '',
                  body: parsed.html || parsed.text || '',
                  date: parsed.date,
                  messageId: parsed.messageId,
                };

                emails.push(email);
              } catch (parseErr) {
                this.emit('error', parseErr);
              }
            });
          });

          fetch.once('error', (fetchErr) => {
            reject(fetchErr);
          });

          fetch.once('end', () => {
            // Mark these UIDs as seen
            newUids.forEach((uid) => this.seenUids.add(uid));

            // Emit email events
            emails.forEach((email) => {
              this.emit('email', email);
            });

            resolve();
          });
        });
      });
    });
  }
}

/**
 * Create an IMAP listener for testing
 * @param {IMAPListenerConfig} config - Configuration object
 * @returns {IMAPListener}
 */
export function createImapListener(config) {
  return new IMAPListener(config);
}
