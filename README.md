# helix-commerce-api

Product API for Edge Delivery Services.

- [API](#api)
  - [GET a product](#get-a-product)
  - [PUT a product (small example)](#put-a-product-small-example)
  - [PUT a product (complete example with all properties)](#put-a-product-complete-example-with-all-properties)
  - [Bulk POST products](#bulk-post-products)
  - [DELETE a product](#delete-a-product)
- [Service tokens](#service-tokens)
  - [Create a service token (POST)](#create-a-service-token-post)
  - [Revoke a service token (POST)](#revoke-a-service-token-post)
- [Transactional emails](#transactional-emails)
  - [Step 1: Configure the sender address](#step-1-configure-the-sender-address)
  - [Step 2: Create a service token with email scopes](#step-2-create-a-service-token-with-email-scopes)
  - [Step 3: Send an email](#step-3-send-an-email)
- [Schemas](#schemas)

### Environments
* Main: `https://api.adobecommerce.live`
* Next: `https://api-next.adobecommerce.live`

### API

Set some environment variables to make the curl examples easier to read:

```bash
export ORG="acme"
export SITE="main"
export KEY="<SITE_API_KEY>"
```

- All modifying requests require an Authorization header: `Authorization: Bearer <SITE_API_KEY>`
- Send JSON with `Content-Type: application/json`
- Products are stored and accessed by their URL path (e.g., `/products/blender-pro-500`)

#### GET a product

Products are retrieved by their path:

```bash
curl -sS \
  -H "Authorization: Bearer $KEY" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/catalog/products/blender-pro-500.json"
```

Example response body:

```json
{
  "sku": "sku-123",
  "name": "Blender Pro 500",
  "path": "/products/blender-pro-500",
  "url": "https://www.example.com/products/blender-pro-500",
  "images": [
    { "url": "./media_xyz.jpg", "label": "main" }
  ]
}
```

#### PUT a product (small example)

Minimal payload with the most important properties. The URL path determines where the product is stored.

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/catalog/products/test-product.json" \
  --data-binary @- <<'JSON'
{
  "sku": "test-sku",
  "name": "Test Product",
  "path": "/products/test-product",
  "url": "https://www.example.com/products/test-product"
}
JSON
```

**Note**: The `path` field in the JSON represents the product's canonical path (e.g., `/products/test-product`). The API endpoint path includes `/catalog/` as part of the API structure (e.g., `/catalog/products/test-product.json`), but this prefix is not included in the product's `path` field.

#### PUT a product (complete example with all properties)

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/catalog/products/blender-pro-500.json" \
  --data-binary @- <<'JSON'
{
  "sku": "sku-123",
  "path": "/products/blender-pro-500",
  "description": "Long product description...",
  "name": "Blender Pro 500",
  "metaTitle": "Product Name | Brand",
  "metaDescription": "Short SEO description...",
  "gtin": "0123456789012",
  "url": "https://www.example.com/products/product-url-key",
  "brand": "ExampleBrand",
  "availability": "InStock",
  "price": {
    "currency": "USD",
    "regular": "129.99",
    "final": "99.99"
  },
  "itemCondition": "NewCondition",
  "metadata": {
    "color": "black",
    "size": "M"
  },
  "options": [
    {
      "id": "finish",
      "label": "Finish",
      "position": 1,
      "values": [
        { "value": "Matte" },
        { "value": "Glossy" }
      ]
    }
  ],
  "aggregateRating": {
    "ratingValue": "4.3",
    "reviewCount": "12",
    "bestRating": "5",
    "worstRating": "1"
  },
  "specifications": "<ul><li>Spec A</li><li>Spec B</li></ul>",
  "images": [
    {
      "url": "https://cdn.example.com/images/sku-123/main.jpg",
      "label": "main",
      "roles": ["small", "thumbnail"],
      "video": "https://cdn.example.com/videos/sku-123/overview.mp4"
    }
  ],
  "variants": [
    {
      "sku": "sku-123-RED",
      "name": "Product Name - Red",
      "price": {
        "currency": "USD",
        "regular": "129.99",
        "final": "99.99"
      },
      "url": "https://www.example.com/products/product-url-key?color=red",
      "images": [
        { "url": "https://cdn.example.com/images/sku-123/red.jpg", "label": "red" }
      ],
      "gtin": "0123456789013",
      "description": "Red variant description",
      "availability": "InStock",
      "options": [ { "value": "Red", "id": "color", "uid": "opt-1" } ],
      "itemCondition": "NewCondition",
      "custom": { "material": "aluminum" }
    }
  ],
  "jsonld": "{\n  \"@context\": \"https://schema.org\",\n  \"@type\": \"Product\",\n  \"name\": \"Product Name\"\n}",
  "custom": {
    "warranty": "2 years",
    "countryOfOrigin": "USA"
  }
}
JSON
```

#### Bulk POST products

Send up to 50 products at once by POSTing to the wildcard path. Each product must include a `path` field.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/catalog/*" \
  --data-binary @- <<'JSON'
[
  {
    "sku": "bulk-001",
    "name": "Bulk Product 1",
    "path": "/products/bulk-product-1",
    "url": "https://www.example.com/products/bulk-product-1"
  },
  {
    "sku": "bulk-002",
    "name": "Bulk Product 2",
    "path": "/products/bulk-product-2",
    "url": "https://www.example.com/products/bulk-product-2"
  }
]
JSON
```

Notes:
- Bulk POST must target `catalog/*` and will return 400 if the body is not an array or contains more than 50 items.
- Each product in the array must include a valid `path` field that follows the pattern `/[a-z0-9-/]+`.
- Successful PUT/POST responses return 201 and include the saved product(s).
- If many products or images are included in a single bulk POST, the images will be processed asynchronously. Until they complete processing, the product-bus entry will continue to point to the URL provided in the POST.

#### DELETE a product

Delete a product by its path:

```bash
curl -sS -X DELETE \
  -H "Authorization: Bearer $KEY" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/catalog/products/blender-pro-500.json"
```

Example response:

```json
{
  "message": "Product deleted successfully"
}
```

### Auth token management

> NOTE: This API is deprecated and will be removed. Use the [`/auth/service_token` API](#service-tokens) instead.

Base URL structure: `https://<host>/{org}/sites/{site}/auth/token`

All auth routes require `Authorization: Bearer <SITE_API_KEY>` (or a superuser key).

#### Fetch auth token (GET)

```bash
curl -sS \
  -H "Authorization: Bearer $KEY" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/auth/token"
```

Example response body:

```json
{ "token": "CURRENT_TOKEN_VALUE" }
```

#### Rotate auth token (POST)

Generates a new token. Do not include a `token` in the request body.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $KEY" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/auth/token"
```

Example response body:

```json
{ "token": "NEW_ROTATED_TOKEN" }
```

#### Set auth token (PUT)

Explicitly sets the token value.

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/auth/token" \
  --data-binary '{"token":"SPECIFIC_TOKEN_VALUE"}'
```

Example response body:

```json
{ "token": "SPECIFIC_TOKEN_VALUE" }
```

### Service tokens

JWT-based service tokens provide fine-grained, time-limited access for external services. Unlike legacy UUID tokens (which inherit a fixed `service` role), service tokens carry only the permissions explicitly granted at creation time.

Admins create service tokens via the `/auth/service_token` endpoint. The permissions allowlist is: `catalog:read`, `catalog:write`, `orders:read`, `orders:write`, `index:read`, `index:write`, `customers:read`, `customers:write`, `emails:send`. Permissions like `admins:write`, `service_token:create`, or `config:write` cannot be delegated to service tokens.

#### Create a service token (POST)

Requires admin auth (cookie or bearer token from OTP login).

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/auth/service_token" \
  --data-binary @- <<'JSON'
{
  "permissions": [
    "emails:send",
    "emails:send:*@example.com",
    "emails:send:alerts@ops.internal"
  ],
  "ttl": 2592000
}
JSON
```

- `permissions` — Array of permissions. Email scope patterns use the prefix `emails:send:` followed by an exact address or `*@domain`.
- `ttl` — Token lifetime in seconds (max 1 year / 31,536,000 seconds).

Example response (201):

```json
{ "token": "eyJhbG...", "ttl": 2592000 }
```

#### Revoke a service token (POST)

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/auth/service_token/revoke" \
  --data-binary '{"token":"eyJhbG..."}'
```

Returns 204 on success. Revoked tokens are stored in `{org}/{site}/revoked/service_tokens/` and checked on every request.

### Transactional emails

The `/emails` endpoint lets service tokens send transactional email via AWS SES. Access requires the `emails:send` permission plus one or more `emails:send:<pattern>` scopes defining which destination addresses are allowed.

#### Step 1: Configure the sender address

The "from" address is read from the site config's `otpEmailSender` field (falling back to the `FROM_EMAIL` env var, then `noreply@adobecommerce.live`). Set it with:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/config" \
  --data-binary @- <<'JSON'
{
  "otpEmailSender": "notifications@yourstore.com"
}
JSON
```

The sender must be a verified identity in your AWS SES account.

#### Step 2: Create a service token with email scopes

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/auth/service_token" \
  --data-binary @- <<'JSON'
{
  "permissions": [
    "emails:send",
    "emails:send:*@example.com",
    "emails:send:vip@partner.org"
  ],
  "ttl": 86400
}
JSON
```

This token can email any `@example.com` address and `vip@partner.org`, but no others. Save the returned `token` value.

#### Step 3: Send an email

```bash
export SERVICE_TOKEN="eyJhbG..."

curl -sS -X POST \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/sites/$SITE/emails" \
  --data-binary @- <<'JSON'
{
  "toEmail": "subscriber@example.com",
  "subject": "Welcome to our newsletter",
  "html": "<h1>Welcome!</h1><p>Thanks for subscribing.</p>",
  "cc": ["team@example.com"],
  "bcc": ["archive@example.com"]
}
JSON
```

- `toEmail` — `string` or `string[]`. Required.
- `subject` — `string`. Required.
- `html` — `string` (max 256 KB). Required.
- `cc` — `string[]`. Optional.
- `bcc` — `string[]`. Optional.
- Total recipients across all fields is capped at 50.

All addresses in `toEmail`, `cc`, and `bcc` are checked against the token's email scopes.

Example response (200):

```json
{ "success": true }
```

### Schemas

#### ProductBusEntry

| Property | Type | Description |
| --- | --- | --- |
| `sku` | `string` | Unique stock keeping unit. Required. |
| `path` | `string` | URL path where the product is accessible (e.g., `/products/blender-pro-500`). Must match pattern `/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*`. Required. |
| `description` | `string` | Long description, free text or HTML. |
| `name` | `string` | Human-readable product name. Required. |
| `metaTitle` | `string` | SEO title. |
| `metaDescription` | `string` | SEO description. |
| `gtin` | `string` | Global Trade Item Number. |
| `url` | `string` | Canonical product URL on the origin site. |
| `brand` | `string` | Brand name. |
| `availability` | [`SchemaOrgAvailability`](#schemaorgavailability) | Product availability status. |
| `price` | [`ProductBusPrice`](#productbusprice) | Pricing information for the product. |
| `itemCondition` | [`SchemaOrgItemCondition`](#schemaorgitemcondition) | Condition of the item. |
| `metadata` | `Record<string,string>` | Arbitrary string metadata map. |
| `options` | [`ProductBusOption`](#productbusoption)[] | Configurable options presented on PDP. |
| `aggregateRating` | [`AggregateRating`](#aggregaterating) | Structured rating information. |
| `specifications` | `string` | Structured specs (e.g., HTML snippet). |
| `images` | [`ProductBusMedia`](#productbusmedia)[] | Media gallery. |
| `variants` | [`ProductBusVariant`](#productbusvariant)[] | Variant entries for configurable products. |
| `jsonld` | `string` | Product JSON-LD blob (max 128,000 chars). Intended for Schema.org markup. |
| `custom` | [`CustomObject`](#customobject) | Arbitrary custom data bag (not indexed by default). |

#### ProductBusPrice

| Property | Type | Description |
| --- | --- | --- |
| `currency` | `string` | ISO currency code for the price values. |
| `regular` | `string` | Regular price amount as a string. |
| `final` | `string` | Final/sale price amount as a string. |

#### ProductBusMedia

| Property | Type | Description |
| --- | --- | --- |
| `url` | `string` | Absolute or relative media URL. Required. |
| `label` | `string` | Optional label or alt text. |
| `roles` | `string[]` | Optional role hints (e.g., `thumbnail`, `small`). |
| `video` | `string` | Optional related video URL. |

#### ProductBusOptionValue

| Property | Type | Description |
| --- | --- | --- |
| `id` | `string` | Optional value identifier. |
| `value` | `string` | Display value. Required. |
| `uid` | `string` | Optional stable unique identifier. |

#### ProductBusOption

| Property | Type | Description |
| --- | --- | --- |
| `id` | `string` | Optional option identifier. |
| `label` | `string` | Display label for the option. Required. |
| `position` | `number` | Display ordering hint. |
| `values` | [`ProductBusOptionValue`](#productbusoptionvalue)[] | List of selectable values. Required. |

#### ProductBusVariant

| Property | Type | Description |
| --- | --- | --- |
| `sku` | `string` | Variant SKU. Required. |
| `name` | `string` | Variant display name. Required. |
| `price` | [`ProductBusPrice`](#productbusprice) | Variant pricing. |
| `url` | `string` | Variant URL. Required. |
| `images` | [`ProductBusMedia`](#productbusmedia)[] | Variant media gallery. Required. |
| `gtin` | `string` | Variant GTIN. |
| `description` | `string` | Variant description. |
| `availability` | [`SchemaOrgAvailability`](#schemaorgavailability) | Variant availability. |
| `options` | [`ProductBusOptionValue`](#productbusoptionvalue)[] | Selected option values for this variant. |
| `itemCondition` | [`SchemaOrgItemCondition`](#schemaorgitemcondition) | Variant condition. |
| `custom` | [`CustomObject`](#customobject) | Arbitrary custom data for the variant. |

#### AggregateRating

| Property | Type | Description |
| --- | --- | --- |
| `ratingValue` | `string` | Average rating value. |
| `reviewCount` | `string` | Number of reviews (string-encoded integer). |
| `bestRating` | `string` | Maximum possible rating. |
| `worstRating` | `string` | Minimum possible rating. |

#### SchemaOrgAvailability

| Property | Type | Description |
| --- | --- | --- |
| `availability` | `enum` | One of: `BackOrder`, `Discontinued`, `InStock`, `InStoreOnly`, `LimitedAvailability`, `MadeToOrder`, `OnlineOnly`, `OutOfStock`, `PreOrder`, `PreSale`, `Reserved`, `SoldOut`. |

#### SchemaOrgItemCondition

| Property | Type | Description |
| --- | --- | --- |
| `itemCondition` | `enum` | One of: `DamagedCondition`, `NewCondition`, `RefurbishedCondition`, `UsedCondition`. |

#### CustomObject

| Property | Type | Description |
| --- | --- | --- |
| `*` | `any` | Arbitrary key-value pairs. Additional properties allowed. |
