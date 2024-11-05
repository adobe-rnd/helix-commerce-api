import type { ExecutionContext, KVNamespace } from "@cloudflare/workers-types/experimental";
import type { HTMLTemplate } from "./templates/html/HTMLTemplate.js";
import { JSONTemplate } from "./templates/json/JSONTemplate.js";

declare global {
  /**
   * { pathPattern => Config }
   */
  export type ConfigMap = Record<string, Config>;

  export interface AttributeOverrides {
    variant: {
      [key: string]: string;
    };
  }

  /**
   * Resolved config object
   */
  export interface Config {
    org: string;
    site: string;
    siteKey: string;
    route: string;
    pageType: 'product' | string;
    origin?: string;
    apiKey: string;
    magentoEnvironmentId: string;
    magentoWebsiteCode: string;
    storeViewCode: string;
    storeCode: string;
    coreEndpoint: string;
    catalogSource: string
    catalogEndpoint?: string;
    sku?: string;
    matchedPatterns: string[];
    imageRoles?: string[];

    confMap: ConfigMap;
    params: Record<string, string>;
    headers: Record<string, string>;
    host: string;
    offerVariantURLTemplate: string;
    attributeOverrides: AttributeOverrides;
    siteOverrides: Record<string, Record<string, unknown>>;
  }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;

    // KV namespaces
    CONFIGS: KVNamespace<string>;

    [key: string]: string | KVNamespace<string> | R2Bucket;
  }

  export interface Context extends ExecutionContext {
    url: URL;
    env: Env;
    log: Console;
    config: Config;
    info: {
      method: string;
      headers: Record<string, string>;
    }
    attributes: {
      htmlTemplate?: HTMLTemplate;
      jsonTemplate?: JSONTemplate;
      [key: string]: any;
    }
  }

  export interface Product {
    name: string;
    sku: string;
    addToCartAllowed: boolean;
    inStock: boolean | null;
    shortDescription?: string;
    metaDescription?: string;
    metaKeyword?: string;
    metaTitle?: string;
    description?: string;
    images: Image[];
    prices: Prices;
    attributes: Attribute[];
    options: ProductOption[];
    url?: string;
    urlKey?: string;
    externalId?: string;
    variants?: Variant[]; // variants exist on products in helix commerce but not on magento
    specialToDate?: string;

    // not handled currently:
    externalParentId?: string;
    variantSku?: string;
    reviewCount?: number;
    ratingValue?: number;
    optionUIDs?: string[];
  }

  export interface Variant {
    sku: string;
    name: string;
    description?: string;
    url: string;
    inStock: boolean;
    images: Image[];
    prices: Pick<Prices, 'regular' | 'final'>;
    selections: string[];
    attributes: Attribute[];
    externalId: string;
    specialToDate?: string;
    gtin?: string;
  }

  interface Image {
    url: string;
    label: string;
  }

  interface Price {
    amount?: number;
    currency?: string;
    maximumAmount?: number;
    minimumAmount?: number;
    variant?: 'default' | 'strikethrough';
  }

  interface Prices {
    regular: Price;
    final: Price;
    visible: boolean;
  }

  export interface ProductOption {
    id: string;
    type: 'text' | 'image' | 'color' | 'dropdown';
    typename:
    | 'ProductViewOptionValueProduct'
    | 'ProductViewOptionValueSwatch'
    | 'ProductViewOptionValueConfiguration';
    label: string;
    required: boolean;
    multiple: boolean;
    items: OptionValue[];
  }

  interface OptionValue {
    id: string;
    label: string;
    inStock: boolean;
    value: string;
    selected: boolean;
    product?: {
      name: string;
      sku: string;
      prices?: Prices;
    };
  }

  interface Attribute {
    name: string;
    label: string;
    value: string;
  }

  // === util types ===

  export type PickStartsWith<T extends object, S extends string> = {
    [K in keyof T as K extends `${S}${infer R}` ? K : never]: T[K]
  }

}

export { };