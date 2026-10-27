// Meister Guest Map report: a printable two page report (US heat map + breakdown by area)
// built from the Guest count and ZIP on each Meister profile. No guest names are used.
import { ZIP5 } from "./zip5.js?v=202610271002";
import { ZIP3 } from "./zip3.js?v=202610271002";

export const REGIONS = {
  Northeast: "CT ME MA NH RI VT NJ NY PA",
  Midwest: "IL IN MI OH WI IA KS MN MO NE ND SD",
  South: "DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX PR",
  West: "AZ CO ID MT NV NM UT WY AK CA HI OR WA",
};
const REGION_OF = {};
Object.entries(REGIONS).forEach(([r, list]) => list.split(" ").forEach((s) => (REGION_OF[s] = r)));
const STATE_NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico" };
const FIPS = { "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "72": "PR" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (n) => (n == null || isNaN(n) ? "—" : (Math.round(n * 10) / 10).toLocaleString());
const pct = (n) => (n == null || isNaN(n) ? "—" : `${Math.round(n * 100)}%`);
const median = (arr) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function stateOf(m) {
  const st = String(m.state || "").toUpperCase().trim();
  if (STATE_NAMES[st]) return st;
  const zip = String(m.zip || "").replace(/\D/g, "");
  const z = ZIP5[zip.slice(0, 5)] || ZIP3[zip.slice(0, 3)];
  return z ? z[3] : "";
}
function group(list, keyFn) {
  const out = new Map();
  list.forEach((m) => { const k = keyFn(m); if (!out.has(k)) out.set(k, []); out.get(k).push(m); });
  return out;
}
function stats(all) {
  const rep = all.filter((m) => m.guest_estimate != null);
  const counts = rep.map((m) => m.guest_estimate);
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    meisters: all.length, reporting: rep.length, total,
    avg: rep.length ? total / rep.length : null, median: median(counts), max: counts.length ? Math.max(...counts) : null,
    zeros: counts.filter((c) => c === 0).length,
  };
}

export function buildGuestMapReport(meisters, opts = {}) {
  const libs = Object.assign({
    d3array: "https://cdn.jsdelivr.net/npm/d3-array@3/dist/d3-array.min.js",
    d3geo: "https://cdn.jsdelivr.net/npm/d3-geo@3/dist/d3-geo.min.js",
    topojson: "https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js",
    atlas: "https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json",
  }, opts.libs || {});
  const list = meisters.map((m) => ({ ...m, _state: stateOf(m) })).map((m) => ({ ...m, _region: REGION_OF[m._state] || "No location" }));
  const rep = list.filter((m) => m.guest_estimate != null);
  const nat = stats(list);

  // bubbles: guests summed by city, placed at the 5 digit ZIP (3 digit area only as a fallback)
  const areas = new Map();
  const offMap = [];
  rep.forEach((m) => {
    const zip = String(m.zip || "").replace(/\D/g, "");
    const z5 = ZIP5[zip.slice(0, 5)];
    const z = z5 || ZIP3[zip.slice(0, 3)];
    if (!z) { offMap.push(m); return; }
    const city = z5 ? z5[2] : (String(m.city || "").trim() || z[2]);
    const key = (city + "|" + z[3]).toLowerCase();
    if (!areas.has(key)) areas.set(key, { city, state: z[3], latSum: 0, lngSum: 0, zips: new Set(), guests: 0, meisters: 0 });
    const a = areas.get(key); a.guests += m.guest_estimate; a.meisters += 1; a.latSum += z[0]; a.lngSum += z[1]; a.zips.add(z5 ? zip.slice(0, 5) : zip.slice(0, 3) + "xx");
  });
  const areaList = [...areas.values()].map((a) => ({ ...a, lat: a.latSum / a.meisters, lng: a.lngSum / a.meisters, zipList: [...a.zips].sort() })).sort((a, b) => b.guests - a.guests);

  // states
  const byState = [...group(list.filter((m) => m._state), (m) => m._state).entries()].map(([st, ms]) => ({ st, name: STATE_NAMES[st] || st, region: REGION_OF[st] || "", ...stats(ms) }))
    .sort((a, b) => b.total - a.total || b.reporting - a.reporting);
  const stateTotals = Object.fromEntries(byState.map((s) => [s.st, s.total]));

  // regions
  const regionNames = ["South", "Northeast", "West", "Midwest"].concat(list.some((m) => m._region === "No location") ? ["No location"] : []);
  const byRegion = regionNames.map((r) => {
    const ms = list.filter((m) => m._region === r);
    const s = stats(ms);
    const sts = byState.filter((x) => x.region === r && x.total);
    return { r, ...s, share: nat.total ? s.total / nat.total : null, coverage: s.meisters ? s.reporting / s.meisters : null, topState: sts[0] ? sts[0].name : "—" };
  });

  // spread by region
  const BUCKETS = [["0", 0, 0], ["1–5", 1, 5], ["6–10", 6, 10], ["11–20", 11, 20], ["21+", 21, Infinity]];
  const spread = byRegion.filter((x) => x.r !== "No location").map((x) => ({ r: x.r, cells: BUCKETS.map(([, lo, hi]) => rep.filter((m) => m._region === x.r && m.guest_estimate >= lo && m.guest_estimate <= hi).length) }));

  // concentration
  const sortedCounts = rep.map((m) => m.guest_estimate).sort((a, b) => b - a);
  const topN = Math.max(1, Math.ceil(sortedCounts.length * 0.2));
  const top20share = nat.total ? sortedCounts.slice(0, topN).reduce((a, b) => a + b, 0) / nat.total : null;
  const top5areasShare = nat.total ? areaList.slice(0, 5).reduce((t, a) => t + a.guests, 0) / nat.total : null;
  const topState = byState[0];

  // dealerships: one row per dealership, guests summed across its Meisters
  const dmap = new Map();
  list.forEach((m) => {
    const name = String(m.dealership || "").trim() || `${m.name || "Unnamed"} (no dealership)`;
    const k = name.toLowerCase();
    const zc = ZIP5[String(m.zip || "").replace(/\D/g, "").slice(0, 5)];
    if (!dmap.has(k)) dmap.set(k, { name, city: m.city || (zc ? zc[2] : ""), state: m._state, guests: null });
    const d = dmap.get(k);
    if (!d.city && (m.city || zc)) d.city = m.city || zc[2];
    if (!d.state && m._state) d.state = m._state;
    if (m.guest_estimate != null) d.guests = (d.guests || 0) + m.guest_estimate;
  });
  const dealerRows = [...dmap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const PER_DEALER_PAGE = 114;
  const dealerChunks = [];
  for (let i = 0; i < dealerRows.length; i += PER_DEALER_PAGE) dealerChunks.push(dealerRows.slice(i, i + PER_DEALER_PAGE));
  const totalPages = 2 + Math.max(1, dealerChunks.length);
  const recorded = dealerRows.filter((d) => d.guests != null).length;

  const generated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const maxState = Math.max(1, ...byState.map((s) => s.total));
  const maxArea = Math.max(1, ...areaList.map((a) => a.guests));
  const maxRegionShare = Math.max(0, ...byRegion.filter((x) => x.r !== "No location").map((x) => x.share || 0));

  const kpi = (v, l) => `<div class="k"><b>${v}</b><span>${l}</span></div>`;
  const page1 = `
  <section class="page">
    <header class="hd"><div><div class="eyebrow">GR GT CONCIERGE · MEISTER GUEST MAP</div><h1>Where the guests are</h1></div>
      <div class="meta">${esc(opts.filterLabel || "All concierges")}<br>Generated ${esc(generated)}${opts.by ? ` by ${esc(opts.by)}` : ""}</div></header>
    <div class="kpis">
      ${kpi(nat.total.toLocaleString(), "Total guests")}
      ${kpi(`${nat.reporting}<small> / ${nat.meisters}</small>`, "Meisters with a count")}
      ${kpi(r1(nat.avg), "Average per Meister")}
      ${kpi(r1(nat.median), "Median per Meister")}
      ${kpi(String(dealerRows.length), "Dealerships")}
      ${kpi(topState ? esc(topState.st) : "—", `Top state${topState ? ` · ${topState.total} guests` : ""}`)}
    </div>
    <div class="maprow">
      <div class="mapbox"><svg id="map" viewBox="0 0 975 610" preserveAspectRatio="xMidYMin meet"></svg>
        <div class="legend"><span>State total</span><span class="lo">0</span><i class="ramp"></i><span class="hi">${maxState}</span><span class="dot"></span><span>Bubble = guests in that city</span></div>
      </div>
      <aside class="side">
        <h3>Top cities</h3>
        <ol class="areas">${areaList.slice(0, 6).map((a) => `<li><b>${esc(a.city)}, ${esc(a.state)}</b><span>${a.meisters} Meister${a.meisters === 1 ? "" : "s"}</span><em>${a.guests}</em></li>`).join("") || `<li class="none">No ZIP codes yet</li>`}</ol>
        <h3>Quick read</h3>
        <ul class="notes">
          ${topState ? `<li><b>${esc(topState.name)}</b> leads with ${topState.total} guests (${pct(nat.total ? topState.total / nat.total : null)} of all).</li>` : ""}
          ${byRegion.filter((x) => x.r !== "No location").sort((a, b) => b.total - a.total)[0] ? (() => { const t = byRegion.filter((x) => x.r !== "No location").sort((a, b) => b.total - a.total)[0]; return `<li>The <b>${t.r}</b> holds ${pct(t.share)} of guests across ${t.reporting} Meisters.</li>`; })() : ""}
          ${top20share != null ? `<li>The top 20% of Meisters (${topN}) account for <b>${pct(top20share)}</b> of guests.</li>` : ""}
          ${top5areasShare != null && areaList.length > 5 ? `<li>The top 5 cities hold <b>${pct(top5areasShare)}</b> of guests.</li>` : ""}
          ${nat.meisters - nat.reporting ? `<li><b>${nat.meisters - nat.reporting}</b> Meister${nat.meisters - nat.reporting === 1 ? " has" : "s have"} no guest count yet.</li>` : ""}
          ${offMap.length ? `<li>${offMap.length} Meister${offMap.length === 1 ? "" : "s"} with a count but no valid ZIP ${offMap.length === 1 ? "is" : "are"} not on the map.</li>` : ""}
        </ul>
      </aside>
    </div>
    <footer class="ft"><span>Guest counts come from each Meister profile. Numbers only, no guest names.</span><span>Page 1 / ${totalPages}</span></footer>
  </section>`;

  const page2 = `
  <section class="page">
    <header class="hd small"><div><div class="eyebrow">MEISTER GUEST MAP · BREAKDOWN BY AREA</div></div><div class="meta">${esc(opts.filterLabel || "All concierges")} · ${esc(generated)}</div></header>
    <h2>By region</h2>
    <table class="t">
      <thead><tr><th>Region</th><th>Meisters</th><th>With count</th><th>Guests</th><th>Share</th><th>Average</th><th>Median</th><th>Highest</th><th>Top state</th></tr></thead>
      <tbody>${byRegion.map((x) => `<tr><td><b>${x.r}</b></td><td>${x.meisters}</td><td>${x.reporting} <span class="mut">(${pct(x.coverage)})</span></td><td><b>${x.total}</b></td><td><span class="bar"><i style="width:${maxRegionShare ? ((x.share || 0) / maxRegionShare) * 100 : 0}%"></i></span>${pct(x.share)}</td><td>${r1(x.avg)}</td><td>${r1(x.median)}</td><td>${x.max ?? "—"}</td><td>${esc(x.topState)}</td></tr>`).join("")}
      <tr class="tot"><td>All</td><td>${nat.meisters}</td><td>${nat.reporting}</td><td>${nat.total}</td><td>100%</td><td>${r1(nat.avg)}</td><td>${r1(nat.median)}</td><td>${nat.max ?? "—"}</td><td></td></tr></tbody>
    </table>
    <div class="two">
      <div>
        <h2>By state</h2>
        <table class="t compact">
          <thead><tr><th>State</th><th>Region</th><th>Meisters</th><th>Guests</th><th>Avg</th><th>Share</th></tr></thead>
          <tbody>${byState.filter((s) => s.reporting).slice(0, 16).map((s) => `<tr><td><b>${esc(s.name)}</b></td><td class="mut">${esc(s.region)}</td><td>${s.reporting}<span class="mut"> / ${s.meisters}</span></td><td><b>${s.total}</b></td><td>${r1(s.avg)}</td><td><span class="bar sm"><i style="width:${(s.total / maxState) * 100}%"></i></span>${pct(nat.total ? s.total / nat.total : null)}</td></tr>`).join("")}</tbody>
        </table>
        ${byState.filter((s) => s.reporting).length > 16 ? `<p class="mut small">${byState.filter((s) => s.reporting).length - 16} more states not shown.</p>` : ""}
      </div>
      <div>
        <h2>Guests per Meister, by region</h2>
        <table class="t compact grid">
          <thead><tr><th>Region</th>${BUCKETS.map(([l]) => `<th>${l}</th>`).join("")}</tr></thead>
          <tbody>${spread.map((x) => `<tr><td><b>${x.r}</b></td>${x.cells.map((c) => `<td><span class="cell" style="--a:${c ? 0.15 + 0.85 * (c / Math.max(1, ...spread.flatMap((y) => y.cells))) : 0}">${c || ""}</span></td>`).join("")}</tr>`).join("")}</tbody>
        </table>
        <p class="mut small">Number of Meisters in each range. Darker means more Meisters.</p>
        <h2>Top cities</h2>
        <table class="t compact">
          <thead><tr><th>City</th><th>ZIP</th><th>Meisters</th><th>Guests</th></tr></thead>
          <tbody>${areaList.slice(0, 8).map((a) => `<tr><td><b>${esc(a.city)}, ${esc(a.state)}</b></td><td class="mut">${esc(a.zipList.slice(0, 3).join(", "))}${a.zipList.length > 3 ? " +" + (a.zipList.length - 3) : ""}</td><td>${a.meisters}</td><td><b>${a.guests}</b></td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
    <footer class="ft"><span>Regions follow the US Census (South, Northeast, West, Midwest).</span><span>Page 2 / ${totalPages}</span></footer>
  </section>`;


  const dealerPages = (dealerChunks.length ? dealerChunks : [[]]).map((chunk, ci) => {
    const perCol = Math.max(1, Math.ceil(chunk.length / 3));
    const rowH = Math.min(24, Math.floor(640 / perCol));
    const cols = [0, 1, 2].map((c) => chunk.slice(c * perCol, (c + 1) * perCol));
    return `
  <section class="page">
    <header class="hd small"><div><div class="eyebrow">MEISTER GUEST MAP · GUESTS BY DEALERSHIP${dealerChunks.length > 1 ? ` (${ci + 1} of ${dealerChunks.length})` : ""}</div></div><div class="meta">${dealerRows.length} dealerships · ${recorded} recorded · ${dealerRows.length - recorded} not yet recorded</div></header>
    <div class="dl" style="--rh:${rowH}px">${cols.map((col) => `<div class="dcol"><div class="dh"><span>Dealership</span><span>Guests</span></div>${col.map((d) => `<div class="dr"><span class="dn"><b>${esc(d.name)}</b>${d.city || d.state ? `<i>${esc([d.city, d.state].filter(Boolean).join(", "))}</i>` : ""}</span>${d.guests == null ? `<span class="nr">Not yet recorded</span>` : `<span class="dg">${d.guests}</span>`}</div>`).join("")}</div>`).join("")}</div>
    ${chunk.length ? "" : `<p class="mut">No dealerships yet.</p>`}
    <footer class="ft"><span>Sorted A to Z. Guests are summed when a dealership has more than one Meister.</span><span>Page ${3 + ci} / ${totalPages}</span></footer>
  </section>`;
  }).join("");
  const css = `
@page { size: letter landscape; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; background: #6b6b70; font-family: Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #18181b; }
.page { width: 1056px; height: 816px; margin: 0 auto 24px; background: #fff; padding: 34px 40px 24px; display: flex; flex-direction: column; overflow: hidden; position: relative; }
@media print { html, body { background: #fff; } .page { margin: 0; break-after: page; } .page:last-child { break-after: auto; } }
.hd { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
.hd.small { padding-bottom: 8px; }
.eyebrow { font-size: 10px; font-weight: 800; letter-spacing: .16em; color: #e0263f; }
h1 { margin: 4px 0 0; font-size: 30px; font-weight: 800; letter-spacing: -.01em; }
h2 { font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin: 14px 0 8px; }
h3 { font-size: 10.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 8px; color: #5c5c64; }
.meta { text-align: right; font-size: 11px; color: #5c5c64; line-height: 1.5; }
.kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 12px; }
.k { border: 1px solid #e3e3e7; border-radius: 8px; padding: 10px 12px; }
.k b { display: block; font-size: 24px; font-weight: 800; line-height: 1.1; } .k b small { font-size: 13px; color: #8a8a92; font-weight: 600; }
.k span { font-size: 10.5px; color: #5c5c64; }
.maprow { display: grid; grid-template-columns: 1fr 250px; gap: 18px; flex: 1; min-height: 0; }
.mapbox { position: relative; display: flex; flex-direction: column; min-height: 0; }
#map { width: 100%; flex: 1; min-height: 0; }
#map .st { stroke: #fff; stroke-width: 1; }
#map .bub { fill: #e0263f; fill-opacity: .55; stroke: #9e0f22; stroke-width: 1; }
#map .lbl { font-size: 13px; font-weight: 700; fill: #111; paint-order: stroke; stroke: #fff; stroke-width: 4px; stroke-linejoin: round; }
.legend { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: #5c5c64; margin-top: 4px; }
.legend .ramp { width: 120px; height: 9px; border-radius: 5px; background: linear-gradient(90deg, #f1f1f3, #f6c2c9, #e0263f, #7a0a17); }
.legend .lo, .legend .hi { font-weight: 700; color: #18181b; } .legend .dot { width: 12px; height: 12px; border-radius: 50%; background: rgba(224,38,63,.55); border: 1px solid #9e0f22; margin-left: 12px; }
.side { border-left: 1px solid #e3e3e7; padding-left: 16px; overflow: hidden; }
.areas { list-style: none; margin: 0 0 16px; padding: 0; counter-reset: a; }
.areas li { display: grid; grid-template-columns: 18px 1fr auto; grid-template-rows: auto auto; column-gap: 6px; padding: 6px 0; border-bottom: 1px solid #f0f0f2; counter-increment: a; }
.areas li::before { content: counter(a); grid-row: 1 / span 2; font-weight: 800; color: #e0263f; font-size: 12px; }
.areas b { font-size: 12.5px; } .areas span { grid-column: 2; font-size: 10.5px; color: #8a8a92; } .areas em { grid-column: 3; grid-row: 1 / span 2; align-self: center; font-style: normal; font-weight: 800; font-size: 16px; }
.areas .none { color: #8a8a92; font-size: 12px; } .areas .none::before { content: ""; }
.notes { margin: 0; padding-left: 16px; font-size: 11px; line-height: 1.45; color: #3a3a40; } .notes li { margin-bottom: 6px; }
.ft { display: flex; justify-content: space-between; font-size: 9.5px; color: #8a8a92; border-top: 1px solid #e3e3e7; padding-top: 8px; margin-top: 10px; }
.t { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.t th { text-align: left; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8a8a92; padding: 0 8px 6px 0; border-bottom: 2px solid #111; }
.t td { padding: 6px 8px 6px 0; border-bottom: 1px solid #ececef; vertical-align: middle; }
.t.compact td { padding: 4px 8px 4px 0; }
.t .tot td { font-weight: 800; border-top: 2px solid #111; border-bottom: none; }
.mut { color: #8a8a92; } .small { font-size: 10px; margin: 6px 0 0; }
.bar { display: inline-block; width: 70px; height: 8px; background: #f1f1f3; border-radius: 4px; margin-right: 6px; vertical-align: middle; overflow: hidden; } .bar.sm { width: 46px; }
.bar i { display: block; height: 100%; background: #e0263f; }
.two { display: grid; grid-template-columns: 1.1fr 1fr; gap: 28px; flex: 1; min-height: 0; }
.grid td { text-align: center; } .grid td:first-child, .grid th:first-child { text-align: left; } .grid th { text-align: center; }
.cell { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 22px; border-radius: 4px; font-weight: 700; background: rgba(224,38,63,var(--a)); color: #111; }
.dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 26px; flex: 1; min-height: 0; align-content: start; }
.dh { display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8a8a92; padding-bottom: 5px; border-bottom: 2px solid #111; }
.dr { display: flex; justify-content: space-between; align-items: center; gap: 8px; height: var(--rh); border-bottom: 1px solid #ececef; font-size: 11px; }
.dcol { min-width: 0; }
.dn { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dn i { font-style: normal; color: #8a8a92; font-size: 9.5px; margin-left: 6px; }
.dg { font-weight: 800; font-size: 12px; }
.nr { font-size: 9.5px; color: #a1a1aa; font-style: italic; white-space: nowrap; }
.tb { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; max-width: 1056px; margin: 0 auto 16px; padding: 10px 14px; background: #18181b; color: #fff; font-size: 13px; border-radius: 0 0 8px 8px; }
.tb button { background: #e0263f; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-weight: 700; font-size: 13px; cursor: pointer; } .tb button:disabled { opacity: .6; cursor: default; }
@media print { .tb { display: none; } }
`;

  const data = { areas: areaList.map(({ lat, lng, guests, city, state }) => ({ lat, lng, guests, city, state })), stateTotals, maxState, maxArea, FIPS };
  const script = `
(async function () {
  const D = ${JSON.stringify(data)};
  const svg = document.getElementById("map");
  const topo = await fetch(${JSON.stringify(libs.atlas)}).then((r) => r.json());
  const states = topojson.feature(topo, topo.objects.states).features;
  const path = d3.geoPath();
  const ramp = (t) => { const c = [[241,241,243],[246,194,201],[224,38,63],[122,10,23]]; t = Math.max(0, Math.min(1, t)) * 3; const i = Math.min(2, Math.floor(t)), f = t - i; return "rgb(" + c[i].map((v, k) => Math.round(v + (c[i + 1][k] - v) * f)).join(",") + ")"; };
  let out = "";
  for (const f of states) {
    const st = D.FIPS[String(f.id).padStart(2, "0")]; const v = D.stateTotals[st] || 0;
    out += '<path class="st" d="' + path(f) + '" fill="' + (v ? ramp(Math.sqrt(v / D.maxState)) : "#f1f1f3") + '"><title>' + (st || "") + ": " + v + ' guests</title></path>';
  }
  const proj = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
  const pts = D.areas.map((a) => ({ ...a, xy: proj([a.lng, a.lat]) })).filter((a) => a.xy);
  const rad = (g) => 4 + 22 * Math.sqrt(g / D.maxArea);
  pts.slice().sort((a, b) => b.guests - a.guests).forEach((a) => { out += '<circle class="bub" cx="' + a.xy[0] + '" cy="' + a.xy[1] + '" r="' + rad(a.guests) + '"><title>' + a.city + ", " + a.state + ": " + a.guests + ' guests</title></circle>'; });
  const placed = [];
  const hits = (b) => placed.some((p) => b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
  pts.forEach((a) => {
    if (placed.length >= 7) return;
    const t = a.city + " · " + a.guests, w = t.length * 7.4 + 4, h = 16, r = rad(a.guests);
    const tries = [[a.xy[0] + r + 4, a.xy[1] - 8, "start"], [a.xy[0] - r - 4 - w, a.xy[1] - 8, "end"], [a.xy[0] - w / 2, a.xy[1] - r - 18, "mid"], [a.xy[0] - w / 2, a.xy[1] + r + 2, "mid"]];
    for (const [x, y] of tries) {
      const b = { x, y, w, h };
      if (x < 0 || x + w > 975 || y < 0 || y + h > 610 || hits(b)) continue;
      placed.push(b); out += '<text class="lbl" x="' + (x + 2) + '" y="' + (y + 12) + '">' + t + "</text>"; break;
    }
  });
  svg.innerHTML = out;
  document.body.dataset.ready = "1";
  const b = document.getElementById("pdf-btn"); b.disabled = false; b.textContent = "Save as PDF"; b.onclick = () => window.print();
})();`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Meister Guest Map</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style>
<script src="${libs.d3array}"></script><script src="${libs.d3geo}"></script><script src="${libs.topojson}"></script>
</head><body><div class="tb"><span>Meister Guest Map · ${totalPages} pages, landscape</span><button id="pdf-btn" disabled>Loading map…</button></div>${page1}${page2}${dealerPages}<script>${script}</script></body></html>`;
}
