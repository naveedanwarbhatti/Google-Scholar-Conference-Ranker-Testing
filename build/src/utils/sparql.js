"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSparql = runSparql;
exports.getVenueInfoByTitle = getVenueInfoByTitle;
exports.fetchPublicationInfo = fetchPublicationInfo;
const core_rank_map_1 = require("../core-rank-map");
const ENDPOINT = "https://sparql.dblp.org/sparql";
/** Low-level helper */
async function runSparql(query) {
    const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/sparql-query",
            Accept: "application/sparql-results+json",
        },
        body: query,
    });
    if (!res.ok) {
        throw new Error(`SPARQL ${res.status}: ${await res.text()}`);
    }
    return res.json();
}
/** Get venue acronym + label for an *exact* publication title. */
async function getVenueInfoByTitle(normTitle) {
    const query = `
PREFIX dblp: <https://dblp.org/rdf/schema#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?acronym ?vLabel WHERE {
  ?publ dblp:title ?t .
  FILTER (lcase(str(?t)) = "${normTitle.toLowerCase().replace(/"/g, '\\"')}")
  ?publ dblp:publishedInStream ?venue .
  OPTIONAL { ?venue dblp:acronym ?acronym }
  OPTIONAL { ?venue rdfs:label ?vLabel }
}
LIMIT 1`;
    const { results } = await runSparql(query);
    if (!results.bindings.length)
        return { acronym: null, venueLabel: null };
    const b = results.bindings[0];
    return {
        acronym: b.acronym?.value ?? null,
        venueLabel: b.vLabel?.value ?? null,
    };
}
/** Full publication lookup, returning everything the ranker needs. */
async function fetchPublicationInfo(normTitle, gsUrl) {
    const { acronym, venueLabel } = await getVenueInfoByTitle(normTitle);
    return {
        titleText: normTitle,
        url: gsUrl,
        rank: mapAcronymToCoreRank(acronym ?? venueLabel ?? ""),
    };
}
/** Trivial map – keep your existing mapping table here. */
function mapAcronymToCoreRank(acr) {
    return (0, core_rank_map_1.coreRankFor)(acr);
}
