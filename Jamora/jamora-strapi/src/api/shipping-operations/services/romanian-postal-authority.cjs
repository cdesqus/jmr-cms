"use strict";

// Deterministic subset of the Poșta Română postal-code dataset published at
// data.gov.ro/dataset/coduri-postale-romania. The UPU addressing specification
// defines the first two digits as the postal region/delivery area: one prefix
// per county, except Bucharest where 01-06 map to sectors 1-6.
const COUNTY_AUTHORITIES = Object.freeze([
  { code: "AB", prefix: "51", name: "Alba", localities: ["Alba Iulia"] },
  { code: "AR", prefix: "31", name: "Arad", localities: ["Arad"] },
  { code: "AG", prefix: "11", name: "Arges", localities: ["Pitesti"] },
  { code: "BC", prefix: "60", name: "Bacau", localities: ["Bacau"] },
  { code: "BH", prefix: "41", name: "Bihor", localities: ["Oradea"] },
  { code: "BN", prefix: "42", name: "Bistrita-Nasaud", localities: ["Bistrita"] },
  { code: "BT", prefix: "71", name: "Botosani", localities: ["Botosani"] },
  { code: "BV", prefix: "50", name: "Brasov", localities: ["Brasov"] },
  { code: "BR", prefix: "81", name: "Braila", localities: ["Braila"] },
  { code: "BZ", prefix: "12", name: "Buzau", localities: ["Buzau"] },
  { code: "CS", prefix: "32", name: "Caras-Severin", localities: ["Resita"] },
  { code: "CL", prefix: "91", name: "Calarasi", localities: ["Calarasi"] },
  { code: "CJ", prefix: "40", name: "Cluj", localities: ["Cluj", "Cluj-Napoca"] },
  { code: "CT", prefix: "90", name: "Constanta", localities: ["Constanta"] },
  { code: "CV", prefix: "52", name: "Covasna", localities: ["Sfantu Gheorghe"] },
  { code: "DB", prefix: "13", name: "Dambovita", localities: ["Targoviste"] },
  { code: "DJ", prefix: "20", name: "Dolj", localities: ["Craiova"] },
  { code: "GL", prefix: "80", name: "Galati", localities: ["Galati"] },
  { code: "GR", prefix: "08", name: "Giurgiu", localities: ["Giurgiu"] },
  { code: "GJ", prefix: "21", name: "Gorj", localities: ["Targu Jiu"] },
  { code: "HR", prefix: "53", name: "Harghita", localities: ["Miercurea Ciuc"] },
  { code: "HD", prefix: "33", name: "Hunedoara", localities: ["Deva", "Hunedoara"] },
  { code: "IL", prefix: "92", name: "Ialomita", localities: ["Slobozia"] },
  { code: "IS", prefix: "70", name: "Iasi", localities: ["Iasi"] },
  {
    code: "IF",
    prefix: "07",
    name: "Ilfov",
    localities: [
      "Bragadiru", "Buftea", "Chitila", "Magurele", "Otopeni", "Pantelimon",
      "Popesti-Leordeni", "Voluntari",
    ],
  },
  { code: "MM", prefix: "43", name: "Maramures", localities: ["Baia Mare"] },
  {
    code: "MH",
    prefix: "22",
    name: "Mehedinti",
    localities: ["Drobeta-Turnu Severin"],
  },
  { code: "MS", prefix: "54", name: "Mures", localities: ["Targu Mures"] },
  { code: "NT", prefix: "61", name: "Neamt", localities: ["Piatra Neamt"] },
  { code: "OT", prefix: "23", name: "Olt", localities: ["Slatina"] },
  { code: "PH", prefix: "10", name: "Prahova", localities: ["Ploiesti"] },
  { code: "SM", prefix: "44", name: "Satu Mare", localities: ["Satu Mare"] },
  { code: "SJ", prefix: "45", name: "Salaj", localities: ["Zalau"] },
  { code: "SB", prefix: "55", name: "Sibiu", localities: ["Sibiu"] },
  { code: "SV", prefix: "72", name: "Suceava", localities: ["Suceava"] },
  { code: "TR", prefix: "14", name: "Teleorman", localities: ["Alexandria"] },
  { code: "TM", prefix: "30", name: "Timis", localities: ["Timisoara"] },
  { code: "TL", prefix: "82", name: "Tulcea", localities: ["Tulcea"] },
  { code: "VS", prefix: "73", name: "Vaslui", localities: ["Vaslui"] },
  { code: "VL", prefix: "24", name: "Valcea", localities: ["Ramnicu Valcea"] },
  { code: "VN", prefix: "62", name: "Vrancea", localities: ["Focsani"] },
]);

function canonicalRomanianText(value) {
  return (typeof value === "string" ? value.trim() : "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("ro-RO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PREFIX_TO_COUNTY = new Map(
  COUNTY_AUTHORITIES.map(({ prefix, code }) => [prefix, code]),
);
const DISCOUNT_ELIGIBLE_COUNTIES = new Set([
  "B", "IF", "BV", "CJ", "CT", "DJ", "IS", "SB", "TM",
]);
const COUNTY_ALIASES = new Map();
const LOCALITY_TO_COUNTY = new Map();

function addCountyAlias(alias, code) {
  const canonical = canonicalRomanianText(alias);
  if (canonical) COUNTY_ALIASES.set(canonical, code);
}

function addLocality(locality, code) {
  const canonical = canonicalRomanianText(locality);
  if (canonical) LOCALITY_TO_COUNTY.set(canonical, code);
}

for (const authority of COUNTY_AUTHORITIES) {
  for (const alias of [
    authority.code,
    `RO-${authority.code}`,
    authority.name,
    `Judet ${authority.name}`,
    `Judetul ${authority.name}`,
    `${authority.name} County`,
  ]) {
    addCountyAlias(alias, authority.code);
  }
  for (const locality of authority.localities) addLocality(locality, authority.code);
}

for (const alias of [
  "B", "RO-B", "Bucuresti", "Bucharest", "Municipiul Bucuresti",
  "Municipality of Bucharest",
]) {
  addCountyAlias(alias, "B");
}
for (const locality of ["Bucuresti", "Bucharest"]) addLocality(locality, "B");

function resolveRomanianPostalAuthority(postalCode) {
  const value = typeof postalCode === "string" ? postalCode.trim() : "";
  if (!/^\d{6}$/.test(value)) return null;
  const prefix = value.slice(0, 2);
  if (/^0[1-6]$/.test(prefix)) {
    return { countyCode: "B", sector: Number(prefix[1]), prefix };
  }
  const countyCode = PREFIX_TO_COUNTY.get(prefix);
  return countyCode ? { countyCode, prefix } : null;
}

function resolveRomanianSubdivision(value) {
  const canonical = canonicalRomanianText(value);
  if (!canonical) return null;
  const sectorMatch =
    /^(?:(?:bucuresti|bucharest|municipiul bucuresti|municipality of bucharest) )?sector(?:ul)? ([1-6])$/.exec(
      canonical,
    ) ??
    /^sector(?:ul)? ([1-6]) (?:bucuresti|bucharest)$/.exec(canonical);
  if (sectorMatch) {
    return { countyCode: "B", sector: Number(sectorMatch[1]) };
  }
  const countyCode = COUNTY_ALIASES.get(canonical);
  return countyCode ? { countyCode } : null;
}

function normalizeRomanianCountyCode(value) {
  return resolveRomanianSubdivision(value)?.countyCode ?? "";
}

function resolveRomanianLocalityCounty(value) {
  return LOCALITY_TO_COUNTY.get(canonicalRomanianText(value)) ?? "";
}

function isRomanianDiscountEligibleCounty(value) {
  return DISCOUNT_ELIGIBLE_COUNTIES.has(value);
}

module.exports = {
  COUNTY_AUTHORITIES,
  canonicalRomanianText,
  isRomanianDiscountEligibleCounty,
  normalizeRomanianCountyCode,
  resolveRomanianLocalityCounty,
  resolveRomanianPostalAuthority,
  resolveRomanianSubdivision,
};
