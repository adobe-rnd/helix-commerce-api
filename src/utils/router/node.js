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
const NodeType = {
  LITERAL: 1,
  VARIABLE: 2,
  PATH: 3,
};

/**
 * Node in the router tree, either intermediate or leaf.
 */
export class Node {
  /**
   * Label for this node.
   */
  #label;

  /**
   * Type of node.
   */
  #type;

  /**
   * Parent for this node.
   */
  #parent;

  /**
   * Literal children of this node.
   */
  #children;

  /**
   * Star node (i.e. `/*`)
   */
  #star;

  /**
   * Variable node (e.g. `/:org`)
   */
  #variable;

  /**
   * Route associated with node, null for intermediate leafs.
   */
  #route;

  constructor(label, type = NodeType.LITERAL, parent = undefined) {
    this.#label = label;
    this.#type = type;
    this.#parent = parent;
    this.#children = [];
  }

  #getOrCreateChild(seg) {
    if (seg === '*') {
      if (!this.#star) {
        this.#star = new Node(seg, NodeType.PATH, this);
      }
      return this.#star;
    }
    if (seg.startsWith(':')) {
      if (!this.#variable) {
        this.#variable = new Node(seg.substring(1), NodeType.VARIABLE, this);
      }
      return this.#variable;
    }
    let ret = this.#children.find((child) => child.#label === seg);
    if (!ret) {
      ret = new Node(seg, NodeType.LITERAL, this);
      this.#children.push(ret);
    }
    return ret;
  }

  add(segs, route) {
    if (segs.length === 0) {
      this.#route = route;
      return this;
    } else {
      const seg = segs.shift();
      return this.#getOrCreateChild(seg).add(segs, route);
    }
  }

  get route() {
    return this.#route;
  }

  /**
   * Matches a path by traversing a tree of nodes.
   *
   * @param {string[]} segs path segments to match
   * @param {Map} variables variables extracted while matching
   * @returns {Node} matching node or null
   */
  match(segs, variables) {
    if (segs.length === 0) {
      return this;
    }
    const seg = segs.shift();

    // find exact match
    const next = this.#children.find((child) => child.#label === seg);
    if (next) {
      return next.match(segs, variables);
    }

    // use variable extracting match (e.g. ':org')
    if (this.#variable) {
      const key = this.#variable.#label;
      variables.set(key, seg);
      return this.#variable.match(segs, variables);
    }

    // use trailing '*' match
    if (this.#star) {
      segs.unshift(seg);
      variables.set('path', `/${segs.join('/')}`);
      return this.#star;
    }
    return null;
  }

  /**
   * Returns the external path by traversing from a leaf back
   * to the root.
   *
   * @param {string[]} segs path segments to collect
   * @param {Object<string, string>} variables variables
   * @returns {void}
   */
  external(segs, variables) {
    const label = this.#label;

    switch (this.#type) {
      case NodeType.LITERAL:
        segs.unshift(label);
        break;
      case NodeType.VARIABLE:
        segs.unshift(variables[label]);
        break;
      case NodeType.PATH: {
        // Remove leading slash from path to avoid double slashes
        const path = variables.path?.startsWith('/') ? variables.path.substring(1) : variables.path;
        segs.unshift(path);
        break;
      }
      /* c8 ignore next 2 */
      default:
        break;
    }
    this.#parent?.external(segs, variables);
  }
}
