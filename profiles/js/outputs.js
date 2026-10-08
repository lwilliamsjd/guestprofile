// Outputs for an applicant:
//  1) a plain text summary to paste into the other internal tool
//  2) the two page Buyer Profile PDF (built as HTML, printed to PDF)

export const USAGE_OPTIONS = ["Private Collection", "Public Collection", "Street", "Track Only", "Daily"];
export const HPDE_LEVELS = ["None", "Beginner", "Intermediate", "Advanced", "Instructor"];
export const RACE_LEVELS = ["None", "Autocross / Time Attack", "Club Racer", "Pro Am", "Pro"];
export const LFA_STATUSES = ["Owned", "Driven", "Inquired", "None"];
export const DECISIONS = ["Approve", "Waitlist", "Decline"];
export const USAGE_SPLIT = [["track", "Track / HPDE"], ["street", "Street / GT"], ["events", "Events / Shows"], ["collection", "Collection"]];
export const CROSS_STATUSES = ["Owns", "Test driven", "Considered", "Ruled out"];
export const TIMING_FLEX = ["Firm", "±1 quarter", "±2 quarters", "Open"];
// Spec considerations checklist. [category, [[sub group or "", [options]]]]
// A checked box is saved in spec_tags as "Category: Sub Option", e.g. "Brakes: Carbon Ceramic Red".
export const SPEC_OPTIONS = [
  ["Color", [["", ["White", "Red", "Gray", "Dark Gray", "Black", "Silver", "Blue", "Green", "Yellow"]]]],
  ["Wheels", [["BBS", ["Gloss Gray", "Black"]], ["Rays Racing", ["Light Gray", "Gold"]]]],
  ["Interior Color", [["", ["Black", "Red", "Hazel"]]]],
  ["Interior Material", [["", ["Standard", "Ultra Suede"]]]],
  ["Seat Type", [["", ["Semi-Bucket", "Full Bucket"]]]],
  ["Brakes", [["Steel", ["Black", "Red"]], ["Carbon Ceramic", ["Black", "Red", "Blue", "Silver", "Yellow"]]]],
  ["Exhaust", [["", ["Standard", "Sport"]]]],
  ["Accessories", [["", ["Wireless Charger", "Front Lift"]]]],
];
export const specLabel = (cat, sub, opt) => `${cat}: ${sub ? sub + " " : ""}${opt}`;
export const SPEC_LABELS = SPEC_OPTIONS.flatMap(([c, subs]) => subs.flatMap(([sub, opts]) => opts.map((o) => specLabel(c, sub, o))));
// checked options grouped by category (in checklist order), then any older typed entries
export function specGroups(a) {
  const tags = rowsOf(a.spec_tags, "label");
  const out = [];
  SPEC_OPTIONS.forEach(([c]) => {
    const items = tags.filter((t) => SPEC_LABELS.includes(t.label) && t.label.startsWith(c + ": ")).map((t) => t.label.slice(c.length + 2));
    if (items.length) out.push({ group: c, items });
  });
  tags.filter((t) => !SPEC_LABELS.includes(t.label)).forEach((t) => out.push({ group: "", items: [clean(t.label)], priority: !!t.priority }));
  return out;
}
export const specText = (a) => specGroups(a).map((g) => (g.group ? `${g.group}: ${g.items.join(", ")}` : `${g.items[0]}${g.priority ? " (priority)" : ""}`)).join("; ");

export const SOCIAL_PLATFORMS = ["Instagram", "YouTube", "TikTok", "Facebook", "X", "LinkedIn", "Threads", "Website", "Other"];

const clean = (s) => (s == null ? "" : String(s).trim());
const has = (s) => clean(s).length > 0;

export function escapeHtml(s) {
  return clean(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function initials(name) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function garageOf(a) {
  return (Array.isArray(a.garage) ? a.garage : []).filter((g) => has(g.vehicle));
}
export function totalMiles(a) {
  return garageOf(a).reduce((sum, g) => sum + (Number(g.miles) || 0), 0);
}
const fmtMiles = (n) => (Number(n) || 0).toLocaleString("en-US");

export function fmtDate(d) {
  if (!d) return "";
  const dt = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------- shared helpers ----------
// GRGT-26-0142: year the profile was created, then its number
export function profileId(a) {
  if (!a || a.profile_no == null) return "";
  const yr = String(a.created_at ? new Date(a.created_at).getFullYear() : new Date().getFullYear()).slice(-2);
  return `GRGT-${yr}-${String(a.profile_no).padStart(4, "0")}`;
}
export const linesOf = (t) => clean(t).split(/\n+/).map((x) => x.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
export const location = (a) => [clean(a.city), clean(a.state)].filter(Boolean).join(", ");
export function lfaStatusOf(a) {
  if (has(a.lfa_status)) return a.lfa_status;
  return a.lfa_owner ? "Owned" : "";
}
export function rowsOf(list, key) {
  return (Array.isArray(list) ? list : []).filter((r) => has(r[key]));
}
export function usageSplitOf(a) {
  const u = a.usage_split;
  if (!u || typeof u !== "object") return null;
  const out = {};
  let total = 0;
  USAGE_SPLIT.forEach(([k]) => { out[k] = Math.max(0, Number(u[k]) || 0); total += out[k]; });
  return total > 0 ? out : null;
}
export const splitTotal = (a) => USAGE_SPLIT.reduce((t, [k]) => t + (Number((a.usage_split || {})[k]) || 0), 0);

// average years held, across current cars (from year acquired) and past cars
export function avgOwnership(a) {
  const now = new Date().getFullYear();
  const holds = [];
  garageOf(a).forEach((g) => {
    const y = Number(g.acquired);
    if (y > 1900 && y <= now) holds.push(Math.max(0.5, now - y));
  });
  [...rowsOf(a.toyota_history, "model"), ...rowsOf(a.past_cars, "model")].forEach((r) => {
    const h = Number(r.held);
    if (h > 0) holds.push(h);
  });
  if (!holds.length) return null;
  return Math.round((holds.reduce((t, h) => t + h, 0) / holds.length) * 10) / 10;
}
export function driverStyleLabel(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (n < 35) return "Numbers driven";
  if (n <= 65) return "Balanced";
  return "Experience driven";
}
export function fmtK(n) {
  const v = Number(n);
  if (!v) return "";
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(v);
}
// next 12 quarters, for the Timing picker
export function quarterOptions(from = new Date()) {
  const out = [];
  let q = Math.floor(from.getMonth() / 3) + 1, y = from.getFullYear();
  for (let i = 0; i < 12; i++) { out.push(`Q${q} ${y}`); q++; if (q > 4) { q = 1; y++; } }
  return out;
}
export function quarterKey(s) {
  const m = clean(s).match(/^Q([1-4])\s+(\d{4})$/i);
  return m ? Number(m[2]) * 4 + Number(m[1]) - 1 : null;
}
const levelScale = (levels, v) => { const i = levels.indexOf(v); return i < 0 ? null : i; };

// ---------------------------------------------------------------
// 1) TEXT SUMMARY
// ---------------------------------------------------------------
export function buildSummaryText(a, mode = "full") {
  return mode === "compact" ? compactText(a) : fullText(a);
}

const flat = (v) => clean(v).replace(/\s*\n+\s*/g, "; ");
function line(label, value) {
  return has(value) ? `${label}: ${flat(value)}` : null;
}
function socialText(a) {
  const rows = rowsOf(a.socials, "handle");
  if (!rows.length) return clean(a.social_media);
  return rows.map((s) => {
    const extra = [s.followers ? `${fmtK(s.followers)} followers` : "", clean(s.note)].filter(Boolean).join(", ");
    return `${clean(s.platform) || "Social"} ${clean(s.handle)}${extra ? ` (${extra})` : ""}`;
  }).join("; ");
}
const historyText = (rows) => rows.map((r) => `${[clean(r.year), clean(r.model)].filter(Boolean).join(" ")}${Number(r.held) ? ` (${r.held} yrs)` : ""}${has(r.note) ? `, ${flat(r.note)}` : ""}`).join("; ");
function usageText(a) {
  const u = usageSplitOf(a);
  if (u) return USAGE_SPLIT.filter(([k]) => u[k]).map(([k, l]) => `${l} ${u[k]}%`).join(", ");
  return (a.gt_usage || []).join(", ");
}
function timingText(a) {
  if (has(a.target_quarter)) return [clean(a.target_quarter), has(a.timing_flex) ? `(${a.timing_flex})` : ""].filter(Boolean).join(" ");
  return clean(a.timing);
}
const crossText = (a) => rowsOf(a.cross_shop, "model").map((c) => `${clean(c.model)}${[c.status, clean(c.note)].filter(has).length ? ` (${[c.status, clean(c.note)].filter(has).join(", ")})` : ""}`).join("; ");

function fullText(a) {
  const out = [];
  const g = garageOf(a);
  out.push("GR GT APPLICANT PROFILE");
  out.push(line("Profile ID", profileId(a)));
  out.push(line("Name", a.name));
  out.push(line("Age Range", a.age_range));
  out.push(line("Location", location(a)));
  out.push(line("Preferred Dealer", a.preferred_dealer));
  if (a.vip) out.push("Flags: VIP");
  out.push(line("TMNA Relationships", linesOf(a.tmna_relationship).join("; ")));
  out.push(line("Social Media", socialText(a)));
  out.push(line("Track and Driving Clubs", linesOf(a.clubs).join("; ")));

  if (has(a.summary)) out.push("", "BIO", clean(a.summary));
  if (has(a.what_drives_you)) out.push("", "WHAT DRIVES THEM", `"${flat(a.what_drives_you)}"`);

  const ms = [
    line("HPDE Level", a.hpde_level),
    line("HPDE Details", a.hpde_experience),
    line("Race Level", a.race_level),
    line("Racing Series", (a.race_series || []).join(", ")),
    line("Race Details", a.race_experience),
    line("Years on Track", a.years_on_track),
    line("Track Days", a.track_days),
    line("Key Events Attended", linesOf(a.key_events).join("; ")),
    line("Driver Style", [driverStyleLabel(a.driver_style), clean(a.driver_style_note)].filter(Boolean).join(". ")),
  ].filter(Boolean);
  if (ms.length) out.push("", "MOTORSPORTS / EVENTS", ...ms);

  const car = [];
  if (g.length) {
    car.push(`Current Garage (${g.length} vehicle${g.length === 1 ? "" : "s"}, approx ${fmtMiles(totalMiles(a))} mi/yr combined):`);
    g.forEach((v, i) => {
      const bits = [];
      if (v.usage && v.usage.length) bits.push(v.usage.join(", "));
      if (Number(v.miles)) bits.push(`${fmtMiles(v.miles)} mi/yr`);
      if (has(v.acquired)) bits.push(`since ${v.acquired}`);
      if (has(v.use_note)) bits.push(clean(v.use_note));
      car.push(`${i + 1}. ${clean(v.vehicle)}${bits.length ? ` (${bits.join(" | ")})` : ""}`);
    });
  }
  const avg = avgOwnership(a);
  if (avg) car.push(`Average Ownership: ${avg} yrs per car`);
  const lfa = lfaStatusOf(a);
  car.push(`LFA Experience: ${lfa || "Not discussed"}${has(a.lfa_note) ? `. ${flat(a.lfa_note)}` : ""}`);
  const th = rowsOf(a.toyota_history, "model");
  car.push(line("Toyota / Lexus History", th.length ? historyText(th) : a.previous_toyota_lexus));
  car.push(line("Significant Past Cars", historyText(rowsOf(a.past_cars, "model"))));
  const flipsYN = a.has_flips === true ? "Yes" : a.has_flips === false ? "No" : "";
  const flipText = /^\s*(none|no|n\/?a|nope|0|nothing)\b/i.test(clean(a.recent_flips)) ? "" : clean(a.recent_flips);
  car.push(line("Recent Vehicle Flips", [flipsYN, flipText].filter(has).join(": ")));
  out.push("", "CAR PROFILE", ...car.filter(Boolean));

  const buyer = [
    line("Why the GR GT", a.intended_use),
    line("Intended Usage", [usageText(a), clean(a.usage_note)].filter(Boolean).join(". ")),
    line("Timing", [timingText(a), clean(a.timing_note)].filter(Boolean).join(". ")),
    line("Spec Considerations", specText(a) || a.spec_consideration),
    line("Cross Shopping", crossText(a)),
  ].filter(Boolean);
  if (buyer.length) out.push("", "BUYER PROFILE", ...buyer);

  const asmt = [
    line("Concierge Recommendation", a.concierge_rec),
    line("Assessment", a.assessment),
    line("Strengths", linesOf(a.strengths).join("; ")),
    line("Flags", linesOf(a.concerns).join("; ")),
    a.allocation && a.allocation !== "Pending" ? `Leadership Decision: ${a.allocation}` : null,
  ].filter(Boolean);
  if (asmt.length) out.push("", "CONCIERGE ASSESSMENT", ...asmt);

  const by = [has(a.interviewed_by) ? `Interviewed by ${clean(a.interviewed_by)}` : null, a.interview_date ? `on ${fmtDate(a.interview_date)}` : null].filter(Boolean).join(" ");
  if (by) out.push("", by);

  return out.filter((l) => l !== null).join("\n");
}

function compactText(a) {
  const g = garageOf(a);
  const head = [
    `${clean(a.name)}${has(a.age_range) ? ` (${clean(a.age_range)})` : ""}`,
    profileId(a) || null,
    location(a) || null,
    has(a.preferred_dealer) ? `Dealer: ${flat(a.preferred_dealer)}` : null,
    a.vip ? "VIP" : null,
    lfaStatusOf(a) && lfaStatusOf(a) !== "None" ? `LFA: ${lfaStatusOf(a)}` : null,
  ].filter(Boolean).join(" | ");
  const parts = [head + "."];
  if (has(a.tmna_relationship)) parts.push(`TMNA: ${linesOf(a.tmna_relationship).join("; ")}.`);
  if (has(a.summary)) parts.push(flat(a.summary).replace(/\.?$/, "."));
  const ms = [
    has(a.hpde_level) || has(a.hpde_experience) ? `HPDE: ${[a.hpde_level, flat(a.hpde_experience)].filter(has).join(", ")}` : null,
    has(a.race_level) || has(a.race_experience) ? `Racing: ${[a.race_level, (a.race_series || []).join("/"), flat(a.race_experience)].filter(has).join(", ")}` : null,
    has(a.years_on_track) || has(a.track_days) ? `${has(a.years_on_track) ? `${a.years_on_track} yrs on track` : ""}${has(a.years_on_track) && has(a.track_days) ? ", " : ""}${has(a.track_days) ? `${a.track_days} track days` : ""}` : null,
    has(a.key_events) ? `Events: ${linesOf(a.key_events).join(", ")}` : null,
  ].filter(Boolean);
  if (ms.length) parts.push(`Motorsports: ${ms.join("; ")}.`);
  if (g.length) {
    parts.push(`Garage: ${g.map((v) => {
      const bits = [];
      if (v.usage && v.usage.length) bits.push(v.usage.join("/"));
      if (Number(v.miles)) bits.push(`${fmtMiles(v.miles)} mi/yr`);
      return `${clean(v.vehicle)}${bits.length ? ` (${bits.join(", ")})` : ""}`;
    }).join("; ")}.`);
  }
  const avg = avgOwnership(a);
  if (avg) parts.push(`Avg ownership ${avg} yrs.`);
  const th = rowsOf(a.toyota_history, "model");
  if (th.length || has(a.previous_toyota_lexus)) parts.push(`Prior Toyota/Lexus: ${th.length ? historyText(th) : flat(a.previous_toyota_lexus)}.`);
  if (a.has_flips === true || a.has_flips === false || has(a.recent_flips)) parts.push(`Recent flips: ${[a.has_flips === true ? "Yes" : a.has_flips === false ? "No" : "", flat(a.recent_flips)].filter(has).join(", ")}.`);
  const buyer = [
    has(a.intended_use) ? `Why: ${flat(a.intended_use)}` : null,
    usageText(a) ? `Use: ${usageText(a)}` : null,
    timingText(a) ? `Timing: ${timingText(a)}` : null,
    specText(a) || has(a.spec_consideration) ? `Spec: ${specText(a) || flat(a.spec_consideration)}` : null,
    crossText(a) ? `Cross shopping: ${crossText(a)}` : null,
  ].filter(Boolean);
  if (buyer.length) parts.push(`Buyer: ${buyer.join("; ")}.`);
  if (has(a.concierge_rec)) parts.push(`Concierge rec: ${a.concierge_rec}${has(a.assessment) ? `. ${flat(a.assessment)}` : ""}.`);
  return parts.join(" ").replace(/\.\./g, ".");
}

// ---------------------------------------------------------------
// 2) BUYER PROFILE PDF
// Returns a complete HTML document: two letter pages, printed to PDF
// from the Outputs page. The photo is passed in only for display and
// printing; it is never saved anywhere.
// ---------------------------------------------------------------
const USE_TAG = {
  "Track Only": ["TRACK ONLY", "t-red"], Street: ["STREET", "t-black"], Daily: ["DAILY", "t-outline"],
  "Private Collection": ["PRIVATE COLL.", "t-grey"], "Public Collection": ["PUBLIC COLL.", "t-outline-grey"],
};
const SPLIT_COLORS = { track: "#eb0a1e", street: "#111", events: "#5c5c64", collection: "#c4c4ca" };
const DECISION_COLORS = { Approve: "#1f8a4c", Waitlist: "#c9890a", Decline: "#b0101f" };

// Banner phrases across page 1. The center slot carries the code phrase when the concierge ticks it.
export const CODE_PHRASE = "Brand Loyalist";
export const PHRASE_MAX = 22; // characters that fit one third of the banner
export const PERSONA_SUGGESTIONS = ["Track-Proven", "Driver, Not a Flipper", "Long-Term Owner", "Serious Collector", "Toyota Insider", "Lexus Loyal", "Club Leader", "Weekend Racer", "Grand Tourer", "Engineer at Heart", "Community Builder", "Quiet Enthusiast"];
export const isCodePhrase = (v) => clean(v).toLowerCase().replace(/[^a-z]/g, "") === CODE_PHRASE.toLowerCase().replace(/[^a-z]/g, "");
export function bannerPhrases(a) {
  const safe = (v) => (isCodePhrase(v) ? "" : clean(v));
  return [safe(a.persona_left), a.code_phrase ? CODE_PHRASE : safe(a.persona_center), safe(a.persona_right)];
}
// two or three sentences for the top of page 1; falls back to the start of the full bio
export const SHORT_BIO_FITS = 400;
// color chips on the PDF: options that name a color are filled with it
const SWATCH_GROUPS = ["Color", "Wheels", "Interior Color", "Brakes"];
const SWATCHES = [
  ["dark gray", "#4a4c52"], ["light gray", "#b4b7bd"], ["gloss gray", "#7d8087"], ["white", "#ffffff"], ["red", "#eb0a1e"],
  ["silver", "#a3a7ae"], ["blue", "#1f5fbf"], ["green", "#2e7d4f"], ["yellow", "#d9ae00"], ["black", "#111111"],
  ["gold", "#b8912f"], ["hazel", "#7b5232"], ["gray", "#8a8d93"],
];
function swatchStyle(group, item) {
  if (!SWATCH_GROUPS.includes(group)) return "";
  const t = clean(item).toLowerCase().replace(/grey/g, "gray");
  const hit = SWATCHES.find(([k]) => t.endsWith(k));
  if (!hit) return "";
  if (hit[0] === "white") return "background:#fff;color:#8a8a92;border-color:#a9a9b0";
  return `background:${hit[1]};color:#fff;border-color:${hit[1]}`;
}
const GLANCE_SPEC = { "Interior Color": "Interior", "Interior Material": "Material", "Seat Type": "Seats", Accessories: "Extras" };
export function shortBio(a) {
  if (has(a.bio_short)) return clean(a.bio_short);
  const s = clean(a.summary).replace(/\s+/g, " ");
  if (!s) return "";
  const sents = s.match(/[^.!?]+[.!?]+["”’)]*(\s|$)/g) || [s];
  let out = "";
  for (const x of sents) { if (out && (out + x).length > SHORT_BIO_FITS) break; out += x; }
  out = out.trim() || s;
  return out.length > SHORT_BIO_FITS + 40 ? out.slice(0, SHORT_BIO_FITS).replace(/\s+\S*$/, "") + "…" : out;
}

export function buildPersonaHtml(a, opts = {}) {
  const e = escapeHtml;
  const id = profileId(a);
  const parts = clean(a.name).split(/\s+/).filter(Boolean);
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const loc = location(a);
  const g = garageOf(a);
  const avg = avgOwnership(a);
  const miles = totalMiles(a);
  const asOf = a.interview_date ? fmtDate(a.interview_date) : "";
  const preparer = opts.preparer || {};
  const prepared = `PREPARED BY ${e(clean(preparer.name || a.interviewed_by) || "CONCIERGE TEAM").toUpperCase()}${has(preparer.title) ? `, ${e(preparer.title).toUpperCase()}` : ""}${asOf ? ` · ${e(asOf).toUpperCase()}` : ""}`;
  const none = (t = "Not recorded") => `<div class="none">${t}</div>`;
  const bullets = (items) => (items.length ? `<ul class="bul">${items.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : none());

  const rec = has(a.concierge_rec) ? a.concierge_rec : "";
  const recBadge = (cls) => (rec ? `<span class="rec ${cls}" style="background:${DECISION_COLORS[rec] || "#555"}">${cls === "rec-sm" || cls === "rec-tb" ? "CONCIERGE REC.&nbsp; " : ""}<b>${e(rec).toUpperCase()}</b></span>` : "");
  const topbar = (withRec) => `
    <div class="topbar">
      <div class="tb-left"><span class="mark"><i></i><i></i></span><b>GAZOO RACING</b><span>GR GT CONCIERGE BUYER PROGRAM</span></div>
      <div class="tb-right">${id ? `<span class="tb-id">${e(id)}</span>` : ""}${withRec ? recBadge("rec-tb") : ""}${a.vip ? `<span class="badge b-vip">VIP</span>` : ""}<span class="badge b-conf">CONFIDENTIAL</span></div>
    </div>`;
  const footer = (n) => `
    <div class="footer"><span>${prepared}</span><b>INTERNAL · LEADERSHIP REVIEW ONLY</b><span>PAGE ${n} / 2</span></div>`;

  // ----- page 1 -----
  const socials = rowsOf(a.socials, "handle");
  const socialHtml = socials.length ? socials.slice(0, 4).map((s) => `
      <div class="soc">
        <div class="soc-p">${e(clean(s.platform) || "Social").toUpperCase()}</div>
        <div class="soc-h"><b>${e(s.handle)}</b>${has(s.note) ? `<span>${e(s.note)}</span>` : ""}</div>
        <div class="soc-f">${e(fmtK(s.followers))}</div>
      </div>`).join("") + (asOf && socials.some((s) => Number(s.followers)) ? `<div class="soc-asof">Followers as of ${e(asOf)}</div>` : "")
    : has(a.social_media) ? `<div class="soc-old">${e(a.social_media).replace(/\n/g, "<br>")}</div>` : none();

  const scale = (title, levels, value, detail, tags) => {
    const lvl = levelScale(levels, value);
    const steps = levels.length - 1;
    return `
      <div class="scale">
        <div class="sc-head"><b>${title}</b><span>${value ? `${e(value).toUpperCase()}${lvl ? ` · ${lvl}/${steps}` : ""}` : "NOT SET"}</span></div>
        <div class="sc-bar">${Array.from({ length: steps }, (_, i) => `<i class="${lvl != null && i < lvl ? "on" : ""}"></i>`).join("")}</div>
        <div class="sc-ends"><span>NONE</span><span>PRO</span></div>
        ${tags && tags.length ? `<div class="sc-tags">${tags.map((t) => `<span>${e(t).toUpperCase()}</span>`).join("")}</div>` : ""}
        ${has(detail) ? `<p class="fit" data-fit="${title} details">${e(detail)}</p>` : ""}
      </div>`;
  };
  const style = a.driver_style == null || a.driver_style === "" ? null : Math.max(0, Math.min(100, Number(a.driver_style)));

  const photo = opts.photo
    ? `<img src="${opts.photo}" alt="">`
    : `<div class="ph-initials">${e(initials(a.name))}</div><div class="ph-stripes"></div><div class="ph-note">PHOTO PENDING</div>`;

  const th = rowsOf(a.toyota_history, "model");
  const lfa = lfaStatusOf(a);
  const u = usageSplitOf(a);
  const specs = specGroups(a);
  const phrases = bannerPhrases(a);
  const band = phrases.some(Boolean)
    ? `<div class="band band-words">${phrases.map((p, i) => `${i ? `<i class="sl">/</i>` : ""}<span>${e(p).toUpperCase()}</span>`).join("")}</div>`
    : `<div class="band band-words"></div>`;
  const topUse = u ? USAGE_SPLIT.filter(([k]) => u[k]).sort((x, y) => u[y[0]] - u[x[0]])[0] : null;
  const glance = `
    <div class="glance">
      <div class="gl">
        <label>CURRENT GARAGE${g.length ? ` · ${g.length}` : ""}</label>
        <div class="fit" data-fit="At a glance: current garage">${g.length ? `<ul class="gl-cars">${g.slice(0, 4).map((v) => `<li>${e(v.vehicle)}</li>`).join("")}</ul>${g.length > 4 ? `<div class="gl-more">+${g.length - 4} MORE ON PAGE 2</div>` : ""}` : none()}</div>
      </div>
      <div class="gl">
        <label>TIMING &amp; USE</label>
        ${has(a.target_quarter) ? `<div class="gl-big">${e(a.target_quarter)}</div>` : has(a.timing) ? `<div class="gl-mid">${e(a.timing)}</div>` : none("Timing not set")}
        ${has(a.timing_flex) ? `<div class="gl-sub">${e(a.timing_flex).toUpperCase()}</div>` : ""}
        ${topUse ? `<div class="gl-sub">MOSTLY ${e(topUse[1]).toUpperCase()} · ${u[topUse[0]]}%</div>` : ""}
      </div>
      <div class="gl">
        <label>CAR SPEC PREFERENCES</label>
        <div class="fit" data-fit="Car spec preferences">${specs.length ? `<div class="specp sm">${specs.map((s) => `<div class="sp-row"><b>${e(s.group || "Other").toUpperCase()}</b><span>${s.items.map((x) => `<i class="${s.priority ? "pri" : ""}" style="${swatchStyle(s.group, x)}">${e(x)}</i>`).join("")}</span></div>`).join("")}</div>` : has(a.spec_consideration) ? `<p class="old">${e(a.spec_consideration)}</p>` : none()}</div>
      </div>
    </div>`;

  const page1 = `
  <section class="page">
    ${topbar(true)}
    <div class="hero">
      <div class="h-left">
        <div class="idrow">
          <div class="thumb">${photo}</div>
          <div class="names"><div class="tagline"><b>GR GT</b>BUYER PROFILE</div><div class="fname">${e(first).toUpperCase()}</div><div class="lname">${e(last).toUpperCase()}</div></div>
        </div>
        <div class="facts">
          <div><label>AGE RANGE</label><b>${e(a.age_range) || "—"}</b></div>
          <div><label>LOCATION</label><b>${e(loc) || "—"}</b></div>
          <div><label>PREFERRED DEALER</label><b>${e(a.preferred_dealer) || "—"}</b></div>
        </div>
      </div>
      <div class="h-right">
        <h3>BIO</h3>
        <div class="bio fit" data-fit="Bio">${has(a.summary) ? clean(a.summary).split(/\n\s*\n|\n/).filter((p) => p.trim()).map((p) => `<p>${e(p)}</p>`).join("") : none()}</div>
        <div class="stats hstats">
          <div><b>${has(a.years_on_track) ? e(a.years_on_track) : "—"}</b><span>YRS ON TRACK</span></div>
          <div><b>${has(a.track_days) ? e(a.track_days) : "—"}</b><span>TRACK DAYS</span></div>
          <div><b>${avg != null ? `${avg}<small>YR</small>` : "—"}</b><span>AVG HOLD</span></div>
          <div><b>${g.length || "—"}</b><span>IN GARAGE</span></div>
          <div><b>${miles ? fmtK(miles) : "—"}</b><span>GARAGE MI/YR</span></div>
          <div><b>${th.length || "—"}</b><span>TOYOTA/LEXUS</span></div>
        </div>
      </div>
    </div>
    ${glance}
    ${band}
    <div class="grid3">
      <div class="panel-grey">
        <div class="ph"><b>SOCIAL MEDIA</b></div>
        <div class="fit socials" data-fit="Social media">${socialHtml}</div>
        <div class="ph ph2"><b>TRACK &amp; DRIVING CLUBS</b></div>
        <div class="fit clubs" data-fit="Track and driving clubs">${bullets(linesOf(a.clubs))}</div>
      </div>
      <div class="ms">
        <h3>MOTORSPORTS EXPERIENCE</h3>
        ${scale("HPDE", HPDE_LEVELS, a.hpde_level, a.hpde_experience)}
        ${scale("RACING", RACE_LEVELS, a.race_level, a.race_experience, a.race_series || [])}
      </div>
      <div class="panel-red">
        <h3>RAW NUMBERS VS. EXPERIENCE</h3>
        ${style == null ? `<div class="none light">Not recorded</div>` : `
        <div class="slider"><div class="sl-track"><span style="width:${style}%"></span></div><i style="left:${style}%"></i></div>
        <div class="sl-ends"><span>RAW NUMBERS</span><span>OVERALL EXPERIENCE</span></div>
        <div class="sl-label">${e(driverStyleLabel(style)).toUpperCase()}</div>`}
        ${has(a.driver_style_note) ? `<p class="fit" data-fit="Driver style note">${e(a.driver_style_note)}</p>` : ""}
      </div>
    </div>
    <div class="biorow">
      <div><h3>DRIVER &amp; BRAND</h3>
        <div class="dbrand">
          <div><label>HPDE</label><b>${e(a.hpde_level) || "—"}</b></div>
          <div><label>RACING</label><b>${e(a.race_level) || "—"}</b></div>
          <div><label>TOYOTA / LEXUS OWNED</label><b>${th.length || "—"}</b></div>
          <div><label>LFA</label><b>${e(lfa) || "—"}</b></div>
        </div>
      </div>
      <div>${has(a.what_drives_you) ? `<div class="quote"><label>WHAT DRIVES YOU</label><div class="fit" data-fit="What Drives You quote">“${e(a.what_drives_you)}”</div></div>` : ""}<h3>TMC / TMNA RELATIONSHIPS</h3><div class="fit" data-fit="TMNA relationships">${bullets(linesOf(a.tmna_relationship))}</div></div>
    </div>
    <div class="watermark">GR GT</div>
    ${footer(1)}
  </section>`;

  // ----- page 2 -----
  const maxMiles = Math.max(12000, ...g.map((v) => Number(v.miles) || 0));
  const garageRows = g.length ? g.slice(0, 8).map((v, i) => `
      <tr>
        <td class="gn">${i + 1}</td>
        <td class="gv">${e(v.vehicle)}</td>
        <td class="gu">${(v.usage || []).map((u) => { const [t, c] = USE_TAG[u] || [u.toUpperCase(), "t-outline"]; return `<span class="tag ${c}">${e(t)}</span>`; }).join("")}</td>
        <td class="gb"><span class="mbar"><i style="width:${Math.min(100, ((Number(v.miles) || 0) / maxMiles) * 100)}%"></i></span></td>
        <td class="gm">${Number(v.miles) ? fmtMiles(v.miles) : "—"}</td>
        <td class="gh">${e(v.use_note)}</td>
      </tr>`).join("") : `<tr><td colspan="6">${none()}</td></tr>`;

  const histList = (rows) => {
    if (!rows.length) return none();
    const max = Math.max(8, ...rows.map((r) => Number(r.held) || 0));
    return rows.slice(0, 5).map((r) => `
      <div class="hist">
        <div class="hi-name"><b>${e([clean(r.year), clean(r.model)].filter(Boolean).join(" "))}</b>${has(r.note) ? `<span>${e(r.note)}</span>` : ""}</div>
        <span class="hbar"><i style="width:${((Number(r.held) || 0) / max) * 100}%"></i></span>
        <span class="hi-y">${Number(r.held) ? `${r.held}y` : ""}</span>
      </div>`).join("");
  };

  // pipeline: Intake > Interview > Leadership > Allocation > Delivery
  const decided = ["Approve", "Waitlist", "Decline"].includes(a.allocation);
  const stage = a.status !== "Complete" ? 1 : !decided ? 2 : 3;
  const allocSub = a.allocation === "Approve" ? "DEALER & BUILD SLOT" : a.allocation === "Waitlist" ? "WAITLISTED" : a.allocation === "Decline" ? "DECLINED" : "DEALER & BUILD SLOT";
  const steps = [
    ["INTAKE", "CONCIERGE LEAD"],
    ["INTERVIEW", stage === 1 ? "● CURRENT STEP" : "PROFILE BUILT"],
    ["LEADERSHIP", stage === 2 ? "● CURRENT STEP" : stage > 2 ? "DECISION MADE" : "REVIEW"],
    ["ALLOCATION", stage === 3 ? `● ${allocSub}` : allocSub],
    [`DELIVERY${has(a.target_quarter) ? ` · ${e(a.target_quarter).toUpperCase()}` : ""}`, "TARGET"],
  ];
  const stepper = `<div class="stepper">${steps.map(([t, s], i) => `<div class="step ${i < stage ? "done" : i === stage ? "cur" : i === 4 ? "target" : ""}"><b>${t}</b><span>${s}</span></div>`).join("")}</div>`;

  const usageHtml = u ? `
      <div class="ubar">${USAGE_SPLIT.filter(([k]) => u[k]).map(([k]) => `<span style="flex:${u[k]};background:${SPLIT_COLORS[k]}">${u[k] >= 10 ? `${u[k]}%` : ""}</span>`).join("")}</div>
      <div class="ulegend">${USAGE_SPLIT.map(([k, l]) => `<span><i style="background:${SPLIT_COLORS[k]}"></i>${l.toUpperCase()} ${u[k]}%</span>`).join("")}</div>`
    : (a.gt_usage || []).length ? `<div class="ulegend">${a.gt_usage.map((x) => `<span><i style="background:#eb0a1e"></i>${e(x).toUpperCase()}</span>`).join("")}</div>` : none();

  const cross = rowsOf(a.cross_shop, "model");

  const page2 = `
  <section class="page">
    ${topbar(false)}
    <div class="p2-head">
      <div><span class="p2-name">${e(a.name).toUpperCase()}</span><span class="p2-sub">${e([loc, a.preferred_dealer].filter(has).join(" · ")).toUpperCase()}</span></div>
      ${recBadge("rec-sm")}
    </div>
    <div class="sect"><span class="sect-tab">CAR PROFILE</span><span class="sect-r">OWNERSHIP &amp; USAGE HISTORY</span></div>
    <table class="garage">
      <thead><tr><th colspan="2">CURRENT GARAGE</th><th>USE</th><th colspan="2">MILES / YR</th><th>HOW IT'S USED</th></tr></thead>
      <tbody>${garageRows}</tbody>
      <tfoot><tr><td colspan="3">${g.length} VEHICLE${g.length === 1 ? "" : "S"}</td><td colspan="3">${fmtMiles(miles)} MI / YR TOTAL</td></tr></tfoot>
    </table>
    <div class="hist-row">
      <div class="lfa-box">
        <h4>PREVIOUS LFA EXPERIENCE</h4>
        <div class="lfa-line"><span class="lfa-logo">LFA</span><span class="lfa-st">${e(lfa || "Not discussed").toUpperCase()}</span></div>
        ${has(a.lfa_note) ? `<p class="fit" data-fit="LFA note">${e(a.lfa_note)}</p>` : ""}
      </div>
      <div><div class="hh"><h3>TOYOTA / LEXUS HISTORY</h3><span>YEARS HELD</span></div><div class="fit" data-fit="Toyota / Lexus history">${th.length ? histList(th) : has(a.previous_toyota_lexus) ? `<p class="old">${e(a.previous_toyota_lexus)}</p>` : none()}</div></div>
      <div><div class="hh"><h3>SIGNIFICANT PAST CARS</h3><span>YEARS HELD</span></div><div class="fit" data-fit="Significant past cars">${histList(rowsOf(a.past_cars, "model"))}</div></div>
    </div>
    <div class="sect"><span class="sect-tab">BUYER PROFILE</span><span class="sect-r">PURCHASE INTENT &amp; FIT</span></div>
    ${stepper}
    <div class="buy3">
      <div><h3>WHY THE GR GT</h3><div class="why fit" data-fit="Why the GR GT">${has(a.intended_use) ? e(a.intended_use) : none()}</div></div>
      <div><h3>INTENDED USAGE</h3>${usageHtml}${has(a.usage_note) ? `<p class="fit" data-fit="Intended usage note">${e(a.usage_note)}</p>` : ""}</div>
      <div><h3>TIMING</h3>
        ${has(a.target_quarter) ? `<div class="tq">${e(a.target_quarter)}</div>` : has(a.timing) ? `<div class="tq sm">${e(a.timing)}</div>` : none()}
        ${has(a.timing_flex) ? `<div class="tflex">${a.timing_flex === "Firm" ? "FIRM" : a.timing_flex === "Open" ? "OPEN" : `FLEXIBLE ${e(a.timing_flex).toUpperCase()}`}</div>` : ""}
        ${has(a.timing_note) ? `<p class="fit" data-fit="Timing note">${e(a.timing_note)}</p>` : ""}
      </div>
    </div>
    <div class="buy2">
      <div><h3>KEY MOTORSPORTS EVENTS</h3><div class="fit" data-fit="Key motorsports events">${bullets(linesOf(a.key_events))}</div></div>
      <div><h3>CROSS SHOPPING</h3><div class="fit" data-fit="Cross shopping">${cross.length ? `<table class="cross">${cross.slice(0, 6).map((c) => `<tr><td>${e(c.model)}</td><td>${e([c.status, c.note].filter(has).join(" · ")).toUpperCase()}</td></tr>`).join("")}</table>` : none()}</div></div>
    </div>
    <div class="bottom">
      <div class="asmt">
        <h3>CONCIERGE ASSESSMENT</h3>
        ${recBadge("rec-lg")}
        <div class="fit" data-fit="Concierge assessment">
          ${has(a.assessment) ? `<p>${e(a.assessment)}</p>` : `<div class="none light">Not written yet</div>`}
          <ul class="pm">${linesOf(a.strengths).map((x) => `<li><i class="plus">+</i>${e(x)}</li>`).join("")}${linesOf(a.concerns).map((x) => `<li><i class="flag">!</i>${e(x)}</li>`).join("")}</ul>
        </div>
      </div>
      <div class="decision">
        <h3>LEADERSHIP DECISION</h3>
        <div class="boxes">${DECISIONS.map((d) => `<span><i class="${a.allocation === d ? "x" : ""}">${a.allocation === d ? "✓" : ""}</i>${d.toUpperCase()}</span>`).join("")}</div>
        <div class="sign"><span>REVIEWER NAME</span><span>DATE</span><span>SIGNATURE</span><span>ALLOCATION REF.</span></div>
      </div>
    </div>
    ${footer(2)}
  </section>`;

  const title = [id, a.name].filter(Boolean).join(" ");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${e(title)} Buyer Profile</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;1,700;1,800&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${PERSONA_CSS}</style></head><body>${page1}${page2}
<script>
  // safety net: shrink any banner phrase that is still too wide for its third of the banner
  function fitBand() { document.querySelectorAll(".band-words span").forEach(function (el) { var f = 20; el.style.fontSize = f + "px"; while (el.scrollWidth > el.clientWidth + 1 && f > 12) { f -= 0.5; el.style.fontSize = f + "px"; } }); }
  fitBand(); if (document.fonts) document.fonts.ready.then(fitBand);
</script></body></html>`;
}

const PERSONA_CSS = `
@page { size: letter portrait; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; }
body { background: #6b6b70; font-family: Barlow, Arial, sans-serif; color: #18181b; font-size: 11px; line-height: 1.45; }
.page { position: relative; width: 816px; height: 1056px; margin: 0 auto 24px; background: #fff; overflow: hidden; display: flex; flex-direction: column; }
@media print { body { background: #fff; } .page { margin: 0; break-after: page; page-break-after: always; } .page:last-child { break-after: auto; page-break-after: auto; } }
h3 { font: 700 13px/1 "Barlow Condensed", sans-serif; letter-spacing: .1em; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 2px solid #111; }
h4 { margin: 0; }
p { margin: 0 0 6px; }
ul { margin: 0; padding: 0; list-style: none; }
.none { color: #9a9aa2; font-style: italic; font-size: 10.5px; }
.none.light { color: rgba(255,255,255,.7); }
.fit { overflow: hidden; }

.topbar { height: 32px; background: #0d0d0f; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; flex-shrink: 0; }
.tb-left { display: flex; align-items: center; gap: 12px; font: 600 10.5px "Barlow Condensed"; letter-spacing: .12em; }
.tb-left b { font: italic 800 14px "Barlow Condensed"; letter-spacing: .04em; }
.mark { display: inline-flex; gap: 2px; transform: skewX(-18deg); }
.mark i { width: 4px; height: 13px; background: #eb0a1e; } .mark i + i { background: #fff; }
.tb-right { display: flex; align-items: center; gap: 10px; font: 600 11px "Barlow Condensed"; letter-spacing: .1em; }
.tb-id { color: #c8c8cc; margin-right: 6px; }
.badge { font: 700 10.5px "Barlow Condensed"; letter-spacing: .12em; padding: 3px 10px; }
.b-vip { background: #ffd400; color: #111; }
.b-conf { background: #eb0a1e; color: #fff; }

.hero { display: grid; grid-template-columns: 1fr 1.12fr; gap: 0 28px; padding: 0 30px 0 36px; height: 300px; flex-shrink: 0; }
.h-left { display: flex; flex-direction: column; }
.ribbon { background: #eb0a1e; color: #fff; width: 112px; padding: 8px 12px 18px; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%); }
.ribbon b { display: block; font: italic 800 22px/1 "Barlow Condensed"; }
.ribbon span { font: 700 9.5px/1.3 "Barlow Condensed"; letter-spacing: .14em; }
.idrow { display: flex; align-items: center; gap: 20px; margin: auto 0; padding-top: 10px; }
.tagline { display: inline-flex; align-items: center; gap: 6px; background: #eb0a1e; color: #fff; font: 700 9px "Barlow Condensed"; letter-spacing: .16em; padding: 3px 10px 3px 8px; margin-bottom: 8px; clip-path: polygon(0 0, 100% 0, calc(100% - 6px) 100%, 0 100%); }
.tagline b { font: italic 800 13px/1 "Barlow Condensed"; letter-spacing: .02em; }
.thumb { position: relative; width: 108px; height: 128px; flex-shrink: 0; overflow: hidden; clip-path: polygon(10% 0, 100% 0, 90% 100%, 0 100%); background: linear-gradient(180deg, #17171a 0%, #2b1418 70%, #5a1520 100%); display: flex; align-items: center; justify-content: center; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.ph-stripes { position: absolute; inset: 0; background: repeating-linear-gradient(115deg, rgba(255,255,255,.05) 0 8px, transparent 8px 18px); }
.ph-initials { position: relative; z-index: 1; font: italic 800 40px/1 "Barlow Condensed"; color: #fff; }
.ph-note { position: absolute; left: 0; right: 0; bottom: 6px; text-align: center; font: 600 6.5px "Barlow Condensed"; letter-spacing: .16em; color: rgba(255,255,255,.55); z-index: 1; }
.names { min-width: 0; }
.fname { font: italic 800 54px/.9 "Barlow Condensed"; letter-spacing: -.01em; word-break: break-word; }
.lname { font: 800 28px/1 "Barlow Condensed"; color: #5c5c64; margin-top: 3px; word-break: break-word; }
.facts { margin-top: 0; margin-bottom: 16px; height: 62px; box-sizing: border-box; padding-top: 12px; border-top: 2px solid #111; display: grid; grid-template-columns: .7fr 1fr 1.5fr; gap: 12px; }
.facts .wide { grid-column: 1 / -1; }
.facts label { display: block; font: 600 8.5px "Barlow Condensed"; letter-spacing: .16em; color: #8a8a92; }
.facts b { font-size: 12.5px; font-weight: 700; }
.h-right { padding-top: 22px; padding-bottom: 12px; display: flex; flex-direction: column; min-height: 0; }
.quote { background: #eb0a1e; color: #fff; padding: 10px 16px 12px; margin-bottom: 12px; flex-shrink: 0; }
.quote label { font: 700 8.5px "Barlow Condensed"; letter-spacing: .16em; opacity: .85; }
.quote .fit { font: italic 700 15px/1.25 "Barlow Condensed"; margin-top: 4px; max-height: 76px; }
.h-right h3 { flex-shrink: 0; }
.glance { display: grid; grid-template-columns: 1fr .72fr 1.75fr; margin: 0 36px 12px; background: #f2f2f4; border-top: 3px solid #111; height: 180px; grid-template-rows: 100%; flex-shrink: 0; }
.gl { padding: 9px 12px 8px; border-right: 1px solid #dcdce0; min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.gl:last-child { border-right: none; }
.gl label { font: 700 9px "Barlow Condensed"; letter-spacing: .16em; color: #eb0a1e; margin-bottom: 5px; display: block; }
.gl .fit { flex: 1; min-height: 0; }
.gl-cars li { font-size: 10.5px; font-weight: 700; line-height: 1.3; padding: 2px 0; border-bottom: 1px solid #e2e2e6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gl-cars li:last-child { border-bottom: none; }
.gl-more { font: 700 8px "Barlow Condensed"; letter-spacing: .12em; color: #6b6b73; margin-top: 2px; }
.gl-specs { display: grid; grid-template-columns: max-content 1fr; gap: 1px 10px; align-items: baseline; }
.gl-specs li { display: contents; font-size: 10px; line-height: 1.2; }
.gl-specs b { font: 700 8.5px "Barlow Condensed"; letter-spacing: .1em; color: #5c5c64; white-space: nowrap; }
.gl-specs span { font-size: 10px; line-height: 1.2; }
.gl-big { font: italic 800 30px/1 "Barlow Condensed"; color: #111; }
.gl-mid { font: italic 800 16px/1.1 "Barlow Condensed"; }
.gl-sub { font: 700 9px "Barlow Condensed"; letter-spacing: .1em; color: #3a3a40; margin-top: 4px; }
.gl-dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; align-items: baseline; }
.gl-dl dt { font: 700 8.5px "Barlow Condensed"; letter-spacing: .12em; color: #5c5c64; }
.gl-dl dd { margin: 0; font-size: 10.5px; font-weight: 700; line-height: 1.25; }
.biorow { display: grid; grid-template-columns: 1.25fr 1fr; gap: 24px; padding: 0 36px; margin-top: 14px; position: relative; z-index: 1; }
.h-right .bio { flex: 1; min-height: 0; font-size: 10.5px; color: #3a3a40; line-height: 1.45; }
.bio p { margin-bottom: 6px; }
.biorow .fit { max-height: 122px; }
.dbrand { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
.dbrand div { border-left: 3px solid #eb0a1e; padding: 4px 0 4px 10px; background: #f6f6f8; }
.dbrand label { display: block; font: 700 8.5px "Barlow Condensed"; letter-spacing: .14em; color: #5c5c64; }
.dbrand b { display: block; font: italic 800 20px/1.15 "Barlow Condensed"; }
.biorow .quote { margin-bottom: 12px; background: #0d0d0f; border-left: 5px solid #eb0a1e; } .biorow .quote label { color: #eb0a1e; opacity: 1; } .biorow .quote .fit { max-height: 54px; font-size: 13.5px; }
.biorow .quote + h3 + .fit { max-height: 74px; }
.specp { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
.sp-row { display: flex; flex-direction: column; gap: 3px; padding-bottom: 6px; border-bottom: 1px solid #ececef; }
.sp-row b { font: 700 9px "Barlow Condensed"; letter-spacing: .12em; color: #5c5c64; }
.sp-row span { display: flex; flex-wrap: wrap; gap: 4px; }
.sp-row i { font-style: normal; font: 700 10px "Barlow Condensed"; letter-spacing: .06em; text-transform: uppercase; border: 1px solid #111; padding: 2px 7px; }
.specp.sm { gap: 3px 14px; }
.specp.sm .sp-row { gap: 2px; padding-bottom: 4px; border-bottom-color: #e2e2e6; }
.specp.sm .sp-row b { font-size: 8px; }
.specp.sm .sp-row span { gap: 3px; }
.specp.sm .sp-row i { font-size: 8.5px; padding: 1px 5px; }
.sp-row i.pri { background: #eb0a1e; border-color: #eb0a1e; color: #fff; }
.band { height: 12px; background: #0d0d0f; margin: 0 0 14px; position: relative; flex-shrink: 0; }
.band-words { height: 42px; display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 10px; padding: 0 44px; overflow: hidden; }
.band-words span { font: italic 800 20px/1 "Barlow Condensed"; letter-spacing: .03em; color: #fff; white-space: nowrap; text-align: center; overflow: hidden; }
.band-words .sl { font: italic 800 22px/1 "Barlow Condensed"; color: #eb0a1e; font-style: normal; transform: skewX(-12deg); }
.band::before, .band::after { content: ""; position: absolute; top: 0; bottom: 0; width: 22px; background: #eb0a1e; transform: skewX(-20deg); }
.band::before { left: -8px; } .band::after { right: -8px; }

.grid3 { display: grid; grid-template-columns: 268px 1fr 254px; gap: 18px; padding: 0 36px; flex-shrink: 0; position: relative; z-index: 1; }
.panel-grey { background: #efeff1; padding: 12px 16px 12px; height: 272px; display: flex; flex-direction: column; }
.ph { border-bottom: 2px solid #111; padding-bottom: 5px; margin-bottom: 8px; font: 700 12.5px "Barlow Condensed"; letter-spacing: .12em; }
.hstats { display: grid; grid-template-columns: repeat(6, 1fr); margin-top: 10px; border-top: 2px solid #111; padding-top: 12px; height: 62px; margin-bottom: 4px; box-sizing: border-box; flex-shrink: 0; }
.hstats div { padding-right: 4px; }
.hstats div + div { border-left: 1px solid #e3e3e7; padding-left: 7px; }
.hstats b { display: block; font: italic 800 28px/1 "Barlow Condensed"; color: #eb0a1e; }
.hstats b small { font-size: 11px; margin-left: 1px; }
.hstats span { display: block; margin-top: 3px; font: 600 7.5px/1.15 "Barlow Condensed"; letter-spacing: .08em; color: #5c5c64; white-space: nowrap; }
.ph2 { margin-top: 12px; }
.clubs { max-height: 92px; }
.socials { max-height: 120px; }
.soc { display: grid; grid-template-columns: 62px 1fr auto; gap: 6px; padding: 6px 0; border-bottom: 1px solid #d6d6db; align-items: baseline; }
.soc-p { font: 700 9.5px/1.3 "Barlow Condensed"; letter-spacing: .1em; }
.soc-h b { display: block; font-size: 10.5px; line-height: 1.3; } .soc-h span { color: #6b6b73; font-size: 9.5px; }
.soc-f { font: italic 800 14px "Barlow Condensed"; color: #eb0a1e; }
.soc-asof { font-size: 8.5px; color: #8a8a92; margin-top: 4px; }
.soc-old { font-size: 10.5px; }
.ms { height: 272px; display: flex; flex-direction: column; overflow: hidden; }
.scale { margin-bottom: 10px; }
.sc-head { display: flex; justify-content: space-between; font: 700 12px "Barlow Condensed"; letter-spacing: .06em; }
.sc-head span { color: #eb0a1e; font-size: 10.5px; letter-spacing: .08em; }
.sc-bar { display: flex; gap: 3px; margin: 5px 0 2px; }
.sc-bar i { flex: 1; height: 9px; background: #d9d9de; transform: skewX(-20deg); } .sc-bar i.on { background: #eb0a1e; }
.sc-ends { display: flex; justify-content: space-between; font: 600 7.5px "Barlow Condensed"; letter-spacing: .14em; color: #9a9aa2; margin-bottom: 5px; }
.sc-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 5px; }
.sc-tags span { background: #111; color: #fff; font: 700 8.5px "Barlow Condensed"; letter-spacing: .08em; padding: 3px 7px; }
.scale p { font-size: 10.5px; color: #3a3a40; max-height: 46px; }
.panel-red { background: #eb0a1e; color: #fff; padding: 14px 16px; height: 272px; overflow: hidden; }
.panel-red h3 { border-color: #fff; }
.slider { position: relative; margin: 18px 0 6px; }
.sl-track { height: 5px; background: rgba(255,255,255,.4); } .sl-track span { display: block; height: 100%; background: #fff; }
.slider i { position: absolute; top: -6px; width: 16px; height: 16px; border-radius: 50%; background: #111; border: 3px solid #fff; transform: translateX(-50%); }
.sl-ends { display: flex; justify-content: space-between; font: 700 8.5px "Barlow Condensed"; letter-spacing: .12em; }
.sl-label { font: italic 800 21px "Barlow Condensed"; margin: 10px 0 8px; }
.panel-red p { font-size: 10.5px; line-height: 1.5; max-height: 110px; }
.lists { margin-top: 16px; }
.lists .fit { max-height: 128px; }
.bul li { position: relative; padding-left: 15px; margin-bottom: 4px; font-size: 10.5px; }
.bul li::before { content: ""; position: absolute; left: 0; top: 4px; width: 8px; height: 5px; background: #eb0a1e; transform: skewX(-20deg); }
.watermark { position: absolute; right: 18px; bottom: 34px; font: italic 800 130px/1 "Barlow Condensed"; color: transparent; -webkit-text-stroke: 1px #ececef; pointer-events: none; z-index: 0; }
.footer { margin-top: auto; height: 32px; border-top: 1px solid #ddd; display: flex; align-items: center; justify-content: space-between; padding: 0 36px; font: 600 8.5px "Barlow Condensed"; letter-spacing: .12em; color: #6b6b73; position: relative; z-index: 1; background: #fff; flex-shrink: 0; }
.footer b { color: #111; font-weight: 700; }

.p2-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 36px 8px; flex-shrink: 0; }
.p2-name { font: italic 800 26px "Barlow Condensed"; margin-right: 10px; }
.p2-sub { font: 600 11px "Barlow Condensed"; letter-spacing: .12em; color: #5c5c64; }
.rec { color: #fff; font: 600 10px "Barlow Condensed"; letter-spacing: .12em; padding: 6px 18px; clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%); display: inline-block; }
.rec b { font: italic 800 16px "Barlow Condensed"; letter-spacing: .06em; }
.rec-tb { padding: 2px 14px; font-size: 9px; } .rec-tb b { font-size: 13px; }
.rec-lg { margin-bottom: 6px; padding: 3px 18px; } .rec-lg b { font-size: 18px; }
.sect { display: flex; align-items: center; justify-content: space-between; background: #ececef; height: 28px; margin: 2px 0 10px; padding-right: 36px; flex-shrink: 0; }
.sect-tab { background: #eb0a1e; color: #fff; font: italic 800 16px "Barlow Condensed"; letter-spacing: .04em; padding: 0 20px 0 36px; height: 36px; display: flex; align-items: center; clip-path: polygon(0 0, 100% 0, 100% 80%, 92% 100%, 0 100%); margin-top: 6px; }
.sect-r { font: 600 9px "Barlow Condensed"; letter-spacing: .14em; color: #5c5c64; }
.garage { width: calc(100% - 72px); margin: 0 36px; border-collapse: collapse; flex-shrink: 0; }
.garage th { text-align: left; font: 700 9px "Barlow Condensed"; letter-spacing: .14em; color: #5c5c64; padding: 4px 6px 5px 0; border-bottom: 2px solid #111; }
.garage td { padding: 4px 6px 4px 0; border-bottom: 1px solid #e3e3e7; font-size: 10.5px; vertical-align: middle; }
.garage .gn { color: #eb0a1e; font: italic 800 12px "Barlow Condensed"; width: 14px; }
.garage .gv { font-weight: 700; width: 210px; }
.garage .gu { width: 150px; }
.garage .gb { width: 100px; } .garage .gm { width: 46px; text-align: right; font-weight: 700; padding-right: 10px; }
.garage .gh { color: #3a3a40; }
.garage tfoot td { border: none; font: 700 9px "Barlow Condensed"; letter-spacing: .14em; color: #5c5c64; padding-top: 6px; }
.garage tfoot td:last-child { padding-left: 0; }
.tag { display: inline-block; font: 700 8.5px "Barlow Condensed"; letter-spacing: .08em; padding: 2px 6px; margin: 1px 3px 1px 0; }
.t-red { background: #eb0a1e; color: #fff; } .t-black { background: #111; color: #fff; } .t-grey { background: #5c5c64; color: #fff; }
.t-outline { border: 1px solid #111; padding: 1px 5px; } .t-outline-grey { border: 1px solid #8a8a92; color: #5c5c64; padding: 1px 5px; }
.mbar { display: block; height: 9px; background: #ececef; } .mbar i { display: block; height: 100%; background: #111; }
.hist-row { display: grid; grid-template-columns: 260px 1fr 1fr; gap: 20px; padding: 12px 36px 0; height: 178px; flex-shrink: 0; }
.lfa-box { background: #0d0d0f; color: #fff; padding: 14px 16px; position: relative; overflow: hidden; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
.lfa-box::after { content: ""; position: absolute; right: -30px; top: 0; bottom: 0; width: 60px; background: #eb0a1e; transform: skewX(-12deg); }
.lfa-box h4 { font: 700 12.5px "Barlow Condensed"; letter-spacing: .12em; border-bottom: 1px solid #555; padding-bottom: 6px; margin-bottom: 8px; position: relative; z-index: 1; }
.lfa-line { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; position: relative; z-index: 1; }
.lfa-logo { font: italic 800 30px/1 "Barlow Condensed"; color: transparent; -webkit-text-stroke: 1px #fff; }
.lfa-st { background: #fff; color: #111; font: 700 11px "Barlow Condensed"; letter-spacing: .12em; padding: 3px 10px; }
.lfa-box p { font-size: 10.5px; line-height: 1.45; max-height: 92px; position: relative; z-index: 1; padding-right: 26px; }
.hh { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; margin-bottom: 8px; }
.hh h3 { border: none; margin: 0; padding-bottom: 6px; }
.hh span { font: 600 8.5px "Barlow Condensed"; letter-spacing: .14em; color: #8a8a92; }
.hist-row .fit { max-height: 136px; }
.hist { display: grid; grid-template-columns: 1fr 76px 24px; gap: 8px; align-items: center; margin-bottom: 6px; }
.hi-name b { display: block; font-size: 10.5px; } .hi-name span { font-size: 9px; color: #6b6b73; }
.hbar { height: 8px; background: #ececef; } .hbar i { display: block; height: 100%; background: #eb0a1e; }
.hi-y { text-align: right; font: italic 800 13px "Barlow Condensed"; }
.old { font-size: 10.5px; white-space: pre-line; }
.stepper { display: flex; margin: 0 36px 12px; height: 38px; flex-shrink: 0; }
.step { flex: 1; background: #ececef; color: #8a8a92; padding: 6px 10px 0 22px; clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%); margin-right: -10px; }
.step:first-child { clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%); padding-left: 14px; }
.step b { display: block; font: 700 12px "Barlow Condensed"; letter-spacing: .06em; }
.step span { font: 600 8px "Barlow Condensed"; letter-spacing: .14em; }
.step.done { background: #0d0d0f; color: #fff; } .step.cur { background: #eb0a1e; color: #fff; } .step.target { background: #fde3e6; color: #eb0a1e; }
.buy3 { display: grid; grid-template-columns: 1.15fr 1fr .8fr; gap: 22px; padding: 0 36px; height: 140px; flex-shrink: 0; }
.why { border-left: 3px solid #eb0a1e; padding-left: 10px; font-size: 10.5px; color: #3a3a40; max-height: 112px; }
.ubar { display: flex; height: 22px; margin-bottom: 6px; gap: 2px; }
.ubar span { color: #fff; font: 700 9.5px "Barlow Condensed"; display: flex; align-items: center; justify-content: center; }
.ulegend { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; font: 700 8.5px "Barlow Condensed"; letter-spacing: .08em; margin-bottom: 6px; }
.ulegend i { display: inline-block; width: 8px; height: 8px; margin-right: 5px; vertical-align: -1px; }
.buy3 p { font-size: 10.5px; color: #3a3a40; max-height: 48px; }
.tq { font: italic 800 38px/1 "Barlow Condensed"; color: #eb0a1e; } .tq.sm { font-size: 22px; }
.tflex { font: 700 11px "Barlow Condensed"; letter-spacing: .1em; margin: 2px 0 6px; }
.buy2 { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 0 36px; height: 120px; flex-shrink: 0; }
.specs { display: flex; flex-wrap: wrap; gap: 5px; align-content: flex-start; max-height: 92px; }
.specs span { border: 1px solid #111; font: 700 9px "Barlow Condensed"; letter-spacing: .08em; padding: 4px 8px; }
.specs span b { color: #eb0a1e; margin-right: 2px; }
.specs span.pri { background: #eb0a1e; border-color: #eb0a1e; color: #fff; }
.cross { width: 100%; border-collapse: collapse; } .cross td { padding: 3px 0; border-bottom: 1px solid #e3e3e7; font-size: 10.5px; font-weight: 700; }
.cross td + td { text-align: right; font: 600 8.5px "Barlow Condensed"; letter-spacing: .1em; color: #3a3a40; }
.buy2 .fit { max-height: 92px; }
.bottom { margin-top: auto; background: #fff; color: #18181b; display: grid; grid-template-columns: 1.15fr 1fr; gap: 30px; padding: 14px 36px 8px; height: 200px; border-top: 6px solid #eb0a1e; flex-shrink: 0; }
.bottom h3 { border-color: #111; color: #111; }
.bottom .none.light { color: #9a9aa2; }
.pm li { color: #18181b; } .pm i { color: #fff; }
.decision { border-left: 1px solid #d6d6db; padding-left: 24px; }
.asmt .fit { max-height: 104px; font-size: 10.5px; line-height: 1.45; }
.pm li { display: flex; gap: 8px; align-items: flex-start; margin-top: 4px; font-size: 10px; }
.pm i { width: 13px; height: 13px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font: 800 10px Barlow; font-style: normal; }
.pm .plus { background: #1f8a4c; } .pm .flag { background: #c9890a; }
.boxes { display: flex; gap: 18px; margin: 4px 0 18px; }
.boxes span { display: flex; align-items: center; gap: 7px; font: 700 13px "Barlow Condensed"; letter-spacing: .1em; }
.boxes i { width: 17px; height: 17px; border: 1.5px solid #111; display: inline-flex; align-items: center; justify-content: center; font-style: normal; font-size: 12px; }
.boxes i.x { background: #111; color: #fff; }
.sign { display: grid; grid-template-columns: 1.4fr 1fr; gap: 22px 22px; }
.sign span { border-bottom: 1px solid #111; padding-top: 22px; font: 600 8px "Barlow Condensed"; letter-spacing: .14em; color: #5c5c64; }

`;
