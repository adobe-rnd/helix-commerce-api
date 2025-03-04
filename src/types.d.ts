import type { ExecutionContext, KVNamespace } from "@cloudflare/workers-types/experimental";
import type { R2Bucket } from "@cloudflare/workers-types";
import type { HTMLTemplate } from "./templates/html/HTMLTemplate.js";
import type { JSONTemplate } from "./templates/json/JSONTemplate.js";
import type StorageClient from "./routes/products/StorageClient.js";


declare global {

  export type SchemaOrgAvailability = 'BackOrder' | 'Discontinued' | 'InStock' | 'InStoreOnly' | 'LimitedAvailability' | 'MadeToOrder' | 'OnlineOnly' | 'OutOfStock' | 'PreOrder' | 'PreSale' | 'Reserved' | 'SoldOut';

  export interface SchemaOrgAggregateRating {
    ratingValue: number;
    reviewCount: number;
    bestRating?: number;
    worstRating?: number;
  }

  export interface ProductBusPrice {
    final: string;
    currency: string;
    regular?: string;
  }

  export interface ProductBusVariant {
    sku: string;
    title: string;
    price?: ProductBusPrice;
    url: string;
    image: string;
    availability: SchemaOrgAvailability;
    gtin?: string;
  }

  export interface ProductBusImage {
    url: string;
    label?: string;
    roles?: string[];
  }

  /**
   * Helix product-bus entry
   */
  export interface ProductBusEntry {
    /**
     * Product data used to generate markup/json-ld
     */
    sku: string;
    urlKey: string;
    title: string;
    metaTitle?: string;
    description?: string;
    metaDescription?: string;
    url?: string;
    brand?: string;
    aggregateRating?: SchemaOrgAggregateRating;
    availability?: SchemaOrgAvailability;
    images?: ProductBusImage[];
    price?: ProductBusPrice;
    variants?: ProductBusVariant[];

    /**
     * Override "escape hatch" for json-ld
     */
    jsonld?: string;

    /**
     * Additional data that can be retrieved via .json API
     */
    custom?: Record<string, unknown>;
  }

  /**
   * The config for a single path pattern as stored in KV
   */
  export interface RawConfigEntry {
    /**
     * API key for Core and Catalog
     */
    apiKey?: string;

    /**
     * Magento env ID
     */
    magentoEnvironmentId?: string;

    /**
     * Magento website code
     */
    magentoWebsiteCode?: string;

    /**
     * Store code
     */
    storeCode?: string;

    /**
     * Core Commerce endpoint
     */
    coreEndpoint?: string;

    /**
     * Catalog Service endpoint, defaults to non-sandbox
     */
    catalogEndpoint?: string;

    /**
     * Store view code
     */
    storeViewCode?: string;

    /**
     * Sitekey to use for overrides filename
     */
    siteOverridesKey?: string;

    /**
     * Host to use for absolute urls
     */
    host?: string;

    /**
     * API key for Helix, used for preview/publish during Helix Catalog API PUTs
     */
    helixApiKey?: string;

    /**
     * Headers to send with requests to Core and Catalog
     */
    headers?: Record<string, string>;

    /**
     * Image roles to filter by, only include images with these roles
     */
    imageRoles?: string[];

    /**
     * Order for images to appear in markup
     * If not provided, images will not be sorted
     * If image role doesn't exist in the order, it will be appended to the end
     */
    imageRoleOrder?: string[];

    /**
     * Attributes to override using a different attribute name
     */
    attributeOverrides?: AttributeOverrides;

    /**
     * Path pattern to use for offer variant URLs in JSON-LD
     */
    offerVariantURLTemplate?: string;

    /**
     * Additional parameters to add to image URLs as query params.
     */
    imageParams?: Record<string, string>;

    // required for non-base entries
    pageType: 'product' | string;

    /**
     * Attributes to include in the variant attributes table
     */
    variantAttributes?: string[];
  }

  /**
   * The config as stored in KV
   * Each key, other than `base`, is a path pattern
   * Path patterns use `{{arg}}` to denote `arg` as a path parameter
   */
  export type RawConfig = {
    base: RawConfigEntry;
    [key: string]: RawConfigEntry;
  }

  /**
   * { pathPattern => Config }
   * alias
   */
  export type ConfigMap = RawConfig;

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
    imageRoleOrder?: string[];
    linkTypes?: string[];
    host: string;
    params: Record<string, string>;
    headers: Record<string, string>;
    offerVariantURLTemplate?: string;
    attributeOverrides?: AttributeOverrides;
    siteOverrides?: Record<string, Record<string, unknown>>;
    imageParams?: Record<string, string>;
    variantAttributes?: string[];
    liveSearchEnabled?: boolean;
    confMap: ConfigMap;
    confMapStr: string;
  }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;
    SUPERUSER_KEY: string;

    // KV namespaces
    CONFIGS: KVNamespace<string>;
    KEYS: KVNamespace<string>;
    CATALOG_BUCKET: R2Bucket

    [key: string]: string | KVNamespace<string> | R2Bucket;
  }

  export interface Context extends ExecutionContext {
    url: URL;
    env: Env;
    log: Console;
    config: Config;
    request: Request;
    /** parsed from body or query params */
    data: any;
    info: {
      method: string;
      extension: string;
      headers: Record<string, string>;
    }
    attributes: {
      htmlTemplate?: HTMLTemplate;
      jsonTemplate?: JSONTemplate;
      storageClient?: StorageClient;
      key?: string;
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

    // Coming only from Catalog Service at the time of writing:
    lastModifiedAt?: string;

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
    prices: Prices;
  }

  interface Image {
    url: string;
    label: string;
    roles: string[];
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
    type: string;
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
}

export { };