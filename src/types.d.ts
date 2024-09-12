import type { ExecutionContext } from "@cloudflare/workers-types/experimental";

declare global {
  export interface Config {
    pageType: 'product' | string;
    apiKey: string;
    magentoEnvironmentId: string;
    magentoWebsiteCode: string;
    magentoStoreViewCode: string;
    coreEndpoint: string;
    params: Record<string, string>;
  }

  export interface Product {
    sku: string;
    [key: string]: unknown;
  }

  export interface Env {
    VERSION: string;
    ENVIRONMENT: string;
    [key: string]: string;
  }

  export interface Context extends ExecutionContext {
    url: URL;
    env: Record<string, string>;
    log: Console;
    info: {
      method: string;
      headers: Record<string, string>;
    }
  }
}

export { };