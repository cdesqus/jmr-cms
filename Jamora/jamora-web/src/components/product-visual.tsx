import { CATEGORY_META, type Product } from "@/lib/products";

/**
 * Studio-style product render for a Jamora sachet pouch. No photography exists
 * yet, so we draw a labelled stand-up pouch in SVG — soft studio background,
 * floor shadow, gloss highlight, and the product's own label — so the catalogue
 * reads like real product shots. Swap for <Image> once photography is shot.
 *
 * Gradient/filter ids are namespaced with the product id because SVG defs share
 * a global id space across all instances on the page.
 */
export function ProductVisual({
  product,
  className = "",
  rounded = "rounded-xl",
}: {
  product: Product;
  className?: string;
  rounded?: string;
}) {
  const [from, to] = product.gradient;
  const uid = product.id;
  const meta = CATEGORY_META[product.category];
  const nameLines = splitName(product.name);

  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      aria-hidden="true"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 400 500"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Studio backdrop */}
          <radialGradient id={`bg-${uid}`} cx="50%" cy="34%" r="80%">
            <stop offset="0%" stopColor="#fbf8f1" />
            <stop offset="60%" stopColor="#f2ead9" />
            <stop offset="100%" stopColor="#e6dac4" />
          </radialGradient>
          {/* Pouch body */}
          <linearGradient id={`pouch-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          {/* Gloss highlight down the left face */}
          <linearGradient id={`gloss-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
            <stop offset="28%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`shade-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
          </linearGradient>
          <filter id={`soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* Background */}
        <rect width="400" height="500" fill={`url(#bg-${uid})`} />

        {/* Floor shadow */}
        <ellipse
          cx="200"
          cy="446"
          rx="118"
          ry="20"
          fill="#3a2f22"
          opacity="0.22"
          filter={`url(#soft-${uid})`}
        />

        {/* Pouch */}
        <g>
          {/* Body */}
          <rect
            x="112"
            y="86"
            width="176"
            height="356"
            rx="16"
            fill={`url(#pouch-${uid})`}
          />
          {/* Right-side shading for roundness */}
          <rect x="112" y="86" width="176" height="356" rx="16" fill={`url(#shade-${uid})`} />
          {/* Left gloss */}
          <rect x="112" y="86" width="176" height="356" rx="16" fill={`url(#gloss-${uid})`} />

          {/* Top crimp seal */}
          <rect x="112" y="86" width="176" height="20" rx="8" fill="#000000" opacity="0.14" />
          <g stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1.4">
            {Array.from({ length: 17 }).map((_, i) => (
              <line key={i} x1={120 + i * 10} y1="90" x2={120 + i * 10} y2="102" />
            ))}
          </g>
          {/* Bottom gusset seam */}
          <line x1="124" y1="430" x2="276" y2="430" stroke="#000000" strokeOpacity="0.12" strokeWidth="2" />

          {/* Label panel */}
          <rect
            x="134"
            y="150"
            width="132"
            height="228"
            rx="12"
            fill="#faf6ee"
            opacity="0.96"
          />

          {/* Wordmark */}
          <text
            x="200"
            y="182"
            textAnchor="middle"
            style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            fontSize="19"
            fontWeight="600"
            letterSpacing="1"
            fill="#201b15"
          >
            Jamora
          </text>
          <line x1="164" y1="194" x2="236" y2="194" stroke={meta.colorVar} strokeWidth="1.5" />

          {/* Botanical mark */}
          <g transform="translate(200 232)" stroke={meta.colorVar} strokeWidth="2" fill="none" strokeLinecap="round">
            <path d="M0 26 C0 6 0 -8 0 -24" />
            <path d="M0 8 C-16 4 -24 -6 -27 -20" />
            <path d="M0 8 C16 4 24 -6 27 -20" />
            <path d="M0 -8 C-11 -12 -17 -21 -19 -32" />
            <path d="M0 -8 C11 -12 17 -21 19 -32" />
          </g>

          {/* Product name (1–2 lines) */}
          {nameLines.map((line, i) => (
            <text
              key={i}
              x="200"
              y={296 + i * 22}
              textAnchor="middle"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
              fontSize="17"
              fontWeight="500"
              fill="#201b15"
            >
              {line}
            </text>
          ))}

          {/* Botanical latin name */}
          <text
            x="200"
            y={296 + nameLines.length * 22 + 4}
            textAnchor="middle"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
            fontSize="9"
            fontStyle="italic"
            letterSpacing="0.5"
            fill="#8a7d6d"
          >
            {product.botanical}
          </text>

          {/* Category + net weight */}
          <text
            x="200"
            y="366"
            textAnchor="middle"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
            fontSize="8.5"
            fontWeight="600"
            letterSpacing="2"
            fill={meta.colorVar}
          >
            {meta.pillar.toUpperCase()} · {product.netWeight.split("·").pop()?.trim()}
          </text>
        </g>
      </svg>
    </div>
  );
}

/** Split a product name into at most two balanced lines for the label. */
function splitName(name: string): string[] {
  const words = name.split(" ");
  if (words.length <= 2 && name.length <= 15) return [name];
  // Find the split point closest to the middle by character count.
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ").length;
    const right = words.slice(i).join(" ").length;
    const diff = Math.abs(left - right);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}
