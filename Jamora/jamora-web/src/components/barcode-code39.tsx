const CODE39: Record<string, string> = {
  "0": "nnwwnwnnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw",
  C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww",
  O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw",
  W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
  "$": "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn",
};

export function BarcodeCode39({ value, className = "h-14 w-full" }: { value: string; className?: string }) {
  const normalized = value.toUpperCase().split("").filter((character) => CODE39[character]).join("");
  const encoded = `*${normalized || "UNKNOWN"}*`;
  const narrow = 2;
  const wide = 5;
  const gap = 2;
  let x = 0;
  const bars: { x: number; width: number }[] = [];

  for (const character of encoded) {
    CODE39[character].split("").forEach((widthCode, index) => {
      const width = widthCode === "w" ? wide : narrow;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
    x += gap;
  }

  return (
    <svg className={className} viewBox={`0 0 ${x} 48`} preserveAspectRatio="none" role="img" aria-label={`Barcode ${normalized}`}>
      <rect width={x} height="48" fill="white" />
      {bars.map((bar, index) => <rect key={`${bar.x}-${index}`} x={bar.x} width={bar.width} height="48" fill="black" />)}
    </svg>
  );
}
