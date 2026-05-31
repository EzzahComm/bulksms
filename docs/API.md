# EZZAHCOMM Bulk SMS API — Documentation

> **Base URL (Development):** `http://localhost:3003`  
> **Base URL (Production):** `https://<your-domain>.vercel.app`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Environments & Variables](#environments--variables)
3. [Rate Limiting](#rate-limiting)
4. [Endpoints](#endpoints)
   - [Health](#health)
   - [SMS](#sms)
   - [Campaigns](#campaigns)
   - [Wallet](#wallet)
   - [Sender IDs](#sender-ids)
   - [Payments (M-Pesa)](#payments-m-pesa)
   - [Webhooks](#webhooks)
5. [Error Responses](#error-responses)
6. [Changelog](#changelog)

---

## Authentication

The API supports two authentication schemes depending on the client type:

| Scheme | Header | Use Case |
|--------|--------|----------|
| **API Key** | `Authorization: ApiKey ezk_live_<key>` | Developer / server-to-server integrations |
| **Bearer JWT** | `Authorization: Bearer <jwt>` | Dashboard / frontend users (Supabase session token) |

All endpoints under `/api/*` require one of the above headers. Webhook endpoints (`/webhooks/*`) are **unauthenticated** — they are called by external providers (Safaricom, TextSMS).

---

## Environments & Variables

Two Postman environments are provided in `postman/environments/`:

| Variable | Development | Production |
|----------|-------------|------------|
| `baseUrl` | `http://localhost:3003` | `https://<your-domain>.vercel.app` |
| `apiKey` | `ezk_live_YOUR_DEV_API_KEY` | `ezk_live_YOUR_PROD_API_KEY` |
| `bearerToken` | _(empty — fill after login)_ | _(empty — fill after login)_ |
| `tenantId` | `e2200000-0000-4000-8000-000000000001` | _(your prod tenant UUID)_ |
| `mpesaEnv` | `sandbox` | `production` |
| `mpesaShortcode` | `174379` | _(your prod shortcode)_ |
| `phoneNumber` | `254700000000` | _(test number)_ |
| `campaignId` | _(fill after creating a campaign)_ | — |
| `checkoutRequestId` | _(fill after STK push)_ | — |

---

## Rate Limiting

| Setting | Default |
|---------|---------|
| Window | 15 minutes |
| Max requests per window | 300 |

Exceeding the limit returns `429 Too Many Requests`.

---

## Endpoints

---

### Health

No authentication required.

---

#### `GET /health` — Service Liveness

Returns service status, uptime, and environment info. Use this as a liveness probe.

**Response `200 OK`**
```json
{
  "status": "ok",
  "uptime": 3600,
  "env": "development",
  "service": "ezzahcomm-bulk-sms"
}
```

---

#### `GET /health/ready` — Readiness Check

Verifies DB and integration connectivity. Use this as a readiness probe before routing traffic.

**Response `200 OK`**
```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "service_role": "ok",
    "sms_provider": "ok"
  },
  "timestamp": "2026-05-31T03:00:00.000Z"
}
```

**Response `503 Service Unavailable`** — one or more checks failed.

---

### SMS

All SMS endpoints require `Authorization: ApiKey {{apiKey}}`.

---

#### `POST /api/sms/send` — Quick Send SMS

Convenience endpoint to send SMS to one or more recipients immediately or at a scheduled time.

**Request Body**
```json
{
  "message": "Hello from EZZAHCOMM!",
  "to": ["254712345678", "254798765432"],
  "sender": "EZZAH",
  "campaign_name": "Test Campaign",
  "scheduled_at": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | ✅ | SMS message text (max 160 chars per segment) |
| `to` | string[] | ✅ | Array of recipient phone numbers in E.164 format |
| `sender` | string | ✅ | Registered sender ID to use |
| `campaign_name` | string | ❌ | Optional label for the campaign |
| `scheduled_at` | ISO 8601 string \| null | ❌ | Schedule time; `null` = send immediately |

**Response `200 OK`**
```json
{
  "success": true,
  "campaign_id": "uuid",
  "credits_used": 2
}
```

---

#### `GET /api/sms/status/:campaignId` — Get SMS Campaign Status

Returns the delivery status of an SMS campaign.

**Path Parameters**

| Parameter | Description |
|-----------|-------------|
| `campaignId` | UUID of the campaign |

**Response `200 OK`**
```json
{
  "campaign_id": "uuid",
  "status": "delivered",
  "total": 2,
  "delivered": 2,
  "failed": 0,
  "pending": 0
}
```

---

#### `GET /api/sms/balance` — Get SMS Balance

Returns the current wallet credit balance and the live provider SMS balance.

**Response `200 OK`**
```json
{
  "wallet_credits": 1500,
  "provider_balance": "1500",
  "provider": "textsms"
}
```

---

### Campaigns

All campaign endpoints require `Authorization: ApiKey {{apiKey}}`.

---

#### `GET /api/campaigns` — List Campaigns

Returns a paginated list of SMS campaigns for the authenticated tenant.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | `50` | Number of results per page |
| `offset` | integer | `0` | Pagination offset |

**Response `200 OK`**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "My Campaign",
      "status": "delivered",
      "total_recipients": 100,
      "created_at": "2026-05-31T00:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

#### `GET /api/campaigns/:id` — Get Campaign by ID

Retrieve a single campaign by its unique ID.

**Path Parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | UUID of the campaign |

**Response `200 OK`**
```json
{
  "id": "uuid",
  "name": "My Campaign",
  "message": "Hello World!",
  "sender": "EZZAH",
  "status": "delivered",
  "total_recipients": 100,
  "delivered": 98,
  "failed": 2,
  "scheduled_at": null,
  "created_at": "2026-05-31T00:00:00.000Z"
}
```

---

#### `POST /api/campaigns` — Create & Send Campaign

Create and immediately send (or schedule) a new SMS campaign. Restricted to **staff/admin** roles.

**Request Body**
```json
{
  "name": "My Campaign",
  "message": "Hello World!",
  "sender": "EZZAH",
  "recipients": ["254712345678", "254798765432"],
  "scheduled_at": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Campaign name |
| `message` | string | ✅ | SMS message text |
| `sender` | string | ✅ | Registered and approved sender ID |
| `recipients` | string[] | ✅ | Array of recipient phone numbers in E.164 format |
| `scheduled_at` | ISO 8601 string \| null | ❌ | Schedule time; `null` = send immediately |

**Response `201 Created`**
```json
{
  "success": true,
  "campaign_id": "uuid",
  "credits_used": 2
}
```

---

### Wallet

All wallet endpoints require `Authorization: ApiKey {{apiKey}}`.

---

#### `GET /api/wallet` — Get Wallet Balance

Returns the current wallet balance for the authenticated tenant.

**Response `200 OK`**
```json
{
  "tenant_id": "uuid",
  "balance": 1500,
  "currency": "KES",
  "updated_at": "2026-05-31T00:00:00.000Z"
}
```

---

#### `GET /api/wallet/transactions` — List Wallet Transactions

Returns a paginated list of wallet transactions (top-ups and deductions).

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | `50` | Number of results per page |
| `offset` | integer | `0` | Pagination offset |

**Response `200 OK`**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "topup",
      "amount": 500,
      "description": "M-Pesa STK Push",
      "created_at": "2026-05-31T00:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### Sender IDs

All sender ID endpoints require `Authorization: ApiKey {{apiKey}}`.

---

#### `GET /api/sender-ids` — List Sender IDs

Returns all registered sender IDs for the authenticated tenant.

**Response `200 OK`**
```json
{
  "data": [
    {
      "id": "uuid",
      "sender_name": "EZZAH",
      "status": "approved",
      "description": "Main sender ID",
      "created_at": "2026-05-31T00:00:00.000Z"
    }
  ]
}
```

---

#### `POST /api/sender-ids` — Register Sender ID

Register a new sender ID for the authenticated tenant. Requires admin approval before it can be used to send SMS.

**Request Body**
```json
{
  "sender_name": "EZZAH",
  "description": "Main sender ID for EZZAHCOMM"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sender_name` | string | ✅ | Alphanumeric sender name (max 11 chars) |
| `description` | string | ❌ | Purpose / description of the sender ID |

**Response `201 Created`**
```json
{
  "id": "uuid",
  "sender_name": "EZZAH",
  "status": "pending",
  "created_at": "2026-05-31T00:00:00.000Z"
}
```

---

#### `PATCH /api/sender-ids/:id/status` — Update Sender ID Status

Update the approval status of a sender ID. Restricted to **staff/admin** roles.

**Path Parameters**

| Parameter | Description |
|-----------|-------------|
| `id` | UUID of the sender ID |

**Request Body**
```json
{
  "status": "approved",
  "rejection_reason": ""
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `"approved"` \| `"rejected"` \| `"pending"` | ✅ | New status |
| `rejection_reason` | string | ❌ | Required when `status` is `"rejected"` |

**Response `200 OK`**
```json
{
  "id": "uuid",
  "sender_name": "EZZAH",
  "status": "approved",
  "updated_at": "2026-05-31T00:00:00.000Z"
}
```

---

### Payments (M-Pesa)

All payment endpoints require `Authorization: ApiKey {{apiKey}}`.

---

#### `POST /api/payments/mpesa/stk` — Initiate M-Pesa STK Push

Initiates an M-Pesa STK push to the specified phone number to top up SMS credits. The user receives a payment prompt on their phone.

**Request Body**
```json
{
  "phone": "254712345678",
  "amount": 500
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone` | string | ✅ | Recipient phone number in E.164 format (`254XXXXXXXXX`) |
| `amount` | integer | ✅ | Amount in KES (minimum 1) |

**Response `200 OK`**
```json
{
  "success": true,
  "checkout_request_id": "ws_CO_191220191020363925",
  "merchant_request_id": "29115-34620561-1",
  "response_description": "Success. Request accepted for processing"
}
```

> **Note:** Save the `checkout_request_id` to the `{{checkoutRequestId}}` environment variable to poll the transaction status.

---

#### `GET /api/payments/mpesa/:checkoutRequestId` — Get M-Pesa Transaction Status

Poll the status of an M-Pesa STK push transaction.

**Path Parameters**

| Parameter | Description |
|-----------|-------------|
| `checkoutRequestId` | The `checkout_request_id` returned from the STK push |

**Response `200 OK`**
```json
{
  "status": "completed",
  "result_code": 0,
  "result_desc": "The service request is processed successfully.",
  "amount": 500,
  "mpesa_receipt": "NLJ7RT61SV",
  "transaction_date": "20191219102115"
}
```

| `status` | Meaning |
|----------|---------|
| `pending` | Payment not yet confirmed |
| `completed` | Payment successful, wallet topped up |
| `failed` | Payment failed or cancelled by user |

---

### Webhooks

Webhook endpoints are **unauthenticated** — they are called directly by external providers.

> ⚠️ Do not expose these endpoints publicly without IP allowlisting or signature verification.

---

#### `POST /webhooks/mpesa` — M-Pesa Daraja STK Callback

Receives the STK push result from Safaricom's Daraja API. Automatically tops up the wallet on success.

**Request Body** _(sent by Safaricom)_
```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "29115-34620561-1",
      "CheckoutRequestID": "ws_CO_191220191020363925",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully."
    }
  }
}
```

| `ResultCode` | Meaning |
|-------------|---------|
| `0` | Success |
| `1032` | Request cancelled by user |
| `1037` | Timeout — user did not respond |
| `2001` | Wrong PIN entered |

**Response `200 OK`** — always returns 200 to acknowledge receipt.

---

#### `POST /webhooks/sms-dlr` — SMS Delivery Report Callback

Receives delivery report (DLR) callbacks from the SMS provider (TextSMS / Advanta). Updates campaign delivery statistics.

**Request Body** _(sent by SMS provider)_
```json
{
  "messageid": "MSG123456",
  "dlrstatus": "delivered"
}
```

| `dlrstatus` | Meaning |
|-------------|---------|
| `delivered` | Message delivered to handset |
| `failed` | Delivery failed |
| `pending` | Delivery in progress |

**Response `200 OK`** — always returns 200 to acknowledge receipt.

---

## Error Responses

All error responses follow a consistent shape:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `400 Bad Request` | Invalid or missing request parameters |
| `401 Unauthorized` | Missing or invalid `Authorization` header |
| `403 Forbidden` | Authenticated but insufficient role/permissions |
| `404 Not Found` | Resource does not exist |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Unexpected server error |
| `503 Service Unavailable` | Dependency (DB, SMS provider) is unreachable |

---

## Changelog

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2026-05-31 | Initial release — SMS, Campaigns, Wallet, Sender IDs, M-Pesa, Webhooks |
