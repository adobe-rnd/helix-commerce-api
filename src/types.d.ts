import type { ExecutionContext, KVNamespace } from "@cloudflare/workers-types/experimental";
import type { R2Bucket } from "@cloudflare/workers-types";
import type { HTMLTemplate } from "./templates/html/HTMLTemplate.js";
import type { JSONTemplate } from "./templates/json/JSONTemplate.js";
import type StorageClient from "./routes/products/StorageClient.js";


declare global {

  export type SchemaOrgAvailability = 'BackOrder' | 'Discontinued' | 'InStock' | 'InStoreOnly' | 'LimitedAvailability' | 'MadeToOrder' | 'OnlineOnly' | 'OutOfStock' | 'PreOrder' | 'PreSale' | 'Reserved' | 'SoldOut';

  export type SchemaOrgItemCondition = 'DamagedCondition' | 'NewCondition' | 'RefurbishedCondition' | 'UsedCondition';

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
    name: string;
    price?: ProductBusPrice;
    url: string;
    images: ProductBusImage[];
    availability: SchemaOrgAvailability;
    gtin?: string;
    description?: string;
    itemCondition?: SchemaOrgItemCondition;
    custom?: Record<string, unknown>;
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
    name: string; // used for product name in json-ld
    metaTitle?: string; // used for title in markup meta tag
    description?: string;
    metaDescription?: string;
    url?: string;
    brand?: string;
    itemCondition?: SchemaOrgItemCondition;
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

  export interface Context {
    url: URL;
    env: Env;
    log: Console;
    config: Config;
    /** parsed from body or query params */
    data: any;
    info: {
      filename: string;
      method: string;
      extension: string | undefined;
      headers: Record<string, string>;
    }
    attributes: {
      htmlTemplate?: HTMLTemplate;
      jsonTemplate?: JSONTemplate;
      storageClient?: StorageClient;
      key?: string;
      [key: string]: any;
    }
    executionContext: ExecutionContext;
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

  export type RouteHandler = (ctx: Context, request: import("@cloudflare/workers-types").Request) => Promise<Response>;
}

export { };