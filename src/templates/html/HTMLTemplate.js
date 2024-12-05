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

/* eslint-disable class-methods-use-this */

import { findProductImage } from '../../utils/product.js';
import jsonTemplateFromContext from '../json/index.js';

export class HTMLTemplate {
  /**
   * Create a meta tag with a name attribute
   * @param {string} name
   * @param {string|boolean|number|undefined|null} [content]
   * @returns {string}
   */
  static metaName = (name, content) => (content ? `<meta name="${name}" content="${content}">` : '');

  /**
   * Create a meta tag with a property attribute
   * @param {string} name
   * @param {string|boolean|number|undefined|null} [content]
   * @returns {string}
   */
  static metaProperty = (name, content) => `<meta property="${name}" content="${content}">`;

  /**
   * Create a price range string
   * @param {number|undefined} min
   * @param {number|undefined} max
   * @returns {string}
   */
  static priceRange = (min, max) => (min !== max ? ` (${min} - ${max})` : '');

  /**
   * @param {string} str
   * @param {number} spaces
   * @returns {string}
   */
  static indent = (str, spaces) => str.split('\n').map((line) => `${' '.repeat(spaces)}${line}`).join('\n');

  /** @type {Context} */
  ctx = undefined;

  /** @type {Product} */
  product = undefined;

  /** @type {Variant[]} */
  variants = undefined;

  /** @type {Image} */
  image = undefined;

  /**
   * @param {Context} ctx
   * @param {Product} product
   * @param {Variant[]} variants
   */
  constructor(ctx, product, variants) {
    this.ctx = ctx;
    this.product = product;
    this.variants = variants;
    this.image = this.constructImage(findProductImage(product, variants));
  }

  /**
   * Create the document meta tags
   * @returns {string}
   */
  renderDocumentMetaTags() {
    const { product } = this;
    return /* html */ `\
<meta charset="UTF-8">
<title>${product.metaTitle || product.name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${HTMLTemplate.metaProperty('description', product.metaDescription)}
${HTMLTemplate.metaName('keywords', product.metaKeyword)}`;
  }

  /**
   * Create the Open Graph meta tags
   * @returns {string}
   */
  renderOpenGraphMetaTags() {
    const { product, image } = this;
    return /* html */`\
${HTMLTemplate.metaProperty('og:title', product.metaTitle || product.name)}
${HTMLTemplate.metaProperty('og:image', image?.url)}
${HTMLTemplate.metaProperty('og:image:secure_url', image?.url)}
${HTMLTemplate.metaProperty('og:type', 'product')}
${HTMLTemplate.metaName('image', image?.url)}`; // html2md will treat this as the og:image
  }

  /**
   * Create the Twitter meta tags
   * @returns {string}
   */
  renderTwitterMetaTags() {
    const { product, image } = this;
    return /* html */ `\
${HTMLTemplate.metaName('twitter:card', 'summary_large_image')}
${HTMLTemplate.metaName('twitter:title', product.name)}
${HTMLTemplate.metaName('twitter:image', image?.url)}
${HTMLTemplate.metaName('twitter:description', product.metaDescription)}
${HTMLTemplate.metaName('twitter:label1', 'Price')}
${HTMLTemplate.metaName('twitter:data1', product.prices?.final?.amount)}
${HTMLTemplate.metaName('twitter:label2', 'Availability')}
${HTMLTemplate.metaName('twitter:data2', product.inStock ? 'In stock' : 'Out of stock')}`;
  }

  /**
   * Create the Commerce meta tags
   * @returns {string}
   */
  renderCommerceMetaTags() {
    const { product } = this;
    return /* html */ `\
${HTMLTemplate.metaName('sku', product.sku)}
${HTMLTemplate.metaName('urlKey', product.urlKey)}
${HTMLTemplate.metaName('externalId', product.externalId)}
${HTMLTemplate.metaName('addToCartAllowed', product.addToCartAllowed)}
${HTMLTemplate.metaName('inStock', product.inStock ? 'true' : 'false')}
${HTMLTemplate.metaProperty('product:availability', product.inStock ? 'In stock' : 'Out of stock')}
${HTMLTemplate.metaProperty('product:price.amount', product.prices?.final?.amount)}
${HTMLTemplate.metaProperty('product:price.currency', product.prices?.final?.currency)}`;
  }

  /**
   * Create the Helix dependencies script tags
   * @returns {string}
   */
  renderHelixDependencies() {
    return /* html */ `\
<script src="/scripts/aem.js" type="module"></script>
<script src="/scripts/scripts.js" type="module"></script>
<link rel="stylesheet" href="/styles/styles.css">`;
  }

  /**
   * Create the JSON-LD script tag
   * @returns {string}
   */
  renderJSONLD() {
    const jsonTemplate = jsonTemplateFromContext(this.ctx, this.product, this.variants);
    return /* html */ `\
<script type="application/ld+json">
  ${jsonTemplate.render()}
</script>`;
  }

  /**
   * Create the head tags
   * @returns {string}
   */
  renderHead() {
    return /* html */ `\
<head>
${HTMLTemplate.indent(this.renderDocumentMetaTags(), 2)}
${HTMLTemplate.indent(this.renderOpenGraphMetaTags(), 2)}
${HTMLTemplate.indent(this.renderTwitterMetaTags(), 2)}
${HTMLTemplate.indent(this.renderCommerceMetaTags(), 2)}
${HTMLTemplate.indent(this.renderHelixDependencies(), 2)}
${HTMLTemplate.indent(this.renderJSONLD(), 2)}
</head>`;
  }

  /**
   * Create the product images
   * @param {Image[]} images
   * @returns {string}
   */
  renderProductImages(images) {
    return /* html */ `\
<div class="product-images">
  <div>
    ${images.map(this.constructImage.bind(this))
    .filter((img) => Boolean(img))
    .map((img) => /* html */ `\
      <div>
        <picture>
          <source type="image/webp" srcset="${img.url}" alt="" media="(min-width: 600px)">
          <source type="image/webp" srcset="${img.url}">
          <source type="image/png" srcset="${img.url}" media="(min-width: 600px)">
          <img loading="lazy" alt="${img.label}" src="${img.url}">
        </picture>
      </div>`)
    .join('\n')}
  </div>
</div>`;
  }

  /**
   * Create the product attributes
   * @param {Attribute[]} attributes
   * @returns {string}
   */
  renderProductAttributes(attributes) {
    return /* html */ `\
<div class="product-attributes">
${attributes.map((attr) => /* html */`\
  <div>
    <div>${attr.name}</div>
    <div>${attr.label}</div>
    <div>${attr.value}</div>
  </div>`).join('\n')}
</div>`;
  }

  /**
   * Create the product items
   * @param {OptionValue[]} items
   * @returns {string}
   */
  renderProductItems(items) {
    return items.map((item) => /* html */`\
<div>
  <div>option</div>
  <div>${item.id}</div>
  <div>${item.label}</div>
  <div>${item.value ?? ''}</div>
  <div>${item.selected ? 'selected' : ''}</div>
  <div>${item.inStock ? 'inStock' : ''}</div>
</div>`).join('\n');
  }

  /**
   * Create the product options
   * @param {ProductOption[]} options
   * @returns {string}
   */
  renderProductOptions(options) {
    return options.length > 0 ? /* html */ `\
<div class="product-options">
${options.map((opt) => /* html */ `\
  <div>
    <div>${opt.id}</div>
    <div>${opt.label}</div>
    <div>${opt.typename}</div>
    <div>${opt.type ?? ''}</div>
    <div>${opt.multiple ? 'multiple' : ''}</div>
    <div>${opt.required === true ? 'required' : ''}</div>
  </div>
${HTMLTemplate.indent(this.renderProductItems(opt.items), 2)}`).join('\n')}
</div>` : '';
  }

  /**
   * @param {Image} image
   * @returns {Image | null}
   */
  constructImage(image) {
    if (!image || !image.url) {
      return null;
    }

    if (!this.ctx.config.imageParams) {
      return image;
    }

    // append image params
    const { url: purl, label } = image;
    const url = new URL(purl);
    const params = new URLSearchParams(this.ctx.config.imageParams);
    url.search = params.toString();
    return {
      url: url.toString(),
      label,
    };
  }

  /**
   * Create the variant images
   * @param {Image[]} images
   * @returns {string}
   */
  renderVariantImages(images) {
    return images.map(this.constructImage.bind(this))
      .filter((img) => Boolean(img))
      .map((img) => /* html */ `\
<picture>
  <source type="image/webp" srcset="${img.url}" alt="" media="(min-width: 600px)">
  <source type="image/webp" srcset="${img.url}">
  <source type="image/png" srcset="${img.url}" media="(min-width: 600px)">
  <img loading="lazy" alt="${img.label}" src="${img.url}">
</picture>`)
      .join('\n');
  }

  /**
   * Create the variant prices
   * @param {Pick<Prices, 'regular' | 'final'>} prices
   * @returns {string}
   */
  renderVariantPrices(prices) {
    return /* html */ `\
<div>Regular: ${prices.regular?.amount} ${prices.regular?.currency}${HTMLTemplate.priceRange(prices.regular?.minimumAmount, prices.regular?.maximumAmount)}</div>
<div>Final: ${prices.final?.amount} ${prices.final?.currency}${HTMLTemplate.priceRange(prices.final?.minimumAmount, prices.final?.maximumAmount)}</div>`;
  }

  /**
   * Create the product variants
   * @returns {string}
   */
  renderProductVariants() {
    if (!this.variants || this.variants.length === 0) {
      return '';
    }

    return /* html */ `\
<div class="product-variants">
${this.variants.map((v) => /* html */`\
  <div>
    <div>${v.sku}</div>
    <div>${v.name}</div>
    <div>${v.description}</div>
    <div>${v.inStock ? 'inStock' : ''}</div>
${v.prices ? HTMLTemplate.indent(this.renderVariantPrices(v.prices), 4) : ''}
    <div>
${HTMLTemplate.indent(this.renderVariantImages(v.images), 6)}
    </div>
    <div>${(v.selections ?? []).join(', ')}</div>
  </div>`).join('\n')}
</div>`;
  }

  /**
   * Create the variant attributes
   * @returns {string}
   */
  renderProductVariantsAttributes() {
    if (!this.variants || this.variants.length === 0) {
      return '';
    }

    return /* html */ `\
<div class="variant-attributes">
${this.variants?.map((v) => /* html */`\
  <div>
    <div>sku</div>
    <div>${v.sku}</div>
    <div></div>
    <div></div>
  </div>
  ${v.attributes?.map((attribute) => /* html */`\
    <div>
      <div>attribute</div>
      <div>${attribute.name}</div>
      <div>${attribute.label}</div>
      <div>${attribute.value}</div>
    </div>`).join('\n')}\
`).join('\n')}
</div>`;
  }

  /**
   * @returns {string}
   */
  render() {
    const {
      name,
      description,
      attributes,
      options,
      images,
    } = this.product;

    return /* html */`\
<!DOCTYPE html>
<html>
${HTMLTemplate.indent(this.renderHead(), 2)}
  <body>
    <header></header>
    <main>
      <div>
        <h1>${name}</h1>
        ${description ? `<p>${description}</p>` : ''}
${HTMLTemplate.indent(this.renderProductImages(images), 8)}
${HTMLTemplate.indent(this.renderProductAttributes(attributes), 8)}
${HTMLTemplate.indent(this.renderProductOptions(options), 8)}
${HTMLTemplate.indent(this.renderProductVariants(), 8)}
${HTMLTemplate.indent(this.renderProductVariantsAttributes(), 8)}
      </div>
    </main>
    <footer></footer>
  </body>
</html>`;
  }
}
