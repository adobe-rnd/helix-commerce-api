import type {
  Queue,
  R2Bucket,
  ExecutionContext,
  KVNamespace
} from "@cloudflare/workers-types";
import type StorageClient from "./routes/products/StorageClient.js";
import type Platform from "./routes/orders/payments/Platform.js";
import * as SharedTypes from '@dylandepass/helix-product-shared/types';

declare global {
  export * as SharedTypes from '@dylandepass/helix-product-shared/types';

  export type RouteHandler = (ctx: Context, request: import("@cloudflare/workers-types").Request) => Promise<Response>;

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
    orderId?: string;
  }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;
    SUPERUSER_KEY: string;
    INDEXER_QUEUE: Queue<SharedTypes.IndexingJob>;
    IMAGE_COLLECTOR_QUEUE: Queue<SharedTypes.ImageCollectorJob>;

    // KV namespaces
    KEYS: KVNamespace<string>;
    CATALOG_BUCKET: R2Bucket

    [key: string]: string | KVNamespace<string> | R2Bucket | Queue<SharedTypes.IndexingJob>;
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
      paymentPlatform?: Platform;
      [key: string]: any;
    }
    executionContext: ExecutionContext;
  }

  export interface BatchResult {
    sku: string;
    sluggedSku: string;
    status: number;
    message?: string;
    paths: Record<string, AdminStatus>;
  };

  export interface OrderItem {
    name?: string;
    note?: string;
    sku: string;
    quantity: number;
    price: SharedTypes.ProductBusPrice;
  }

  export type OrderState = 'pending' | 'processing' | 'completed' | 'cancelled';

  export interface Order {
    id: string;
    state: OrderState;
    createdAt: string;
    updatedAt: string;
    storeCode: string;
    storeViewCode: string;
    customer: Customer;
    shipping: ShippingAddress;
    items: OrderItem[];
  }

  export interface PaymentLink {
    id: string;
    url: string;
    createdAt: string;
    expiresAt?: string;
    orderId: string;
  }

  export interface Customer {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface Address {
    id: string;
    name: string;
    company: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
    email: string;
  }
}

export { };