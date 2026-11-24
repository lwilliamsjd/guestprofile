// Direct Inquiries map report: a printable two page PDF (US heat map + breakdown by area)
// of where guests who reached out to us directly are coming from. No names or contact details.
import { ZIP5 } from "../../crm/js/zip5.js";
import { ZIP3 } from "../../crm/js/zip3.js";
import { REGION_OF, STATE_NAMES, FIPS } from "../../crm/js/guestmap.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (n) => (n == null || isNaN(n) ? "—" : `${Math.round(n * 100)}%`);
const METHODS = ["Phone", "Email", "Referral", "Website", "Other"];

function locate(q) {
  const zip = String(q.zip || "").replace(/\D/g, "");
  const z5 = ZIP5[zip.slice(0, 5)];
  const z = z5 || ZIP3[zip.slice(0, 3)];
  const st = String(q.state || "").toUpperCase().trim();
  const state = STATE_NAMES[st] ? st : z ? z[3] : "";
  const city = String(q.city || "").trim() || (z ? z[2] : "");
  return { ...q, _state: state, _region: REGION_OF[state] || "No location", _city: city, _pt: z ? { lat: z[0], lng: z[1] } : null };
}

export function buildInquiryMapReport(inquiries, opts = {}) {
  const libs = {
    d3array: "https://cdn.jsdelivr.net/npm/d3-array@3/dist/d3-array.min.js",
    d3geo: "https://cdn.jsdelivr.net/npm/d3-geo@3/dist/d3-geo.min.js",
    topojson: "https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js",
    atlas: "https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json",
    ...(opts.libs || {}),
  };
  const vipOnly = !!opts.vipOnly;
  const list = inquiries.filter((q) => !vipOnly || q.vip).map(locate);
  const vipTotal = list.filter((q) => q.vip).length;
  // Two sources share this report: Inquiries (red) and Level 3 Data from the website (green); VIPs are gold.
  const isWeb = (q) => q.source === "website";
  const webTotal = list.filter(isWeb).length, inqTotal = list.length - webTotal;
  const mixed = webTotal > 0 && inqTotal > 0, webOnly = webTotal > 0 && !inqTotal;
  const subject = vipOnly ? "VIP guests" : mixed ? "inquiries and Level 3 guests" : webOnly ? "Level 3 guests" : "direct inquiries";
  const EYEBROW = mixed ? "INQUIRIES + LEVEL 3 DATA" : webOnly ? "LEVEL 3 DATA" : "DIRECT INQUIRIES";
  const reportTitle = mixed ? "Inquiries + Level 3 Map" : webOnly ? "Level 3 Data Map" : "Direct Inquiries Map";
  const total = list.length;
  const open = list.filter((q) => q.status !== "Moved").length;
  const moved = total - open;
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const last30 = list.filter((q) => (q.received_on || "") >= since).length;

  // bubbles by city
  const cities = new Map();
  const unmapped = [];
  list.forEach((q) => {
    if (!q._pt) { unmapped.push(q); return; }
    const key = (q._city + "|" + q._state).toLowerCase();
    if (!cities.has(key)) cities.set(key, { city: q._city, state: q._state, latSum: 0, lngSum: 0, guests: 0, vip: 0, inq: 0, web: 0 });
    const c = cities.get(key); c.guests++; c.latSum += q._pt.lat; c.lngSum += q._pt.lng; if (q.vip) c.vip++; if (isWeb(q)) c.web++; else c.inq++;
  });
  const cityList = [...cities.values()].map((c) => ({ ...c, lat: c.latSum / c.guests, lng: c.lngSum / c.guests })).sort((a, b) => b.guests - a.guests);

  const byState = [...new Set(list.map((q) => q._state).filter(Boolean))].map((st) => {
    const qs = list.filter((q) => q._state === st);
    return { st, name: STATE_NAMES[st] || st, region: REGION_OF[st] || "", n: qs.length, open: qs.filter((q) => q.status !== "Moved").length };
  }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const stateTotals = Object.fromEntries(byState.map((s) => [s.st, s.n]));
  const regionNames = ["South", "Northeast", "West", "Midwest"].concat(list.some((q) => q._region === "No location") ? ["No location"] : []);
  const byRegion = regionNames.map((r) => {
    const qs = list.filter((q) => q._region === r);
    const sts = byState.filter((s) => s.region === r);
    return { r, n: qs.length, share: total ? qs.length / total : null, open: qs.filter((q) => q.status !== "Moved").length, moved: qs.filter((q) => q.status === "Moved").length, top: sts[0] ? sts[0].name : "—" };
  });
  const maxRegion = Math.max(1, ...byRegion.map((x) => x.n));
  const byMethod = METHODS.map((m) => ({ m, n: list.filter((q) => (q.method || "Other") === m).length }));
  const dealers = [...list.reduce((mp, q) => { if (q.closest_dealer) { const k = q.closest_dealer.trim(); mp.set(k, (mp.get(k) || 0) + 1); } return mp; }, new Map()).entries()]
    .map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  const topState = byState[0];
  const topRegion = byRegion.filter((x) => x.r !== "No location").sort((a, b) => b.n - a.n)[0];
  const maxState = Math.max(1, ...byState.map((s) => s.n));
  const maxArea = Math.max(1, ...cityList.map((c) => c.guests));
  const generated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const kpi = (v, l) => `<div class="k"><b>${v}</b><span>${l}</span></div>`;

  const page1 = `
  <section class="page">
    <header class="hd"><div><div class="eyebrow">GR GT CONCIERGE · ${EYEBROW}${vipOnly ? " · VIP ONLY" : ""}</div><h1>Where ${subject} come from</h1></div>
      <div class="meta">${mixed ? "Inquiries (reached out, events, Toyota referrals) and Level 3 Data (website requests)" : webOnly ? "Website requests to speak with us (GIH Level 3)" : "Guests who reached out to us directly, not through a dealer"}<br>Generated ${esc(generated)}${opts.by ? ` by ${esc(opts.by)}` : ""}</div></header>
    <div class="kpis">
      ${kpi(total, vipOnly ? "VIP guests" : mixed ? "Total guests" : webOnly ? "Level 3 guests" : "Total inquiries")}
      ${vipOnly ? kpi(list.filter((q) => q.ag_approved).length, "AG Approved") : `<div class="k vipk"><b>${vipTotal}</b><span>VIP</span></div>`}
      ${mixed && !vipOnly ? `<div class="k inqk"><b>${inqTotal}</b><span>Inquiries</span></div><div class="k webk"><b>${webTotal}</b><span>Level 3 Data</span></div>` : `${kpi(open, "Open")}${kpi(moved, "Moved to profiles")}`}
      ${kpi(topState ? esc(topState.st) : "—", `Top state${topState ? ` · ${topState.n}` : ""}`)}
      ${kpi(topRegion && topRegion.n ? esc(topRegion.r) : "—", `Top region${topRegion && topRegion.n ? ` · ${pct(topRegion.share)}` : ""}`)}
    </div>
    <div class="maprow">
      <div class="mapbox"><svg id="map" viewBox="0 0 975 610" preserveAspectRatio="xMidYMin meet"></svg>
        <div class="legend"><span>${mixed ? "Guests" : webOnly ? "Level 3 guests" : "Inquiries"} by state</span><span class="lo">0</span><i class="ramp"></i><span class="hi">${maxState}</span>${vipOnly ? "" : `${inqTotal ? `<span class="dot"></span><span>Inquiries</span>` : ""}${webTotal ? `<span class="dot green"></span><span>Level 3 Data</span>` : ""}`}${vipTotal ? `<span class="dot gold"></span><span>VIP${vipOnly ? " guests from that city" : ""}</span>` : ""}</div>
      </div>
      <aside class="side">
        <h3>Top cities</h3>
        <ol class="areas">${cityList.slice(0, 6).map((c) => `<li><b>${esc(c.city)}, ${esc(c.state)}</b><span>${esc(STATE_NAMES[c.state] || "")}${mixed && !vipOnly ? ` · <i class="inqt">${c.inq}</i> / <i class="webt">${c.web} L3</i>` : ""}${c.vip && !vipOnly ? ` · <i class="vipt">${c.vip} VIP</i>` : ""}</span><em>${c.guests}</em></li>`).join("") || `<li class="none">No ZIP codes yet</li>`}</ol>
        <h3>How they reached out</h3>
        <div class="meth">${byMethod.map((x) => `<div><span>${x.m}</span><span class="bar"><i style="width:${total ? (x.n / Math.max(1, ...byMethod.map((y) => y.n))) * 100 : 0}%"></i></span><b>${x.n}</b></div>`).join("")}</div>
        ${unmapped.length ? `<p class="mut small">${unmapped.length} inquir${unmapped.length === 1 ? "y has" : "ies have"} no ZIP and ${unmapped.length === 1 ? "is" : "are"} not on the map.</p>` : ""}
      </aside>
    </div>
    <footer class="ft"><span>From ${mixed ? "Inquiries and Level 3 Data" : webOnly ? "Level 3 Data" : "the Inquiries list"} in Applicant Profiles. Counts only, no names or contact details.</span><span>Page 1 / 2</span></footer>
  </section>`;

  const page2 = `
  <section class="page">
    <header class="hd small"><div><div class="eyebrow">${EYEBROW} · BREAKDOWN BY AREA</div></div><div class="meta">${esc(generated)}</div></header>
    <h2>By region</h2>
    <table class="t">
      <thead><tr><th>Region</th><th>Inquiries</th><th>Share</th><th>Open</th><th>Moved to profiles</th><th>Top state</th></tr></thead>
      <tbody>${byRegion.map((x) => `<tr><td><b>${x.r}</b></td><td><b>${x.n}</b></td><td><span class="bar"><i style="width:${(x.n / maxRegion) * 100}%"></i></span>${pct(x.share)}</td><td>${x.open}</td><td>${x.moved}</td><td>${esc(x.top)}</td></tr>`).join("")}
      <tr class="tot"><td>All</td><td>${total}</td><td>100%</td><td>${open}</td><td>${moved}</td><td></td></tr></tbody>
    </table>
    <div class="two">
      <div>
        <h2>By state</h2>
        <table class="t compact">
          <thead><tr><th>State</th><th>Region</th><th>Inquiries</th><th>Open</th><th>Share</th></tr></thead>
          <tbody>${byState.slice(0, 16).map((s) => `<tr><td><b>${esc(s.name)}</b></td><td class="mut">${esc(s.region)}</td><td><b>${s.n}</b></td><td>${s.open}</td><td><span class="bar sm"><i style="width:${(s.n / maxState) * 100}%"></i></span>${pct(total ? s.n / total : null)}</td></tr>`).join("") || `<tr><td colspan="5" class="mut">No locations yet</td></tr>`}</tbody>
        </table>
        ${byState.length > 16 ? `<p class="mut small">${byState.length - 16} more states not shown.</p>` : ""}
      </div>
      <div>
        <h2>Top cities</h2>
        <table class="t compact">
          <thead><tr><th>City</th><th>Inquiries</th></tr></thead>
          <tbody>${cityList.slice(0, 8).map((c) => `<tr><td><b>${esc(c.city)}, ${esc(c.state)}</b></td><td><b>${c.guests}</b>${c.vip && !vipOnly ? ` <span class="vipt">(${c.vip} VIP)</span>` : ""}</td></tr>`).join("") || `<tr><td colspan="2" class="mut">No ZIP codes yet</td></tr>`}</tbody>
        </table>
        <h2>Closest participating dealer</h2>
        <table class="t compact">
          <thead><tr><th>Dealer</th><th>Inquiries nearby</th></tr></thead>
          <tbody>${dealers.slice(0, 8).map((x) => `<tr><td><b>${esc(x.name)}</b></td><td><b>${x.n}</b></td></tr>`).join("") || `<tr><td colspan="2" class="mut">No dealers set yet</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <footer class="ft"><span>Regions follow the US Census (South, Northeast, West, Midwest). Closest dealer is the one saved on each inquiry.</span><span>Page 2 / 2</span></footer>
  </section>`;

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

.meth div { display: grid; grid-template-columns: 62px 1fr 24px; align-items: center; gap: 8px; font-size: 11.5px; padding: 4px 0; }
.meth b { text-align: right; }
#map .bub.vip { fill: #d4a94a; fill-opacity: .9; stroke: #8a6a1c; stroke-width: 1.2; }
.legend .dot.gold { background: rgba(212,169,74,.9); border-color: #8a6a1c; margin-left: 6px; }
.vipt { color: #a37a1f; font-style: normal; font-weight: 700; }
#map .bub.web { fill: #3ddc84; fill-opacity: .88; stroke: #0e5c31; stroke-width: 1.4; }
.legend .dot.green { background: rgba(61,220,132,.88); border-color: #0e5c31; margin-left: 6px; }
.inqt { color: #c0142e; font-style: normal; font-weight: 700; } .webt { color: #157a43; font-style: normal; font-weight: 700; }
.k.inqk b { color: #c0142e; } .k.webk b { color: #157a43; }
.k.vipk b { color: #a37a1f; } .meth .bar { width: 100%; margin: 0; }
`;
  const data = { areas: cityList.map(({ lat, lng, guests, vip, inq, web, city, state }) => ({ lat, lng, guests, vip, inq, web, city, state })), stateTotals, maxState, maxArea, FIPS, vipOnly };
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
    out += '<path class="st" d="' + path(f) + '" fill="' + (v ? ramp(Math.sqrt(v / D.maxState)) : "#f1f1f3") + '"><title>' + (st || "") + ": " + v + (v === 1 ? " inquiry" : " inquiries") + '</title></path>';
  }
  const proj = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
  const pts = D.areas.map((a) => ({ ...a, xy: proj([a.lng, a.lat]) })).filter((a) => a.xy);
  const rad = (g) => 4 + 22 * Math.sqrt(g / D.maxArea);
  pts.slice().sort((a, b) => b.guests - a.guests).forEach((a) => {
    // Inquiries (red) and Level 3 Data (green), the bigger one underneath, then VIP (gold) on top
    if (!D.vipOnly) [["bub", a.inq, " inquiries"], ["bub web", a.web, " Level 3"]].filter((x) => x[1]).sort((x, y) => y[1] - x[1]).forEach(([cls, n, lbl]) => {
      out += '<circle class="' + cls + '" cx="' + a.xy[0] + '" cy="' + a.xy[1] + '" r="' + rad(n) + '"><title>' + a.city + ", " + a.state + ": " + n + lbl + '</title></circle>';
    });
    if (a.vip) out += '<circle class="bub vip" cx="' + a.xy[0] + '" cy="' + a.xy[1] + '" r="' + rad(a.vip) + '"><title>' + a.city + ", " + a.state + ": " + a.vip + ' VIP</title></circle>';
  });
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${reportTitle}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style>
<script src="${libs.d3array}"></script><script src="${libs.d3geo}"></script><script src="${libs.topojson}"></script>
</head><body><div class="tb"><span>${reportTitle}${vipOnly ? " · VIP only" : ""} · 2 pages, landscape</span><button id="pdf-btn" disabled>Loading map…</button></div>${page1}${page2}<script>${script}</script></body></html>`;
}
