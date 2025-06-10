"use strict";
// background.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// --- Type Definitions ---
// Note: These are now read globally by the TS compiler, no imports needed.
// The official, recommended DBLP SPARQL endpoint
const DBLP_SPARQL_ENDPOINT = "https://sparql.dblp.org/sparql";
// --- SPARQL Query Execution ---
function executeSparqlQuery(query) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${DBLP_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&output=json`;
        try {
            const response = yield fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } });
            if (!response.ok)
                throw new Error(`HTTP error! status: ${response.status}`);
            return yield response.json();
        }
        catch (error) {
            console.error("SPARQL Query Error:", error);
            throw error;
        }
    });
}
// --- Main Logic Handler ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processAuthor") {
        (() => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                // --- CHANGE 1: Make the search query flexible and case-insensitive ---
                const authorSearchQuery = `
          PREFIX dblp: <https://dblp.org/rdf/schema#>
          SELECT ?author_uri ?author_name
          WHERE {
            ?author_uri a dblp:Person .
            ?author_uri dblp:primaryFullPersonName ?author_name .
            FILTER(CONTAINS(LCASE(?author_name), LCASE("${request.authorName}")))
          }`;
                const authorResults = yield executeSparqlQuery(authorSearchQuery);
                const potentialProfiles = authorResults.results.bindings;
                if (potentialProfiles.length === 0) {
                    sendResponse({ status: 'error', message: 'DBLP profile not found.' });
                    return;
                }
                // --- CHANGE 2: Restore the verification loop to find the correct profile ---
                let verifiedAuthorUri = null;
                for (const profile of potentialProfiles) {
                    const dblpAuthorUri = profile.author_uri.value;
                    const publicationsQuery = `
            PREFIX dblp: <https://dblp.org/rdf/schema#>
            SELECT ?title
            WHERE {
              <${dblpAuthorUri}> dblp:authored ?paper .
              ?paper dblp:title ?title .
            } LIMIT 100`; // Limit to first 100 publications for performance
                    const publicationsResult = yield executeSparqlQuery(publicationsQuery);
                    const dblpTitles = publicationsResult.results.bindings.map(p => p.title.value.toLowerCase().trim());
                    const scholarTitles = request.publicationTitles.map(t => t.toLowerCase().trim());
                    // Count how many of the top Google Scholar titles appear in the DBLP publication list
                    const matchCount = scholarTitles.filter(scholarTitle => dblpTitles.some(dblpTitle => dblpTitle === scholarTitle)).length;
                    if (matchCount >= 3) { // Verification threshold from your project spec
                        verifiedAuthorUri = dblpAuthorUri;
                        break; // Found a verified match, stop searching.
                    }
                }
                if (!verifiedAuthorUri) {
                    sendResponse({ status: 'error', message: 'Could not verify a DBLP profile. (Found profiles, but publication match failed)' });
                    return;
                }
                // --- Proceed with the verified URI ---
                const totalCitationsQuery = `
          PREFIX dblp: <https://dblp.org/rdf/schema#>
          SELECT (COUNT(DISTINCT ?citing_paper) AS ?total_citations) WHERE {
            BIND(<${verifiedAuthorUri}> AS ?author_uri)
            ?authored_paper dblp:authoredBy ?author_uri .
            ?citing_paper dblp:cites ?authored_paper .
          }`;
                const selfCitationsQuery = `
          PREFIX dblp: <https://dblp.org/rdf/schema#>
          SELECT (COUNT(DISTINCT ?citing_paper) AS ?self_citations) WHERE {
            BIND(<${verifiedAuthorUri}> AS ?author_uri)
            ?authored_paper dblp:authoredBy ?author_uri .
            ?citing_paper dblp:cites ?authored_paper .
            ?citing_paper dblp:authoredBy ?author_uri .
          }`;
                const [totalResult, selfResult] = yield Promise.all([
                    executeSparqlQuery(totalCitationsQuery),
                    executeSparqlQuery(selfCitationsQuery)
                ]);
                const totalCitations = parseInt((_c = (_b = (_a = totalResult.results.bindings[0]) === null || _a === void 0 ? void 0 : _a.total_citations) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : '0', 10);
                const selfCitations = parseInt((_f = (_e = (_d = selfResult.results.bindings[0]) === null || _d === void 0 ? void 0 : _d.self_citations) === null || _e === void 0 ? void 0 : _e.value) !== null && _f !== void 0 ? _f : '0', 10);
                const percentage = totalCitations === 0 ? 0 : (selfCitations / totalCitations) * 100;
                sendResponse({ status: 'success', selfCitations, totalCitations, percentage });
            }
            catch (error) {
                sendResponse({ status: 'error', message: `DBLP API Error: ${error.message}` });
            }
        }))();
        return true; // Indicate asynchronous response.
    }
});
