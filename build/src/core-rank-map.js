"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAP_2014 = exports.MAP_2017 = exports.MAP_2018 = exports.MAP_2020 = exports.MAP_2021 = exports.MAP_2023 = void 0;
exports.coreRankFor = coreRankFor;
/* src/core-rank-map.ts -------------------------------------------------- */
const CORE_2014_json_1 = __importDefault(require("../core/CORE_2014.json"));
const CORE_2017_json_1 = __importDefault(require("../core/CORE_2017.json"));
const CORE_2018_json_1 = __importDefault(require("../core/CORE_2018.json"));
const CORE_2020_json_1 = __importDefault(require("../core/CORE_2020.json"));
const CORE_2021_json_1 = __importDefault(require("../core/CORE_2021.json"));
const CORE_2023_json_1 = __importDefault(require("../core/CORE_2023.json"));
const VALID = new Set(["A*", "A", "B", "C"]);
function parse(row) {
    const a = row.acronym ??
        row.Acronym ??
        null;
    const r = row.rank ??
        row.Rating ??
        row.CORE_Rating ??
        row.Unranked ??
        null;
    const rankNorm = r && typeof r === "string" ? r.trim().toUpperCase() : null;
    return { a: a ? a.trim().toUpperCase() : null, r: VALID.has(rankNorm) ? rankNorm : null };
}
function mapOf(rows) {
    const m = new Map();
    for (const row of rows) {
        const { a, r } = parse(row);
        if (a && r)
            m.set(a, r);
    }
    return m;
}
exports.MAP_2023 = mapOf(CORE_2023_json_1.default);
exports.MAP_2021 = mapOf(CORE_2021_json_1.default);
exports.MAP_2020 = mapOf(CORE_2020_json_1.default);
exports.MAP_2018 = mapOf(CORE_2018_json_1.default);
exports.MAP_2017 = mapOf(CORE_2017_json_1.default);
exports.MAP_2014 = mapOf(CORE_2014_json_1.default);
function mapFor(year) {
    if (year === null)
        return exports.MAP_2023;
    if (year >= 2023)
        return exports.MAP_2023;
    if (year >= 2021)
        return exports.MAP_2021;
    if (year >= 2020)
        return exports.MAP_2020;
    if (year >= 2018)
        return exports.MAP_2018;
    if (year >= 2017)
        return exports.MAP_2017;
    return exports.MAP_2014;
}
/** Case-insensitive lookup; `year` optional. */
function coreRankFor(acr, year = null) {
    if (!acr)
        return "N/A";
    return mapFor(year).get(acr.trim().toUpperCase()) ?? "N/A";
}
