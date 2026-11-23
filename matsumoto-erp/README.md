# Matsumoto ERP

Unified import–distribution ERP for **PT Matsumoto Trading Indonesia** — procurement from Japan,
customs, inventory with shelf-life, sales and tax-compliant invoicing, built around the real
document chain:

```
PURCHASE SIDE                              SALES SIDE
Purchase Order ──(PDF + QR)──► Receive     Delivery Order (Surat Jalan) ──► Customer Invoice
   (to Japan)     scan QR / enter DN │          (FEFO stock out)        (auto-refs PO + DO no.)
                                     ▼
                              Goods Receipt ──► Supplier Invoice
                              (stock in)        (3-way match: PO ↔ GR ↔ Invoice)
```

## Stack

| Layer    | Tech                                            |
|----------|-------------------------------------------------|
| Frontend | React 18 + Vite + TypeScript (served by Nginx)  |
| Backend  | Node + Express + TypeScript                      |
| ORM / DB | Prisma + **PostgreSQL 16**                       |
| Docs     | PDFKit (PDF) + `qrcode` (QR codes)              |
| Deploy   | Docker Compose (db · api · web)                 |

## Quick start (Docker — recommended for your dev server)

```bash
cp .env.example .env            # adjust ports / credentials if needed
docker compose up --build
```

Then open:

- **Web UI**    → http://localhost:8080
- **API**       → http://localhost:4000/api/health
- **Postgres**  → localhost:5432 (user `mti`, db `matsumoto_erp`)

On first boot the API waits for Postgres, syncs the schema (`prisma db push`) and seeds MTI
sample data (set `SEED_ON_START=false` in `.env` to skip seeding).

> The Docker build runs `prisma generate`, which downloads the Prisma query engine — the build
> host needs outbound internet (your dev server has it).

## Local dev (without Docker)

```bash
# 1. Postgres running locally, then:
cd server
cp .env.example .env            # set DATABASE_URL
npm install
npx prisma generate
npm run db:setup                # prisma db push + seed
npm run dev                     # API on :4000

# 2. in another shell
cd web
npm install
npm run dev                     # Vite on :5173 (proxies /api → :4000)
```

## Document flow — how it works

1. **Purchase Order** (`/purchase-orders`) — raise a PO to Matsumoto Tokyo. Each PO exposes a
   **PDF with a QR code** at `/api/purchase-orders/:id/pdf`. The QR encodes the PO number + a token.
2. **Receive** (`/receive`) — scan the PO QR (camera) **or** type the PO number / supplier **DN
   number**. Lines pre-fill from the PO; confirm lot, mfg/expiry and quantity, then post. This
   creates a **Goods Receipt** and **increases stock** (one inventory lot per line).
3. **Goods Receipt** (`/goods-receipts`) — the GR document (PDF) is the reference for matching the
   supplier's invoice.
4. **Supplier Invoice** (`/supplier-invoices`) — matched to a Goods Receipt → three-way match
   PO ↔ GR ↔ Supplier Invoice before payment.
5. **Delivery / Surat Jalan** (`/deliveries`) — deliver finish goods to a customer; stock is
   deducted **first-expiry-first-out**. Carries the customer PO number.
6. **Customer Invoice** (`/customer-invoices`) — raised from a Delivery Order; the **PO number**
   and **Surat Jalan (DO) number** are pulled in automatically, PPN 11% applied, PDF available.

## Modules

Dashboard · Purchase Orders · Receive · Goods Receipts · Supplier Invoices · Deliveries (Surat
Jalan) · Customer Invoices · Receivables · Inventory · Masters (Customers, Suppliers, Vendors,
Finish Goods, Raw Materials, Units). Every list supports search and full CRUD.

## API surface (REST, under `/api`)

```
GET/POST/PUT/DELETE  /customers /suppliers /vendors /units /raw-materials /finish-goods
GET/POST/PUT/DELETE  /inventory
GET/POST/PUT/DELETE  /purchase-orders        GET /purchase-orders/:id/pdf
                                             GET /purchase-orders/lookup/:key   (QR / PO no / DN)
GET/POST/DELETE      /goods-receipts         GET /goods-receipts/:id/pdf
GET/POST/PUT/DELETE  /supplier-invoices      GET /supplier-invoices/open-receipts
GET/POST/DELETE      /deliveries             GET /deliveries/:id/pdf
GET/POST/PUT/DELETE  /customer-invoices      GET /customer-invoices/:id/pdf
                                             GET /customer-invoices/open-deliveries
GET                  /dashboard
GET                  /health
```

## Project layout

```
matsumoto-erp/
├─ docker-compose.yml        # db + api + web
├─ .env.example
├─ server/                   # Express + Prisma API
│  ├─ prisma/schema.prisma   # full data model + document chain
│  ├─ prisma/seed.ts         # MTI sample data
│  └─ src/
│     ├─ index.ts            # app + route wiring
│     ├─ db.ts  stock.ts  pdf.ts  crud.ts
│     └─ routes/             # one file per module
└─ web/                      # React + Vite UI
   └─ src/
      ├─ App.tsx  lib/  pages/
```

## Notes

- QR **scanning** (camera) needs HTTPS or `localhost`; the manual PO/DN input always works.
- Stock is the single source of truth: receipts add lots, deliveries deduct FEFO, and you can
  adjust lots directly in Inventory.
- This is a development build — add authentication, RBAC and HTTPS before production (see the
  system-design proposal for the target architecture).
