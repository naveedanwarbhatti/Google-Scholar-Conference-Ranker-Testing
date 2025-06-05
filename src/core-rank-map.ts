/* src/core-rank-map.ts -------------------------------------------------- */
import CORE_2014 from "../core/CORE_2014.json";
import CORE_2017 from "../core/CORE_2017.json";
import CORE_2018 from "../core/CORE_2018.json";
import CORE_2020 from "../core/CORE_2020.json";
import CORE_2021 from "../core/CORE_2021.json";
import CORE_2023 from "../core/CORE_2023.json";

type RawRow = Record<string, unknown>;
const VALID = new Set(["A*", "A", "B", "C"]);

function parse(row: RawRow): { a: string | null; r: string | null } {
  const a =
    (row.acronym as string | undefined) ??
    (row.Acronym as string | undefined) ??
    null;
  const r =
    (row.rank as string | undefined) ??
    (row.Rating as string | undefined) ??
    (row.CORE_Rating as string | undefined) ??
    (row.Unranked as string | undefined) ??
    null;
  const rankNorm =
    r && typeof r === "string" ? r.trim().toUpperCase() : null;
  return { a: a ? a.trim().toUpperCase() : null, r: VALID.has(rankNorm!) ? rankNorm : null };
}

function mapOf(rows: RawRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of rows) {
    const { a, r } = parse(row);
    if (a && r) m.set(a, r);
  }
  return m;
}

export const MAP_2023 = mapOf(CORE_2023);
export const MAP_2021 = mapOf(CORE_2021);
export const MAP_2020 = mapOf(CORE_2020);
export const MAP_2018 = mapOf(CORE_2018);
export const MAP_2017 = mapOf(CORE_2017);
export const MAP_2014 = mapOf(CORE_2014);

function mapFor(year: number | null): Map<string, string> {
  if (year === null) return MAP_2023;
  if (year >= 2023) return MAP_2023;
  if (year >= 2021) return MAP_2021;
  if (year >= 2020) return MAP_2020;
  if (year >= 2018) return MAP_2018;
  if (year >= 2017) return MAP_2017;
  return MAP_2014;
}

/** Case-insensitive lookup; `year` optional. */
export function coreRankFor(acr: string | null | undefined, year: number | null = null): string {
  if (!acr) return "N/A";
  return mapFor(year).get(acr.trim().toUpperCase()) ?? "N/A";
}
