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
      // expected attribute name => actual attribute name
      [key: string]: string;
    };
    product: {
      // expected attribute name => actual attribute name
      [key: string]: string;
    }
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
    helixApiKey: string;
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
    linkTypes?: string[];
    host: string;
    params: Record<string, string>;
    headers: Record<string, string>;
    offerVariantURLTemplate?: string;
    attributeOverrides?: AttributeOverrides;
    siteOverrides?: Record<string, Record<string, unknown>>;

    confMap: ConfigMap;
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
    rating?: Rating;
    links?: Link[];

    // not handled currently:
    externalParentId?: string;
    variantSku?: string;
    optionUIDs?: string[];

    // internal use:
    attributeMap: Record<string, string>;
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
    rating?: Rating;

    // internal use:
    attributeMap: Record<string, string>;
  }

  interface Rating {
    // number of ratings
    count?: number;
    // number of reviews
    reviews?: number;
    // rating value
    value: number | string;
    // range of ratings, highest
    best?: number | string;
    // range of ratings, lowest
    worst?: number | string;
  }

  interface Link {
    types: string[];
    sku: string;
    urlKey: string;
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

  interface BatchResult {
    sku: string;
    status: number;
    message?: string;
    paths: Record<string, AdminStatus>;
  };

  interface AdminStatus {
    preview?: AdminResult;
    live?: AdminResult;
  }

  interface AdminResult {
    status: number;
    message?: string;
  }

  interface StorageClient {
    /**
     * Fetches a product by its SKU.
     * @param sku - The SKU of the product.
     * @returns A promise that resolves to the product.
     */
    fetchProduct(sku: string): Promise<Product>;

    /**
     * Saves multiple products.
     * @param products - An array of products to save.
     * @returns A promise that resolves to an array of save results.
     */
    saveProducts(products: Product[]): Promise<Partial<BatchResult>[]>;

    /**
     * Processes a batch of products for saving.
     * @param batch - An array of products.
     * @returns A promise that resolves to an array of batch results.
     */
    storeProductsBatch(batch: Product[]): Promise<Partial<BatchResult>[]>;

    /**
     * Deletes multiple products by their SKUs.
     * @param skus - An array of SKUs of the products to delete.
     * @returns A promise that resolves to an array of deletion results.
     */
    deleteProducts(skus: string[]): Promise<Partial<BatchResult>[]>;

    /**
     * Processes a batch of SKUs for deletion.
     * @param batch - An array of SKUs.
     * @returns A promise that resolves to an array of deletion results.
     */
    deleteProductsBatch(batch: string[]): Promise<Partial<BatchResult>[]>;

    /**
     * Resolves a SKU from a URL key.
     * @param urlKey - The URL key.
     * @returns A promise that resolves to the SKU.
     */
    lookupSku(urlKey: string): Promise<string>;

    /**
     * Resolves a URL key from a SKU.
     * @param sku - The SKU of the product.
     * @returns A promise that resolves to the URL key or undefined.
     */
    lookupUrlKey(sku: string): Promise<string | undefined>;

    /**
     * Lists all products.
     * @returns A promise that resolves to an array of products.
     */
    listAllProducts(): Promise<ProductListItem[]>;
  }
}

export { };