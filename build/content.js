// content.ts - Self-Citation Checker
import { fetchSelfCitationStats } from './dblpSelfCitation';
function sanitizeAuthorName(name) {
    let cleaned = name.trim();
    const patterns = [
        /[,\s]+ph\.d\.?$/i,
        /[,\s]+phd$/i,
        /[,\s]+dr\.?$/i,
        /[,\s]+prof\.?$/i,
        /[,\s]+professor$/i,
    ];
    for (const p of patterns)
        cleaned = cleaned.replace(p, '');
    cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ');
    return cleaned.trim();
}
function extractPidFromDblpUrl(url) {
    const m = url.match(/dblp\.org\/pid\/([\w/]+)\.html/i);
    return m ? m[1] : null;
}
async function searchDblp(author) {
    const q = new URL('https://dblp.org/search/author/api');
    q.searchParams.set('q', author);
    q.searchParams.set('format', 'json');
    try {
        const resp = await fetch(q.toString());
        const json = await resp.json();
        const hit = json?.result?.hits?.hit;
        if (!hit)
            return null;
        const first = Array.isArray(hit) ? hit[0] : hit;
        return extractPidFromDblpUrl(first?.info?.url ?? '') ?? null;
    }
    catch (err) {
        console.warn('DBLP search failed', err);
        return null;
    }
}
function insertPanel(text) {
    const panel = document.createElement('div');
    panel.id = 'self-citation-panel';
    panel.style.border = '1px solid #ccc';
    panel.style.padding = '6px';
    panel.style.marginBottom = '10px';
    panel.style.background = '#f7f7f7';
    panel.textContent = text;
    const container = document.querySelector('#gsc_prf');
    if (container) {
        container.prepend(panel);
    }
    else {
        document.body.prepend(panel);
    }
}
async function main() {
    const nameEl = document.getElementById('gsc_prf_in');
    if (!nameEl)
        return;
    const rawName = nameEl.textContent || '';
    const cleanName = sanitizeAuthorName(rawName);
    const pid = await searchDblp(cleanName);
    if (!pid) {
        insertPanel('DBLP author not found');
        return;
    }
    const stats = await fetchSelfCitationStats(pid);
    const percent = (stats.rate * 100).toFixed(1);
    insertPanel(`Self-citation rate: ${percent}% (${stats.self}/${stats.total})`);
}
main().catch(err => console.error('self-citation checker error', err));
