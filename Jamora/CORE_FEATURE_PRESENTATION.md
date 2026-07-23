# JAMORA

## Core Feature Presentation

**Premium Indonesian Herbal E-Commerce for Europe**  
*Energi · Digestie · Echlibru*

---

## 1. Product Vision

Jamora membawa jamu premium Indonesia ke pasar Eropa melalui pengalaman belanja yang modern, informatif, dan terpercaya.

- Menggabungkan warisan herbal Indonesia dengan standar pasar Eropa
- Menempatkan transparansi produk sebagai bagian utama pengalaman pelanggan
- Menggunakan mata uang Euro (€) sebagai standar transaksi
- Dibangun sebagai platform commerce sekaligus media brand storytelling

---

## 2. Premium Storefront

Website customer dirancang untuk memperkenalkan brand dan memudahkan proses pembelian.

- Homepage dengan narasi dan identitas premium Jamora
- Katalog produk dengan tampilan responsif
- Halaman detail produk yang informatif
- Navigasi cepat dari eksplorasi produk hingga cart
- Server-side rendering untuk performa dan SEO yang lebih baik

**Value:** pelanggan dapat mengenal manfaat, kualitas, dan cerita produk sebelum membeli.

---

## 3. Three Wellness Pillars

Seluruh katalog disusun berdasarkan tiga kebutuhan utama pelanggan:

| Pillar | Fokus Manfaat |
| --- | --- |
| **Energy** | Mendukung energi dan vitalitas harian |
| **Digestion** | Mendukung kenyamanan dan kesehatan pencernaan |
| **Balance** | Mendukung keseimbangan tubuh dan gaya hidup |

Kategori ini digunakan secara konsisten pada katalog, navigasi, merchandising, dan analitik.

---

## 4. Transparent Product Information

Setiap produk dapat menyajikan informasi penting secara terstruktur:

- Komposisi dan transparansi bahan
- Manfaat utama produk
- Petunjuk konsumsi
- Informasi alergen
- Harga dalam Euro
- Status dan jumlah stok
- Badge sertifikasi seperti Organic, Vegan, EU Compliant, dan GMP

**Value:** meningkatkan kepercayaan pelanggan dan mendukung kebutuhan compliance pasar Eropa.

---

## 5. Cart & Checkout Experience

Alur pembelian dibuat sederhana dari katalog sampai konfirmasi order.

1. Customer memilih produk
2. Produk ditambahkan ke cart
3. Cart menghitung jumlah dan subtotal
4. Customer melanjutkan checkout
5. Sistem mencatat order dan menampilkan halaman konfirmasi

Cart tersimpan di browser sehingga item tetap tersedia saat customer berpindah halaman.

> **Current status:** alur checkout demo sudah tersedia. Manual bank
> transfer/RoPay dan callback provider terverifikasi belum diaktifkan.

Phase 0 adds a Romania-first checkout foundation:

- guest checkout stays available without implicit account creation;
- optional verified customer accounts support registration, login, logout, and
  password recovery;
- Romanian addresses are stored as structured fields plus a formatted snapshot;
- every new order captures immutable EUR reference and RON checkout values,
  including exchange rate source and timestamp;
- essential, analytics, and lifecycle-email consent are versioned separately,
  with optional categories off by default; every explicit choice is persisted
  append-only per purpose, including denial and later withdrawal.

Customer accounts and structured checkout have separate rollout flags, so
either feature can be disabled without disabling the other.

---

## 6. Content & Product Management

Admin dapat mengelola operasional toko melalui CMS dan dashboard internal.

- Membuat dan memperbarui produk
- Mengatur harga, kategori, deskripsi, dan media
- Mengelola konten storefront
- Melihat daftar produk dan detail order
- Mengubah status order sesuai proses operasional

Perubahan data tersimpan di database dan digunakan oleh storefront sebagai sumber data produk.

---

## 7. Inventory & Order Operations

Platform mendukung proses setelah customer melakukan checkout.

- Tracking stok setiap produk
- Pengurangan stok pada transaksi demo yang berhasil
- Monitoring order dari dashboard admin
- Status order untuk membedakan proses pembayaran dan fulfillment
- Halaman tracking agar customer dapat melihat perkembangan order
- Delivery label untuk membantu proses pengiriman

**Value:** operasional produk, order, dan pengiriman berada dalam satu alur yang terhubung.

---

## 8. Business Analytics

Jamora mencatat data kunjungan dan transaksi untuk memberikan ringkasan performa bisnis.

- Total visits dan visits hari ini
- Jumlah penjualan
- Total omzet dan omzet hari ini
- Estimasi gross profit
- Estimasi margin
- Visualisasi performa pada dashboard admin

Estimasi profit menggunakan rasio biaya yang dapat dikonfigurasi melalui `JAMORA_COST_RATIO`.

**Contoh:** cost ratio 42% menghasilkan estimasi gross margin 58% dari omzet.

---

## 9. Europe-Ready Foundation

Platform disiapkan untuk kebutuhan ekspansi ke pasar Eropa.

- English-first dengan fondasi multi-language
- Dukungan pilihan bahasa pada storefront
- Harga utama dalam Euro (€)
- Cookie consent untuk kebutuhan privasi
- Struktur data compliance dan sertifikasi produk
- Arsitektur headless yang mudah dikembangkan

Payment remains mock in Phase 0. Live bank transfer/RoPay integration and
verified provider callbacks are planned for Phase 2; browser success alone will
not be treated as proof of payment.

---

## 10. Core System Flow

```mermaid
flowchart LR
    A[Admin manages products] --> B[(Product & content data)]
    B --> C[Jamora Storefront]
    C --> D[Customer explores products]
    D --> E[Cart & Checkout]
    E --> F[Order created]
    F --> G[Inventory updated]
    F --> H[Admin processes order]
    H --> I[Customer tracks delivery]
    C --> J[Visit Analytics]
    F --> K[Sales & Profit Analytics]
```

---

## 11. Current Product Readiness

An overview of Jamora's core feature readiness based on the current implementation:

| Area | Status | Short Description |
| --- | --- | --- |
| Premium storefront | **Ready** | The customer website is responsive and reflects Jamora's premium brand identity. |
| Product catalog & detail | **Ready** | Customers can browse products, prices, information, and detailed product pages. |
| Three wellness categories | **Ready** | Products are organized into Energy, Digestion, and Balance categories. |
| Browser-based cart | **Ready** | Customers can add products and keep their cart saved in the browser. |
| CMS product management | **Ready** | Admins can create, update, and manage product information. |
| Inventory tracking | **Ready** | Product stock can be monitored and reduced after a successful demo transaction. |
| Order management & tracking | **Ready** | Admins can manage orders, while customers can check their order status. |
| Visit, sales, revenue & profit analytics | **Ready** | The dashboard displays visits, sales, revenue, and estimated profit. |
| Demo checkout flow | **Ready** | The checkout journey can be demonstrated without processing a real payment. |
| Guest + verified customer identity | **Automated verification complete; live smoke pending** | Guest orders require no account. Production accounts stay disabled until Phase 6 adds verification/recovery delivery. |
| Romania structured address | **Automated verification complete; live smoke pending** | Checkout can persist editable `RO` address fields and a formatted snapshot. |
| EUR/RON immutable price snapshot | **Automated verification complete; live smoke pending** | Orders retain integer minor-unit amounts, rate, source, and timestamp. |
| Versioned consent categories | **Automated verification complete; live smoke pending** | Necessary, analytics, and lifecycle-email decisions are persisted append-only per purpose; optional processing defaults off. |
| Live bank transfer/RoPay + verified callback | **Phase 2** | Live settlement and idempotent provider confirmation have not been activated; other providers may later use the same interface. |

---

# JAMORA

### Indonesian Heritage. European Standard. Modern Commerce.

**Energi · Digestie · Echlibru**
