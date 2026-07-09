import { CATEGORY_META, type Category, type Certification } from "@/lib/products";

export function CategoryPill({
  category,
  className = "",
}: {
  category: Category;
  className?: string;
}) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${className}`}
      style={{ color: meta.colorVar }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: meta.colorVar }}
      />
      {meta.label}
    </span>
  );
}

export function CertificationBadges({
  items,
  className = "",
}: {
  items: Certification[];
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((c) => (
        <li
          key={c}
          className="rounded-full border border-clay bg-cream/60 px-3 py-1 text-[0.7rem] font-medium tracking-wide text-bark"
        >
          {c}
        </li>
      ))}
    </ul>
  );
}
