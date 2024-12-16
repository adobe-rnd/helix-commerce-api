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

/* eslint-disable import/no-extraneous-dependencies, max-len */

import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { JSONTemplate } from '../../../src/templates/json/JSONTemplate.js';
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';
import { createDefaultVariations, createProductVariationFixture } from '../../fixtures/variant.js';
import { createProductFixture } from '../../fixtures/product.js';
import htmlTemplateFromContext from '../../../src/templates/html/index.js';

// Helper function to format price range
function priceRange(min, max) {
  if (min === undefined || max === undefined || min === max) return '';
  return ` - ${min} to ${max}`;
}

describe('Render Product HTML', () => {
  let config;
  let dom;
  let document;
  let product;
  let variations;

  beforeEach(() => {
    product = createProductFixture();
    variations = createDefaultVariations();
    config = {
      host: 'https://example.com',
      matchedPatterns: ['/us/p/{{urlkey}}/{{sku}}'],
      confMap: {},
    };
    // @ts-ignore
    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;
  });

  it('should have the correct <title>', () => {
    const title = document.querySelector('title');
    const expectedTitle = product.metaTitle || product.name;
    assert.strictEqual(title.textContent, expectedTitle, 'Title tag does not match expected value');
  });

  it('should have the correct meta description', () => {
    const metaDescription = document.querySelector('meta[property="description"]');
    const expectedDescription = product.metaDescription;
    assert.strictEqual(metaDescription.getAttribute('content'), expectedDescription, 'Meta description does not match expected value');
  });

  it('should have the correct Open Graph title', () => {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const expectedOGTitle = product.metaTitle || product.name;
    assert.strictEqual(ogTitle.getAttribute('content'), expectedOGTitle, 'Open Graph title does not match expected value');
  });

  it('should have the correct Twitter description', () => {
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const expectedDescription = product.metaDescription;
    assert.strictEqual(twitterDescription.getAttribute('content'), expectedDescription, 'Twitter description does not match expected value');
  });

  it('should have the correct JSON-LD schema with variants', () => {
    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
    assert.ok(jsonLdScript, 'JSON-LD script tag should exist');
    // @ts-ignore
    const productTemplate = new JSONTemplate(DEFAULT_CONTEXT({ config }), product, variations);

    const jsonLd = JSON.parse(jsonLdScript.textContent);
    assert.strictEqual(jsonLd['@type'], 'Product', 'JSON-LD @type should be Product');
    assert.strictEqual(jsonLd['@id'], productTemplate.constructProductURL(), 'JSON-LD @id does not match product URL');
    assert.strictEqual(jsonLd.name, product.name, 'JSON-LD name does not match product name');
    assert.strictEqual(jsonLd.sku, product.sku, 'JSON-LD SKU does not match product SKU');
    assert.strictEqual(jsonLd.description, product.metaDescription, 'JSON-LD description does not match product description');
    assert.strictEqual(jsonLd.image, product.images[0]?.url || '', 'JSON-LD image does not match product image');
    assert.strictEqual(jsonLd.productID, product.sku, 'JSON-LD productID does not match product SKU');
    assert.ok(Array.isArray(jsonLd.offers), 'JSON-LD offers should be an array');
    assert.strictEqual(jsonLd.offers.length, variations.length, 'JSON-LD offers length does not match number of variants');

    jsonLd.offers.forEach((offer, index) => {
      const variant = variations[index];
      assert.strictEqual(offer['@type'], 'Offer', `Offer type for variant ${variant.sku} should be Offer`);
      assert.strictEqual(offer.sku, variant.sku, `Offer SKU for variant ${variant.sku} does not match`);
      assert.strictEqual(offer.url, productTemplate.constructProductURL(variant), 'JSON-LD offer URL does not match');
      assert.strictEqual(offer.price, variant.prices.final.amount, `Offer price for variant ${variant.sku} does not match`);
      assert.strictEqual(offer.priceCurrency, variant.prices.final.currency, `Offer priceCurrency for variant ${variant.sku} does not match`);
      assert.strictEqual(offer.availability, variant.inStock ? 'InStock' : 'OutOfStock', `Offer availability for variant ${variant.sku} does not match`);
      assert.strictEqual(offer.image, variant.images[0].url || '', `Offer image for variant ${variant.sku} does not match`);
      assert.strictEqual(offer.priceSpecification, undefined, 'Offer contains priceSpecification for variant when it should not');
    });
  });

  it('should have the correct JSON-LD schema without variants (simple product)', () => {
    variations = undefined;
    product.specialToDate = '2024-12-31';

    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');

    // @ts-ignore
    const productTemplate = new JSONTemplate(DEFAULT_CONTEXT({ config }), product, undefined);

    const jsonLd = JSON.parse(jsonLdScript.textContent);
    assert.strictEqual(jsonLd['@type'], 'Product', 'JSON-LD @type should be Product');
    assert.strictEqual(jsonLd['@id'], productTemplate.constructProductURL(), 'JSON-LD @id does not match product URL');
    assert.strictEqual(jsonLd.name, product.name, 'JSON-LD name does not match product name');
    assert.strictEqual(jsonLd.sku, product.sku, 'JSON-LD SKU does not match product SKU');
    assert.strictEqual(jsonLd.description, product.metaDescription, 'JSON-LD description does not match product description');
    assert.strictEqual(jsonLd.image, product.images[0]?.url || '', 'JSON-LD image does not match product image');
    assert.strictEqual(jsonLd.productID, product.sku, 'JSON-LD productID does not match product SKU');
    assert.ok(Array.isArray(jsonLd.offers), 'JSON-LD offers should be an array');
    assert.strictEqual(jsonLd.offers.length, 1, 'JSON-LD offers length does not match number of variants');
    jsonLd.offers.forEach((offer) => {
      assert.strictEqual(offer['@type'], 'Offer', `Offer type for variant ${product.sku} should be Offer`);
      assert.strictEqual(offer.sku, product.sku, `Offer SKU for variant ${product.sku} does not match`);
      assert.strictEqual(offer.url, productTemplate.constructProductURL(), 'JSON-LD offer URL does not match');
      assert.strictEqual(offer.price, product.prices.final.amount, `Offer price for variant ${product.sku} does not match`);
      assert.strictEqual(offer.priceCurrency, product.prices.final.currency, `Offer priceCurrency for variant ${product.sku} does not match`);
      assert.strictEqual(offer.availability, product.inStock ? 'InStock' : 'OutOfStock', `Offer availability for variant ${product.sku} does not match`);
      assert.strictEqual(offer.image, product.images[0].url || '', `Offer image for variant ${product.sku} does not match`);
      assert.strictEqual(offer.priceSpecification, undefined, 'Offer contains priceSpecification for variant when it should not');
      assert.strictEqual(offer.priceValidUntil, '2024-12-31', 'Offer does not contain priceValidUntil for variant');
    });
  });

  it('should have the correct JSON-LD schema with attribute overrides', () => {
    variations = [
      createProductVariationFixture({ attributes: [{ name: 'gtin', value: '123' }] }),
      createProductVariationFixture({ attributes: [{ name: 'gtin', value: '456' }] }),
    ];
    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(jsonLdScript.textContent);

    jsonLd.offers.forEach((offer, index) => {
      const variant = variations[index];
      assert.strictEqual(offer.gtin, variant.attributeMap.gtin, `Offer gtin for variant ${variant.sku} does not match`);
    });
  });

  it('should have the correct JSON-LD schema with custom offer pattern', () => {
    config.confMap = {
      '/us/p/{{urlkey}}/{{sku}}': {
        offerVariantURLTemplate: '/us/p/{{urlkey}}?selected_product={{sku}}',
      },
    };
    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(jsonLdScript.textContent);

    assert.strictEqual(jsonLd.offers[0].url, 'https://example.com/us/p/test-product-url-key?selected_product=test-sku-1', 'JSON-LD offer URL does not match');
    assert.strictEqual(jsonLd.offers[1].url, 'https://example.com/us/p/test-product-url-key?selected_product=test-sku-2', 'JSON-LD offer URL does not match');
    assert.strictEqual(jsonLd.offers[2].url, 'https://example.com/us/p/test-product-url-key?selected_product=test-sku-3', 'JSON-LD offer URL does not match');
  });

  it('should have the correct JSON-LD schema with specialToDate', () => {
    config.confMap = {
      '/us/p/{{urlkey}}/{{sku}}': {},
    };
    variations.forEach((variant) => {
      variant.specialToDate = '2024-12-31';
    });
    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(jsonLdScript.textContent);

    jsonLd.offers.forEach((offer) => {
      assert.strictEqual(offer.priceValidUntil, '2024-12-31', 'Invalid priceValidUntil for variant');
    });
  });

  it('JSON-LD should contain priceSpecification if variant is on sale', () => {
    config.confMap = {
      '/us/p/{{urlkey}}/{{sku}}': {},
    };
    variations.forEach((variant) => {
      variant.prices = {
        regular: {
          amount: 29.99,
          currency: 'USD',
          maximumAmount: 29.99,
          minimumAmount: 29.99,
        },
        final: {
          amount: 14.99,
          currency: 'USD',
          maximumAmount: 14.99,
          minimumAmount: 14.99,
        },
      };
    });
    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(jsonLdScript.textContent);

    jsonLd.offers.forEach((offer) => {
      assert.strictEqual(offer.priceSpecification['@type'], 'UnitPriceSpecification', 'Invalid ListPrice @type for variant');
      assert.strictEqual(offer.priceSpecification.priceType, 'https://schema.org/ListPrice', 'Invalid ListPrice priceType for variant');
      assert.strictEqual(offer.priceSpecification.price, 29.99, 'Invalid ListPrice price for variant');
      assert.strictEqual(offer.priceSpecification.priceCurrency, 'USD', 'Invalid ListPrice priceCurrency for variant');
    });
  });

  it('should not render product options table if there are none', () => {
    product.options = [];
    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const optionsTable = document.querySelector('.product-options');
    assert.strictEqual(optionsTable, null, 'Options table should not be rendered');
  });

  it('should not render product variants table if there are none', () => {
    variations = [];
    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const variantsTable = document.querySelector('.product-variants');
    assert.strictEqual(variantsTable, null, 'Variants table should not be rendered');
  });

  it('should not render variant attributes table if there are none', () => {
    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, []).render();
    dom = new JSDOM(html);
    document = dom.window.document;
    const variantAttributesTable = document.querySelector('.variant-attributes');
    assert.strictEqual(variantAttributesTable, null, 'Variant attributes table should not be rendered');
  });

  it('template should allow for missing prices', () => {
    config.confMap = {
      '/us/p/{{urlkey}}/{{sku}}': {},
    };

    product.prices = undefined;
    variations.forEach((variant) => {
      variant.prices = undefined;
    });

    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const metaPriceAmount = document.querySelector('meta[property="product:price.amount"]');
    assert.strictEqual(metaPriceAmount.getAttribute('content'), 'undefined', 'meta[property="product:price:amount"] should be undefined');

    const metaPriceCurrency = document.querySelector('meta[property="product:price.currency"]');
    assert.strictEqual(metaPriceCurrency.getAttribute('content'), 'undefined', 'meta[property="product:price.currency"] should be undefined');

    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(jsonLdScript.textContent);

    jsonLd.offers.forEach((offer) => {
      assert.strictEqual(offer.price, undefined, 'price should be undefined');
      assert.strictEqual(offer.priceCurrency, undefined, 'priceCurrency should be undefined');
      assert.strictEqual(offer.priceSpecification, undefined, 'priceSpecification should be undefined');
    });
  });

  it('should display the correct product name in <h1>', () => {
    const h1 = document.querySelector('h1');
    assert.strictEqual(h1.textContent, product.name, '<h1> content does not match product name');
  });

  it('should display the correct product description in <p>', () => {
    const p = document.querySelector('main > div > p');
    assert.strictEqual(p.textContent, product.description, '<p> content does not match product description');
  });

  it('should display all product images correctly', () => {
    const productImages = document.querySelectorAll('.product-images img');
    assert.strictEqual(productImages.length, product.images.length, `Number of product images (${productImages.length}) does not match expected (${product.images.length})`);

    product.images.forEach((img, index) => {
      const renderedImg = productImages[index];
      assert.strictEqual(renderedImg.getAttribute('src'), img.url, `Image ${index + 1} src does not match`);
      assert.strictEqual(renderedImg.getAttribute('alt'), img.label, `Image ${index + 1} alt text does not match`);
    });
  });

  it('should display all product attributes correctly', () => {
    const attributeDivs = document.querySelectorAll('.product-attributes > div');
    assert.strictEqual(attributeDivs.length, product.attributes.length, `Number of product attributes (${attributeDivs.length}) does not match expected (${product.attributes.length})`);

    product.attributes.forEach((attr) => {
      const matchingDiv = Array.from(attributeDivs).find(
        (div) => div.children[0].textContent === attr.name,
      );
      assert.ok(matchingDiv, `Attribute ${attr.name} should exist`);
      assert.strictEqual(matchingDiv.children[1].textContent, attr.label, `Attribute ${attr.name} label does not match`);
      assert.strictEqual(matchingDiv.children[2].textContent, String(attr.value), `Attribute ${attr.name} value does not match`);
    });
  });

  it('should display all product options correctly', () => {
    const optionDivs = document.querySelectorAll('.product-options > div');
    // Calculate the expected number of option divs
    const expectedOptionDivs = product.options.reduce((acc, opt) => acc + 1 + (opt.items ? opt.items.length : 0), 0);
    assert.strictEqual(optionDivs.length, expectedOptionDivs, `Number of product option divs (${optionDivs.length}) does not match expected (${expectedOptionDivs})`);

    product.options.forEach((opt) => {
      // Option container
      const optionContainer = Array.from(optionDivs).find(
        (div) => div.children[0].textContent === opt.id,
      );
      assert.ok(optionContainer, `Option container for ${opt.id} should exist`);
      assert.strictEqual(optionContainer.children[1].textContent, opt.label, `Option ${opt.id} label does not match`);
      assert.strictEqual(optionContainer.children[2].textContent, opt.typename, `Option ${opt.id} typename does not match`);
      assert.strictEqual(optionContainer.children[3].textContent, opt.type || '', `Option ${opt.id} type does not match`);
      assert.strictEqual(optionContainer.children[4].textContent, opt.multiple ? 'multiple' : '', `Option ${opt.id} multiple attribute does not match`);
      assert.strictEqual(optionContainer.children[5].textContent, opt.required ? 'required' : '', `Option ${opt.id} required attribute does not match`);

      // Option items
      if (opt.items) {
        opt.items.forEach((item) => {
          const itemDiv = Array.from(optionDivs).find(
            (div) => div.children[1].textContent === item.id,
          );
          assert.ok(itemDiv, `Option item with ID ${item.id} should exist`);
          assert.strictEqual(itemDiv.children[2].textContent, item.label, `Option item ${item.id} label does not match`);
          assert.strictEqual(itemDiv.children[3].textContent, item.value || '', `Option item ${item.id} value does not match`);
          assert.strictEqual(itemDiv.children[4].textContent, item.selected ? 'selected' : '', `Option item ${item.id} selected attribute does not match`);
          assert.strictEqual(itemDiv.children[5].textContent, item.inStock ? 'inStock' : '', `Option item ${item.id} inStock attribute does not match`);
        });
      }
    });
  });

  it('should display all product variants correctly', () => {
    const variantDivs = document.querySelectorAll('.product-variants > div');
    assert.strictEqual(variantDivs.length, variations.length, `Number of product variants (${variantDivs.length}) does not match expected (${variations.length})`);

    variations.forEach((variant, index) => {
      const variantDiv = variantDivs[index];

      // SKU
      const variantSKU = variantDiv.querySelector('div:nth-child(1)');
      assert.strictEqual(variantSKU.textContent, variant.sku, `Variant ${index + 1} SKU does not match`);

      // Variant Name
      const variantName = variantDiv.querySelector('div:nth-child(2)');
      assert.strictEqual(variantName.textContent, variant.name, `Variant ${index + 1} name does not match`);

      // Variant Description
      const variantDescription = variantDiv.querySelector('div:nth-child(3)');
      assert.strictEqual(variantDescription.textContent, variant.description, `Variant ${index + 1} description does not match`);

      // Availability
      const variantAvailability = variantDiv.querySelector('div:nth-child(4)');
      assert.strictEqual(
        variantAvailability.textContent,
        variant.inStock ? 'inStock' : '',
        `Variant ${index + 1} availability does not match`,
      );

      // Regular Price
      const variantRegularPrice = variantDiv.querySelector('div:nth-child(5)');
      const expectedRegularPrice = `Regular: ${variant.prices.regular.amount} ${variant.prices.regular.currency}${priceRange(variant.prices.regular.minimumAmount, variant.prices.regular.maximumAmount)}`;
      assert.strictEqual(
        variantRegularPrice.textContent,
        expectedRegularPrice,
        `Variant ${index + 1} regular price does not match`,
      );

      // Final Price
      const variantFinalPrice = variantDiv.querySelector('div:nth-child(6)');
      const expectedFinalPrice = `Final: ${variant.prices.final.amount} ${variant.prices.final.currency}${priceRange(variant.prices.final.minimumAmount, variant.prices.final.maximumAmount)}`;
      assert.strictEqual(
        variantFinalPrice.textContent,
        expectedFinalPrice,
        `Variant ${index + 1} final price does not match`,
      );

      // Variant Images
      const variantImages = variantDiv.querySelectorAll('picture img');
      assert.strictEqual(
        variantImages.length,
        variant.images.length,
        `Variant ${index + 1} should have ${variant.images.length} images`,
      );
      variant.images.forEach((img, imgIndex) => {
        const renderedImg = variantImages[imgIndex];
        assert.strictEqual(renderedImg.getAttribute('src'), img.url, `Variant ${index + 1} Image ${imgIndex + 1} src does not match`);
        assert.strictEqual(renderedImg.getAttribute('alt'), img.label, `Variant ${index + 1} Image ${imgIndex + 1} alt text does not match`);
      });

      // Selections
      const variantSelections = variantDiv.querySelector('div:nth-child(8)');
      assert.strictEqual(
        variantSelections.textContent,
        variant.selections.join(', '),
        `Variant ${index + 1} selections do not match`,
      );
    });
  });

  it('should display all variant attributes correctly', () => {
    const variantAttributeDivs = document.querySelectorAll('.variant-attributes > div');

    variations.forEach((variant) => {
      // SKU Header
      const skuHeaderDiv = Array.from(variantAttributeDivs).find(
        (div) => div.children[0].textContent === 'sku' && div.children[1].textContent === variant.sku,
      );
      assert.ok(skuHeaderDiv, `Variant attribute header for SKU ${variant.sku} should exist`);

      // Variant Attributes
      variant.attributes.forEach((attr) => {
        const matchingDiv = Array.from(variantAttributeDivs).find(
          (div) => div.children[1].textContent === attr.name && div.children[0].textContent === 'attribute',
        );
        assert.ok(matchingDiv, `Variant attribute ${attr.name} should exist`);
        assert.strictEqual(matchingDiv.children[2].textContent, attr.label, `Variant attribute ${attr.name} label does not match`);
        assert.strictEqual(matchingDiv.children[3].textContent, String(attr.value), `Variant attribute ${attr.name} value does not match`);
      });
    });
  });

  it('should allow imageParam overrides from config', () => {
    config.imageParams = { foo: 'bar', baz: 'qux' };

    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const ogImage = document.querySelector('meta[name="image"]');
    assert.strictEqual(ogImage.getAttribute('content'), 'https://www.example.com/media/catalog/product/t/s/test-sku.png?foo=bar&baz=qux');
  });

  it('should handle invalid image url with overrides', () => {
    config.imageParams = { foo: 'bar' };
    product.images[0].url = '/media/catalog/product/t/s/test-sku.png'; // only a path

    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();
    dom = new JSDOM(html);
    document = dom.window.document;

    const ogImage = document.querySelector('meta[name="image"]');
    assert.strictEqual(ogImage.getAttribute('content'), '/media/catalog/product/t/s/test-sku.png');
  });

  it('should allow for undefined lastModifiedAt', () => {
    product.lastModifiedAt = undefined;

    const html = htmlTemplateFromContext(DEFAULT_CONTEXT({ config }), product, variations).render();

    dom = new JSDOM(html);
    document = dom.window.document;

    const metaProductLastModified = document.querySelector('meta[name="lastModifiedAtCS"]');
    assert.strictEqual(metaProductLastModified.getAttribute('content'), 'undefined', 'meta[name="lastModifiedAtCS"] should be undefined');
  });
});
