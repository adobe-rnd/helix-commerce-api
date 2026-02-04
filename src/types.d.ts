import type {
  Queue,
  R2Bucket,
  ExecutionContext,
  KVNamespace
} from "@cloudflare/workers-types";
import type StorageClient from "./routes/products/StorageClient.js";
import type Platform from "./routes/orders/payments/Platform.js";
import * as SharedTypes from '@dylandepass/helix-product-shared/types';
import type AuthInfo from "./utils/AuthInfo.js";

declare global {
  export * as SharedTypes from '@dylandepass/helix-product-shared/types';

  export type RouteHandler = (ctx: Context, request: import("@cloudflare/workers-types").Request) => Promise<Response>;

  /**
   * HTTP request information with normalized headers
   */
  export interface HttpRequest {
    method: string;
    headers: Record<string, string>;
    url: URL;
    scheme: string;
    host: string;
    pathname: string;
    filename: string;
    extension: string | undefined;
    getHeader(name: string): string | undefined;
  }

  /**
   * Decomposed path information from router
   */
  export interface PathInfo {
    route: string;
    org: string;
    site: string;
    path: string;
    siteKey: string;
    variables: Record<string, string>;
    email: string | undefined;
    orderId: string | undefined;
    getVariable(name: string): string | undefined;
  }

  /**
   * Combined request and path information
   */
  export interface RequestInfo extends HttpRequest, PathInfo { }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;
    SUPERUSER_KEY: string;
    INDEXER_QUEUE: Queue<SharedTypes.IndexingJob>;
    IMAGE_COLLECTOR_QUEUE: Queue<SharedTypes.ImageCollectorJob>;

    // auth
    OTP_SECRET: string;
    JWT_SECRET: string;
    AUTH_BUCKET: R2Bucket;

    // emails
    RESEND_API_KEY: string;
    FROM_EMAIL: string;

    // bindings
    KEYS: KVNamespace<string>;
    CATALOG_BUCKET: R2Bucket;
    ORDERS_BUCKET: R2Bucket;
    CONFIGS_BUCKET: R2Bucket;

    [key: string]: string | KVNamespace<string> | R2Bucket | Queue<SharedTypes.IndexingJob>;
  }

  export interface Context {
    url: URL;
    env: Env;
    log: Console;
    requestInfo: Readonly<RequestInfo>;
    metrics?: {
      startedAt: number;
      payloadValidationMs: number[];
      imageDownloads: { ms: number; bytes: number }[];
      imageUploads: { ms: number; alreadyExists: boolean }[];
      productUploadsMs: number[];
    };
    /** parsed from body or query params */
    data: any;
    attributes: {
      storageClient?: StorageClient;
      paymentPlatform?: Platform;
      [key: string]: any;
    }
    authInfo: AuthInfo;
    executionContext: ExecutionContext;
  }

  export interface BatchResult {
    sku: string;
    path: string;
    status: number;
    message?: string;
  };

  export interface OrderItem {
    name?: string;
    note?: string;
    sku: string;
    quantity: number;
    price: SharedTypes.ProductBusPrice;
  }

  export type OrderState = 'pending' | 'processing' | 'completed' | 'cancelled';

  export interface OrderMetadata {
    id: string;
    createdAt: string;
    updatedAt: string;
    state: OrderState;
  }

  export interface Order {
    id: string;
    state: OrderState;
    createdAt: string;
    updatedAt: string;
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
    phone?: string;
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

  export interface DecodedJWT {
    email: string;
    roles: string[];
    org: string;
    site: string;
    iat: number; // issued at
    exp: number; // expires at
  }

  export interface AdminMetadata extends Record<string, string> {
    dateAdded: string; // ISO 8601
    addedBy: string; // IP address, TODO: use email once superuser is auth'd by email
  }

  export interface AdminData extends AdminMetadata {
    email: string;
  }

  export interface ProductBusConfig {
    // Whether this site should allow logging in via OTP
    authEnabled?: boolean;
    // OTP from email
    otpEmailSender?: string;
    // OTP email subject
    otpEmailSubject?: string;
    // OTP email body template, HTML
    otpEmailBodyTemplate?: string;
    // OTP email body URL, fetched and used as template if defined
    otpEmailBodyUrl?: string;
  }
}

export { };