# helix-commerce-api

Product API for Edge Delivery Services.

### API

Base URL structure: `https://<host>/{org}/{site}/catalog/{storeCode}/{storeViewCode}`

Set some environment variables to make the curl examples easier to read:

```bash
export ORG="acme"
export SITE="main"
export STORE="us"
export VIEW="en"
export KEY="<SITE_API_KEY>"
```

- All modifying requests require an Authorization header: `Authorization: Bearer <SITE_API_KEY>`
- Send JSON with `Content-Type: application/json`

#### GET a product

```bash
curl -sS \
  -H "Authorization: Bearer $KEY" \
  "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/<sku>.json"
```

Example response body:

```json
{
  "sku": "sku-123",
  "name": "Product Name",
  "urlKey": "product-url-key",
  "url": "https://www.example.com/products/product-url-key",
  "images": [
    { "url": "./media_xyz.jpg", "label": "main" }
  ]
}
```

#### PUT a product (small example)

Minimal payload with the most important properties.

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/test-sku.json" \
  --data-binary @- <<'JSON'
{
  "sku": "test-sku",
  "name": "Test Product",
  "urlKey": "test-product",
  "url": "https://www.example.com/products/test-product"
}
JSON
```

#### PUT a product (complete example with all properties)

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/sku-123.json" \
  --data-binary @- <<'JSON'
{
  "sku": "sku-123",
  "urlKey": "product-url-key",
  "description": "Long product description...",
  "name": "Product Name",
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

Send up to 50 products at once by POSTing to the wildcard SKU path.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/*.json" \
  --data-binary @- <<'JSON'
[
  {
    "sku": "bulk-001",
    "name": "Bulk Product 1",
    "urlKey": "bulk-product-1",
    "url": "https://www.example.com/products/bulk-product-1"
  },
  {
    "sku": "bulk-002",
    "name": "Bulk Product 2",
    "urlKey": "bulk-product-2",
    "url": "https://www.example.com/products/bulk-product-2"
  }
]
JSON
```

Notes:
- Bulk POST must target `products/*` and will return 400 if the body is not an array or contains more than 50 items.
- Successful PUT/POST responses return 201 and include the saved product(s).
- If many products or images are included in a single bulk POST, the images will be processed asynchronously. Until they complete processing, the product-bus entry will continue to point to the URL provided in the POST.

#### Lookup by URL key

Redirect to the product JSON using a `urlKey` (or `urlkey`) query parameter.

```bash
curl -sS -i \
  "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/lookup?urlkey=product-url-key"
```

Example (headers):

```http
HTTP/1.1 301 Moved Permanently
Location: https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/sku-123.json
```

#### Lookup (list all products)

```bash
curl -sS \
  "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/lookup"
```

Example response body:

```json
{
  "total": 2,
  "products": [
    {
      "sku": "sku-123",
      "name": "Product Name",
      "urlKey": "product-url-key",
      "links": {
        "product": "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/sku-123.json"
      }
    },
    {
      "sku": "sku-456",
      "name": "Another Product",
      "links": {
        "product": "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/sku-456.json"
      }
    }
  ]
}
```

With `skusOnly=true` (returns only SKUs and product links):

```bash
curl -sS \
  "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/lookup?skusOnly=true"
```

Example response body:

```json
{
  "total": 2,
  "products": [
    {
      "sku": "sku-123",
      "links": {
        "product": "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/sku-123.json"
      }
    },
    {
      "sku": "sku-456",
      "links": {
        "product": "https://api.adobecommerce.live/$ORG/$SITE/catalog/$STORE/$VIEW/products/sku-456.json"
      }
    }
  ]
}
```

### Auth token management

Base URL structure: `https://<host>/{org}/{site}/auth/token`

All auth routes require `Authorization: Bearer <SITE_API_KEY>` (or a superuser key).

#### Fetch auth token (GET)

```bash
curl -sS \
  -H "Authorization: Bearer $KEY" \
  "https://api.adobecommerce.live/$ORG/$SITE/auth/token"
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
  "https://api.adobecommerce.live/$ORG/$SITE/auth/token"
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
  "https://api.adobecommerce.live/$ORG/$SITE/auth/token" \
  --data-binary '{"token":"SPECIFIC_TOKEN_VALUE"}'
```

Example response body:

```json
{ "token": "SPECIFIC_TOKEN_VALUE" }
```
