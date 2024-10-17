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

module.exports = {
  root: true,
  extends: '@adobe/helix',
  env: {
    serviceworker: true,
    browser: true, // e.g. for crypto
    es6: true,
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2022,
  },
  overrides: [{
    files: ['test/**/*.js'],
    env: {
      mocha: true,
    },
    rules: {
      'import/no-extraneous-dependencies': ['error', {
        devDependencies: true,
        optionalDependencies: false,
        peerDependencies: false,
      }],
    },
  }],
  rules: {
    // 'import/extensions': [2, 'ignorePackages'],
    'import/prefer-default-export': 0,

    // console.log is the only means of logging in a cloudflare worker
    'no-console': 'off',

    // We have quite a lot of use cases where assignment to function
    // parameters is definitely desirable
    'no-param-reassign': 'off',

    // We use url_key in the catalog
    camelcase: 'off',

    // Allow while (true) infinite loops
    // 'no-constant-condition': ['error', { checkLoops: false }],

    // Quite useful to mark values as unused
    // 'no-underscore-dangle': 'off',
  },
  globals: {
    __rootdir: true,
    __testdir: true,
  },
};
