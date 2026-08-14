# Potato/Onion Stock Backend

Minimal Express + MongoDB backend for Potato/Onion stock management.

## Setup

```bash
npm install
npm run seed
npm run dev
```

Default server:

```text
http://localhost:5000
```

## Environment

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/potato_onion_stock
```

## APIs

### Products

```http
GET /api/products
POST /api/products
```

### Parties / Customers

```http
GET /api/parties
POST /api/parties
GET /api/parties/:id
```

Create party body:

```json
{
  "partyCode": "P001",
  "name": "Ram Traders",
  "type": "SUPPLIER",
  "phone": "9876543210",
  "address": "Market road"
}
```

Party types:

```text
SUPPLIER
CUSTOMER
BOTH
```

Create product body:

```json
{
  "name": "Tomato"
}
```

### Stock IN

```http
POST /api/stock/in
```

```json
{
  "productId": "PRODUCT_ID",
  "partyId": "PARTY_ID",
  "date": "2026-07-24",
  "packets": 100,
  "weight": 5000,
  "totalAmount": 45000,
  "paymentAmount": 20000,
  "paymentMode": "Cash",
  "note": "Fresh onion stock"
}
```

### Stock OUT

```http
POST /api/stock/out
```

```json
{
  "productId": "PRODUCT_ID",
  "partyId": "PARTY_ID",
  "date": "2026-07-25",
  "packets": 20,
  "weight": 1000,
  "totalAmount": 12000,
  "paymentAmount": 5000,
  "paymentMode": "UPI",
  "note": "Wholesale"
}
```

For `Stock IN`, `paymentAmount` auto-creates a `PAID` payment.
For `Stock OUT`, `paymentAmount` auto-creates a `RECEIVED` payment.

### Payments

```http
GET /api/payments
POST /api/payments
GET /api/payments?partyId=PARTY_ID&type=RECEIVED&from=2026-07-01&to=2026-07-31
```

Create payment body:

```json
{
  "partyId": "PARTY_ID",
  "type": "RECEIVED",
  "date": "2026-07-25",
  "amount": 5000,
  "mode": "Cash",
  "note": "Partial payment"
}
```

Payment types:

```text
RECEIVED  // money received from party/customer
PAID      // money paid to party/customer
```

Balance convention:

```text
Positive balance = party/customer will pay you
Negative balance = you will pay party/customer
Zero balance     = settled
```

If requested packets or weight is more than available stock, API returns:

```json
{
  "message": "Insufficient stock",
  "details": {
    "availablePackets": 80,
    "availableWeight": 4000,
    "requestedPackets": 100,
    "requestedWeight": 5000
  }
}
```

### Stock Adjustment

```http
POST /api/stock/adjustment
```

```json
{
  "productId": "PRODUCT_ID",
  "adjustmentType": "OUT",
  "date": "2026-07-25",
  "packets": 2,
  "weight": 80,
  "reason": "Damaged",
  "note": "Rotten onions"
}
```

Use `adjustmentType: "IN"` for extra physical stock and `adjustmentType: "OUT"` for damage/wastage/correction reduce.

### Current Stock

```http
GET /api/stock/current
```

### Stock History

```http
GET /api/stock/history
GET /api/stock/history?productId=PRODUCT_ID&partyId=PARTY_ID&from=2026-07-01&to=2026-07-31&type=IN
```

Allowed history types:

```text
IN
OUT
ADJUSTMENT_IN
ADJUSTMENT_OUT
```
