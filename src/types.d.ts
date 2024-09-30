import type { ExecutionContext, KVNamespace } from "@cloudflare/workers-types/experimental";

declare global {
  export interface Config {
    pageType: 'product' | string;
    origin?: string;
    apiKey: string;
    magentoEnvironmentId: string;
    magentoWebsiteCode: string;
    magentoStoreViewCode: string;
    magentoStoreCode: string;
    coreEndpoint: string;
    catalogEndpoint?: string;
    params: Record<string, string>;
    headers: Record<string, string>;
  }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;

    // KV namespaces
    CONFIGS: KVNamespace<string>;

    [key: string]: string | KVNamespace<string>;
  }

  export interface Context extends ExecutionContext {
    url: URL;
    env: Env;
    log: Console;
    info: {
      method: string;
      headers: Record<string, string>;
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

    // not handled currently:
    externalParentId?: string;
    variantSku?: string;
    reviewCount?: number;
    ratingValue?: number;
    optionUIDs?: string[];
  }

  export interface Variant {
    sku: string;
    url: string;
    inStock: boolean;
    images: Image[];
    prices: Pick<Prices, 'regular' | 'final'>;
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
}

export { };