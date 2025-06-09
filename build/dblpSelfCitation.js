
export async function fetchSelfCitationStats(pid) {

    const endpoint = 'https://sparql.dblp.org/sparql';
    const totalQuery = `PREFIX cito: <http://purl.org/spar/cito/>\nPREFIX dc: <http://purl.org/dc/terms/>\nSELECT (COUNT(*) as ?count) WHERE { ?citation cito:hasCitedEntity ?work . ?work dc:creator <https://dblp.org/pid/${pid}> }`;
    const selfQuery = `PREFIX cito: <http://purl.org/spar/cito/>\nPREFIX dc: <http://purl.org/dc/terms/>\nSELECT (COUNT(*) as ?count) WHERE { ?citation cito:hasCitedEntity ?cited . ?citation cito:hasCitingEntity ?citing . ?cited dc:creator <https://dblp.org/pid/${pid}> . ?citing dc:creator <https://dblp.org/pid/${pid}> }`;
    let total = 0;
    let self = 0;
    try {
        const totalRes = await fetch(`${endpoint}?query=${encodeURIComponent(totalQuery)}&format=json`);
        const totalJson = await totalRes.json();
        total = parseInt(totalJson.results?.bindings?.[0]?.count?.value ?? '0', 10);
    }
    catch (err) {
        console.warn('Failed to fetch total citations', err);
    }
    try {
        const selfRes = await fetch(`${endpoint}?query=${encodeURIComponent(selfQuery)}&format=json`);
        const selfJson = await selfRes.json();
        self = parseInt(selfJson.results?.bindings?.[0]?.count?.value ?? '0', 10);
    }
    catch (err) {
        console.warn('Failed to fetch self citations', err);
    }
    const rate = total > 0 ? self / total : 0;
    return { total, self, rate };
}
