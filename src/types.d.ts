import type {
  Queue,
  R2Bucket,
  ExecutionContext,
  KVNamespace
} from "@cloudflare/workers-types";
import type StorageClient from "./routes/products/StorageClient.js";
import Job from "./routes/job/Job.js";


declare global {
  export interface IndexingJobProduct {
    sku: string;
    action?: 'add' | 'update' | 'delete' | string; // defaults to update
  }

  export interface IndexingJob {
    org: string;
    site: string;
    storeCode: string;
    storeViewCode: string;
    products: IndexingJobProduct[];
    timestamp: number;
  }

  export interface ImageCollectorJob extends IndexingJob {
  }

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

  export interface MerchantFeedShipping {
    country: string;
    region: string;
    service: string;
    price: string;
    min_handling_time: string;
    max_handling_time: string;
    min_transit_time: string;
    max_transit_time: string;
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

    // below are properties that are used to generate indices, not belonging to JSON-LD

    /**
     * Shipping options, as string, object, or array of objects.
     * If an array, each object contains shipping information for one option.
     * 
     * @example "US:CA:Overnight:16.00 USD:1:1:2:3"
     * @example { country: 'US', region: 'CA', service: 'Overnight', price: '16.00 USD', min_handling_time: '1', max_handling_time: '2', min_transit_time: '3', max_transit_time: '4' }
     * @example [
     *   { country: 'US', region: 'CA', service: 'Overnight', price: '16.00 USD', min_handling_time: '1', max_handling_time: '2', min_transit_time: '3', max_transit_time: '4' },
     *   { country: 'US', region: 'CA', service: '2-Day', price: '10.00 USD', min_handling_time: '1', max_handling_time: '2', min_transit_time: '3', max_transit_time: '4' }
     * ]
     */
    shipping?: string | MerchantFeedShipping | MerchantFeedShipping[];
  }

  /**
   * Resolved config object
   */
  export interface Config {
    org: string;
    site: string;
    siteKey: string;
    route: string;
    storeCode?: string;
    storeViewCode?: string;
    sku?: string;

    // jobs
    topic?: string;
    name?: string;
    details?: boolean;
  }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;
    SUPERUSER_KEY: string;
    INDEXER_QUEUE: Queue<IndexingJob>;
    IMAGE_COLLECTOR_QUEUE: Queue<ImageCollectorJob>;

    // KV namespaces
    KEYS: KVNamespace<string>;
    CATALOG_BUCKET: R2Bucket

    [key: string]: string | KVNamespace<string> | R2Bucket | Queue<IndexingJob>;
  }



  export interface Context {
    url: URL;
    env: Env;
    log: Console;
    config: Config;
    metrics?: {
      startedAt: number;
      payloadValidationMs: number[];
      imageDownloads: { ms: number; bytes: number }[];
      imageUploads: { ms: number; alreadyExists: boolean }[];
      productUploadsMs: number[];
    };
    /** parsed from body or query params */
    data: any;
    info: {
      filename: string;
      method: string;
      extension: string | undefined;
      headers: Record<string, string>;
    }
    attributes: {
      storageClient?: StorageClient;
      [key: string]: any;
    }
    executionContext: ExecutionContext;
  }

  interface BatchResult {
    sku: string;
    sluggedSku: string;
    status: number;
    message?: string;
    paths: Record<string, AdminStatus>;
  };

  export type RouteHandler = (ctx: Context, request: import("@cloudflare/workers-types").Request) => Promise<Response>;
}

export { };