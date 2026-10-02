// Outputs for an applicant:
//  1) a plain text summary to paste into the other internal tool
//  2) the Bio Persona (design pending)

export const USAGE_OPTIONS = ["Private Collection", "Public Collection", "Street", "Track Only", "Daily"];

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

// ---------------------------------------------------------------
// 1) TEXT SUMMARY
// ---------------------------------------------------------------
export function buildSummaryText(a, mode = "full") {
  return mode === "compact" ? compactText(a) : fullText(a);
}

function line(label, value) {
  return has(value) ? `${label}: ${clean(value).replace(/\s*\n+\s*/g, "; ")}` : null;
}

function fullText(a) {
  const out = [];
  const g = garageOf(a);
  out.push("GR GT APPLICANT PROFILE");
  out.push(line("Name", a.name));
  out.push(line("Age Range", a.age_range));
  out.push(line("Preferred Dealer", a.preferred_dealer));
  const flags = [a.vip ? "VIP" : null, a.lfa_owner ? "LFA Owner" : null].filter(Boolean);
  if (flags.length) out.push(`Flags: ${flags.join(", ")}`);
  out.push(line("TMNA Relationship", a.tmna_relationship));
  out.push(line("Social Media", a.social_media));

  if (has(a.summary)) out.push("", "SUMMARY", clean(a.summary));

  const ms = [
    line("HPDE Level", a.hpde_level),
    line("HPDE Details", a.hpde_experience),
    line("Race Level", a.race_level),
    line("Race Details", a.race_experience),
    line("Key Events Attended", a.key_events),
    line("What Drives Them", a.what_drives_you),
  ].filter(Boolean);
  if (ms.length) out.push("", "MOTORSPORTS / EVENTS", ...ms);

  const car = [];
  if (g.length) {
    car.push(`Current Garage (${g.length} vehicle${g.length === 1 ? "" : "s"}, approx ${fmtMiles(totalMiles(a))} mi/yr combined):`);
    g.forEach((v, i) => {
      const bits = [];
      if (v.usage && v.usage.length) bits.push(v.usage.join(", "));
      if (Number(v.miles)) bits.push(`${fmtMiles(v.miles)} mi/yr`);
      car.push(`${i + 1}. ${clean(v.vehicle)}${bits.length ? ` (${bits.join(" | ")})` : ""}`);
    });
  }
  car.push(`LFA Owner: ${a.lfa_owner ? "Yes" : "No"}`);
  const prev = line("Previous Toyota/Lexus", a.previous_toyota_lexus);
  if (prev) car.push(prev);
  const flipsYN = a.has_flips === true ? "Yes" : a.has_flips === false ? "No" : "";
  const flipText = /^\s*(none|no|n\/?a|nope|0|nothing)\b/i.test(clean(a.recent_flips)) ? "" : clean(a.recent_flips);
  const flips = line("Recent Vehicle Flips", [flipsYN, flipText].filter(has).join(": "));
  if (flips) car.push(flips);
  out.push("", "CAR PROFILE", ...car);

  const buyer = [
    line("Timing", a.timing),
    line("Planned GR GT Use", (a.gt_usage || []).join(", ")),
    line("Spec Consideration", a.spec_consideration),
    line("Intended Use", a.intended_use),
  ].filter(Boolean);
  if (buyer.length) out.push("", "BUYER PROFILE", ...buyer);

  const by = [has(a.interviewed_by) ? `Interviewed by ${clean(a.interviewed_by)}` : null, a.interview_date ? `on ${fmtDate(a.interview_date)}` : null].filter(Boolean).join(" ");
  if (by) out.push("", by);

  return out.filter((l) => l !== null).join("\n");
}

function compactText(a) {
  const g = garageOf(a);
  const s = (v) => clean(v).replace(/\s*\n+\s*/g, "; ");
  const head = [
    `${clean(a.name)}${has(a.age_range) ? ` (${clean(a.age_range)})` : ""}`,
    has(a.preferred_dealer) ? `Dealer: ${s(a.preferred_dealer)}` : null,
    a.vip ? "VIP" : null,
    a.lfa_owner ? "LFA Owner" : null,
  ].filter(Boolean).join(" | ");
  const parts = [head + "."];
  if (has(a.tmna_relationship)) parts.push(`TMNA: ${s(a.tmna_relationship)}.`);
  if (has(a.summary)) parts.push(s(a.summary).replace(/\.?$/, "."));
  const ms = [
    has(a.hpde_level) || has(a.hpde_experience) ? `HPDE: ${[a.hpde_level, s(a.hpde_experience)].filter(has).join(", ")}` : null,
    has(a.race_level) || has(a.race_experience) ? `Racing: ${[a.race_level, s(a.race_experience)].filter(has).join(", ")}` : null,
    has(a.key_events) ? `Events: ${s(a.key_events)}` : null,
    has(a.what_drives_you) ? `Drive: ${s(a.what_drives_you)}` : null,
  ].filter(Boolean);
  if (ms.length) parts.push(`Motorsports: ${ms.join("; ")}.`);
  if (g.length) {
    parts.push(
      `Garage: ${g
        .map((v) => {
          const bits = [];
          if (v.usage && v.usage.length) bits.push(v.usage.join("/"));
          if (Number(v.miles)) bits.push(`${fmtMiles(v.miles)} mi/yr`);
          return `${clean(v.vehicle)}${bits.length ? ` (${bits.join(", ")})` : ""}`;
        })
        .join("; ")}.`
    );
  }
  if (has(a.previous_toyota_lexus)) parts.push(`Prior Toyota/Lexus: ${s(a.previous_toyota_lexus)}.`);
  if (a.has_flips === true || a.has_flips === false || has(a.recent_flips)) parts.push(`Recent flips: ${[a.has_flips === true ? "Yes" : a.has_flips === false ? "No" : "", s(a.recent_flips)].filter(has).join(", ")}.`);
  const buyer = [
    has(a.timing) ? `Timing: ${s(a.timing)}` : null,
    (a.gt_usage || []).length ? `Planned use: ${a.gt_usage.join("/")}` : null,
    has(a.spec_consideration) ? `Spec: ${s(a.spec_consideration)}` : null,
    has(a.intended_use) ? `Intended use: ${s(a.intended_use)}` : null,
  ].filter(Boolean);
  if (buyer.length) parts.push(`Buyer: ${buyer.join("; ")}.`);
  return parts.join(" ").replace(/\.\./g, ".");
}

// ---------------------------------------------------------------
// 2) BIO PERSONA
// Design pending. Build it here once the example layout is provided.
// ---------------------------------------------------------------
