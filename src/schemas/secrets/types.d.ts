export interface PaymentsChaseConfig {
  enabled?: boolean;
  title?: string;
  username: string;
  password: string;
  hostedSecureId: string;
  hostedSecureApiToken: string;
  merchantId: string;
  terminalId: string;
  bin: string;
  initUrl: string;
  redirectUrl: string;
  serviceUrl: string;
  successUrl: string;
  cancelUrl: string;

  safetechMerchantId?: string;
  language?: string;
  avsUrl?: string;
  templateUrl?: string;
  maxRetries?: number;
  creditCardTypes?: string[];
}
