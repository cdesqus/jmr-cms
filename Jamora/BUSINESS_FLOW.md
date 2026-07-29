# Jamora - Business Flow & Flowcharts

Dokumen ini menjelaskan alur bisnis Jamora untuk fase demo, mulai dari pengadaan
barang ke pabrik pihak ketiga, penerimaan stok, penjualan, packing, pengiriman,
hingga traceability batch.

> **Batas fase demo:** checkout dianggap berhasil dibayar melalui mock-paid
> checkout. Integrasi pembayaran Stripe nyata dan webhook otomatis belum aktif.

## 1. System Overview

| Layer | Tool | Fungsi |
| --- | --- | --- |
| Storefront | Next.js | Katalog, cart, mock checkout, tracking customer |
| Jamora Admin | Next.js `/admin` | Operasional produk, order, supplier, PO, receiving, inventory, dan analytics |
| Backend / CMS | Strapi | API dan penyimpanan data bisnis |
| Database | PostgreSQL | Produk, order, supplier, PO, receipt, batch, dan audit log |
| Reverse proxy | Nginx | Satu domain untuk storefront, admin, dan API |
| Payment fase berikutnya | Stripe Checkout | Pembayaran nyata dan konfirmasi webhook |

## 2. Actors and Responsibilities

| Actor | Tanggung jawab |
| --- | --- |
| Store Owner / Admin | Produk, supplier, promosi, content, analytics, dan konfigurasi |
| Procurement | Membuat PO dan mengirim dokumen serta label logistik ke supplier |
| Third-party Factory | Produksi, memberi batch aktual, production date, expiry date, CoA, dan menempel label |
| Warehouse / Receiving | Memilih PO, scan carton, verifikasi barang, lalu menerima stok |
| Packing Team | Mengambil order paid, scan SKU/batch, packing, dan membuat delivery label |
| Customer | Belanja, checkout, dan melacak order |

## 3. End-to-End Business Flow

1. Admin membuat supplier dan menghubungkan produk yang dapat diproduksi supplier tersebut.
2. Procurement membuat purchase order untuk satu supplier dengan satu atau beberapa produk.
3. Jamora membuat dokumen PO dan label logistik generik untuk setiap carton.
4. PO dan file label dikirim ke pabrik pihak ketiga.
5. Pabrik memproduksi barang, mencetak/menempel label Jamora, dan mencatat data batch aktual.
6. Pabrik mengirim barang beserta packing list atau CoA.
7. Warehouse membuka menu **Receiving**, memilih PO, lalu scan label carton atau input manual.
8. Data batch aktual diverifikasi dari label pabrik, packing list, atau CoA.
9. Receipt disimpan; stok dan batch inventory bertambah sesuai jumlah yang benar-benar diterima.
10. Produk aktif dan stok tersedia ditampilkan di storefront.
11. Customer membuat order melalui mock-paid checkout selama fase demo.
12. Tim warehouse memproses order, scan item, packing, membuat delivery label, lalu mengirimnya.
13. Customer melacak order menggunakan order number atau tracking number.
14. Batch yang bermasalah dapat di-trace, dikarantina, atau di-recall dari Jamora Admin.

```mermaid
flowchart LR
    A[Admin manages products and suppliers] --> B[Procurement creates PO]
    B --> C[Jamora generates PO and generic carton labels]
    C --> D[Third-party factory produces goods]
    D --> E[Factory supplies actual batch data and CoA]
    E --> F[Warehouse selects PO in Receiving]
    F --> G[Scan carton label or enter quantity manually]
    G --> H[Verify batch, production date, and expiry date]
    H --> I[Post goods receipt]
    I --> J[Stock and batch inventory increase]
    J --> K[Product available on storefront]
    K --> L[Customer places paid demo order]
    L --> M[Warehouse scans and packs order]
    M --> N[Generate delivery label and ship]
    N --> O[Customer tracks and receives order]
```

## 4. Procurement and Factory Flow

### 4.1 Purchase Order

Satu PO hanya memiliki satu supplier, tetapi dapat berisi beberapa produk dan
beberapa line item. Informasi utama PO:

- PO number
- supplier
- expected delivery date
- product / SKU
- ordered quantity
- units per carton
- notes atau dokumen pendukung

Status PO:

| Status | Arti |
| --- | --- |
| `draft` | PO masih disiapkan |
| `ordered` | PO sudah dikirim ke supplier |
| `in_transit` | Opsional; supplier menyatakan barang sedang dikirim |
| `partially_received` | Sebagian barang sudah diterima |
| `received` | Seluruh kuantitas PO sudah diterima |
| `cancelled` | PO dibatalkan |

Status `in_transit` bukan syarat receiving. Warehouse dapat menerima langsung
dari PO berstatus `ordered` apabila barang sudah datang.

### 4.2 Two-label Model

Jamora menggunakan dua label dengan fungsi yang berbeda:

| Label | Dibuat oleh | Isi | Fungsi |
| --- | --- | --- | --- |
| Jamora logistics label | Jamora | PO, SKU/product ID, carton number, quantity, QR | Identifikasi carton dan scan receiving |
| Factory batch label | Pabrik | Batch aktual, production date, expiry date, informasi legal | Identitas produksi dan kepatuhan produk |

Dalam flow operasional yang disepakati, **label logistik generik Jamora tidak
memuat production date dan expiry date**. Tanggal tersebut harus berasal dari
hasil produksi aktual pabrik, bukan estimasi saat PO dibuat. QR Jamora berfungsi
sebagai identitas logistik dan penghubung carton ke PO.

> **Catatan implementasi demo saat ini:** payload QR carton hanya membawa PO,
> product ID, batch, carton, dan quantity. Namun form PO dan tampilan label cetak
> masih meminta serta menampilkan batch, production date, dan expiry date yang
> direncanakan. Nilai tersebut wajib diverifikasi terhadap label/CoA pabrik saat
> receiving. Pemisahan penuh menjadi label logistik generik dan label batch
> pabrik adalah penyelarasan berikutnya.

```mermaid
sequenceDiagram
    participant Admin as Jamora Procurement
    participant System as Jamora
    participant Factory as Third-party Factory
    participant Warehouse

    Admin->>System: Create PO with supplier and products
    System-->>Admin: Generate PO document and generic carton labels
    Admin->>Factory: Send PO and printable labels
    Factory->>Factory: Produce, pack, and attach labels
    Factory->>Admin: Send actual batch data, packing list, or CoA
    Factory->>Warehouse: Deliver cartons
    Warehouse->>System: Select PO and scan carton QR
    System-->>Warehouse: Match PO, product, carton, and expected quantity
    Warehouse->>System: Confirm actual batch data and received quantity
    System->>System: Create goods receipt and update stock
```

## 5. Receiving Flow

Receiving dilakukan dari menu **Receiving**, bukan dari Batches & Expiry.

1. Cari dan pilih PO yang barangnya datang.
2. Cocokkan supplier, produk, dan outstanding quantity.
3. Scan QR carton dengan USB scanner/kamera, atau pilih input manual.
4. Sistem mencocokkan kode dengan PO dan mencegah carton yang tidak sesuai.
5. Verifikasi quantity received dan damaged quantity.
6. Verifikasi batch number, production date, dan expiry date berdasarkan data aktual pabrik.
7. Isi nama penerima dan catatan jika diperlukan.
8. Submit receipt.
9. Sistem membuat goods receipt, memperbarui status PO, dan menambah batch inventory.

Untuk barang dalam jumlah besar, data aktual pabrik dapat disiapkan melalui CSV.
Jika file tidak tersedia, data batch cukup dimasukkan satu kali untuk carton dalam
batch yang sama lalu diterapkan ke carton terkait.

```mermaid
flowchart TD
    A[Goods arrive at warehouse] --> B[Open Receiving]
    B --> C[Select purchase order]
    C --> D{Receiving method}
    D -->|Scanner| E[Scan Jamora carton QR]
    D -->|Manual| F[Select product and enter quantity]
    E --> G{Code matches selected PO?}
    G -->|No| H[Reject scan and show mismatch]
    G -->|Yes| I[Load product, carton, and quantity]
    F --> I
    I --> J[Verify actual batch and dates]
    J --> K[Record received and damaged quantity]
    K --> L{All PO units received?}
    L -->|No| M[Set PO partially_received]
    L -->|Yes| N[Set PO received]
    M --> O[Create goods receipt and increase stock]
    N --> O
```

## 6. Inventory and Batch Flow

Menu **Inventory** menampilkan posisi stok operasional:

| Metric | Perhitungan / arti |
| --- | --- |
| On Hand | Seluruh unit fisik yang sudah diterima |
| Allocated | Unit yang sudah dialokasikan ke order aktif |
| Available | `On Hand - Allocated` |
| Incoming | Sisa unit dari PO aktif yang belum diterima |
| Projected | `Available + Incoming` |

Menu **Batches & Expiry** dipakai setelah receiving untuk:

- melihat stok per batch;
- menjalankan FEFO, yaitu mengambil batch aktif dengan expiry terdekat lebih dulu;
- melihat production dan expiry date;
- melihat jumlah available dan reserved;
- quarantine dan release batch;
- trace order/customer yang menerima suatu batch;
- recall batch bermasalah.

```mermaid
flowchart LR
    A[Open PO quantity] -->|not yet received| B[Incoming]
    C[Goods receipt] --> D[On Hand batch stock]
    D --> E[Available]
    E -->|order allocation| F[Reserved or Allocated]
    F -->|packed and shipped| G[Stock consumed]
    D -->|quality issue| H[Quarantine]
    H -->|approved| E
    H -->|unsafe| I[Recall and trace impacted orders]
```

## 7. Customer Order and Fulfilment Flow

Status order customer tidak sama dengan status PO supplier:

| Status | Arti | Tindakan berikutnya |
| --- | --- | --- |
| `pending` | Checkout dibuat, pembayaran belum dikonfirmasi | Tunggu pembayaran |
| `paid` | Pembayaran berhasil atau disimulasikan berhasil | Mulai packing |
| `processing` | Order sedang di-pick dan di-pack | Selesaikan checklist |
| `shipped` | Paket sudah diserahkan ke carrier | Customer tracking |
| `fulfilled` | Pengiriman/order selesai | Tidak ada tindakan gudang |
| `failed` | Pembayaran gagal | Review atau checkout ulang |
| `refunded` | Dana order dikembalikan | Tutup order/refund stock sesuai proses |

Packing scan memverifikasi SKU atau barcode batch terhadap item order. Scan ini
berbeda dari scan Receiving: Receiving memasukkan barang dari supplier, sedangkan
packing scan mengeluarkan barang untuk customer.

```mermaid
flowchart TD
    A[Customer adds products to cart] --> B[Mock-paid checkout]
    B --> C[Create paid order]
    C --> D[Allocate available stock using FEFO]
    D --> E[Warehouse opens Pack order]
    E --> F[Scan SKU or batch barcode]
    F --> G{All required items verified?}
    G -->|No| F
    G -->|Yes| H[Confirm packed by]
    H --> I[Generate delivery label with tracking QR]
    I --> J[Set order shipped]
    J --> K[Customer tracks shipment]
    K --> L[Set order fulfilled]
```

## 8. Traceability and Recall

Setiap shipment menyimpan alokasi batch. Karena itu sistem dapat menelusuri:

`Supplier -> PO -> Goods Receipt -> Batch -> Customer Order -> Customer`

```mermaid
flowchart LR
    A[Supplier] --> B[Purchase Order]
    B --> C[Goods Receipt]
    C --> D[Inventory Batch]
    D --> E[Order Batch Allocation]
    E --> F[Customer Order]
    F --> G[Customer]
    D -->|quality problem| H[Quarantine or Recall]
    H --> I[List impacted orders and customers]
```

## 9. Storefront Content and Product Flow

1. Admin memperbarui produk, stok, foto, harga, atau content EN/RO di Jamora Admin.
2. Data disimpan melalui Strapi ke PostgreSQL.
3. Storefront mengambil data terbaru dan melakukan cache/revalidation.
4. Produk nonaktif atau tanpa stok tidak dapat dibeli sesuai aturan storefront.
5. Perubahan content dapat terlihat setelah refresh atau cache direvalidasi.

## 10. Technical Request Routing

```mermaid
flowchart LR
    A[Browser] --> B[DNS or Cloudflare]
    B --> C[Nginx reverse proxy]
    C -->|Storefront and Jamora Admin| D[Next.js :3095]
    C -->|API and uploads| E[Strapi :9014]
    D -->|Docker internal URL| E
    E --> F[(PostgreSQL :5439 host mapping)]
```

## 11. Demo Versus Production Payment

### Active Demo Flow

```mermaid
sequenceDiagram
    participant Customer
    participant Storefront
    participant Strapi

    Customer->>Storefront: Submit checkout
    Storefront->>Strapi: Validate products and stock
    Storefront->>Strapi: Create mock-paid order
    Strapi->>Strapi: Reserve/decrement inventory
    Strapi-->>Storefront: Return order and tracking number
    Storefront-->>Customer: Show success page
```

### Future Stripe Flow

Stripe production integration must validate prices server-side, create Checkout
Session, verify webhook signatures, and make order creation idempotent. Secret
keys must remain server-side.

```mermaid
sequenceDiagram
    participant Customer
    participant Storefront
    participant Stripe
    participant Strapi

    Customer->>Storefront: Proceed to checkout
    Storefront->>Strapi: Validate latest price and stock
    Storefront->>Stripe: Create Checkout Session
    Stripe-->>Customer: Hosted payment page
    Stripe->>Storefront: Signed payment webhook
    Storefront->>Stripe: Verify signature
    Storefront->>Strapi: Idempotently create paid order
    Strapi-->>Customer: Order available for tracking
```

## 12. Current Feature Status

| Capability | Status |
| --- | --- |
| Jamora Admin authentication and role-ready navigation | Demo ready |
| Product, stock, photo, supplier assignment, EN/RO content | Demo ready |
| Supplier master and multi-item purchase order | Demo ready |
| Carton QR for PO/product/carton/quantity matching | Demo ready |
| Fully generic printed label without production/expiry data | Design agreed; implementation pending |
| PO receiving by scan, camera, simulation, or manual input | Demo ready |
| Partial receipt and damaged quantity | Demo ready |
| Goods receipt audit record | Demo ready |
| Inventory projection and low-stock alerts | Demo ready |
| Batch, expiry, FEFO, quarantine, trace, and recall | Demo ready |
| Mock-paid customer checkout | Demo ready |
| Pick/pack scan, delivery label, and tracking | Demo ready |
| Visit, sales, omzet, and estimated profit analytics | Demo ready |
| Stripe Checkout and webhook | Future phase |
| Automated supplier ASN/EDI integration | Future phase |
