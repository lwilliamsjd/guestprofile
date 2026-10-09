import {
  signIn, signOut, getSession, onAuthChange, getCurrentProfile, setDisplayName, setJobTitle, changePassword,
  listApplicants, getApplicant, createApplicant, updateApplicant, trashApplicant,
  listTrash, restoreApplicant, deleteApplicantForever, subscribeApplicants,
  listTeam, listChanges, addChange, updateChange, markExported, lastExportAt,
  joinPresence, setEditing, leavePresence,
} from "./api.js?v=202610091232";
import {
  USAGE_OPTIONS, HPDE_LEVELS, RACE_LEVELS, LFA_STATUSES, DECISIONS, USAGE_SPLIT, CROSS_STATUSES, TIMING_FLEX, SOCIAL_PLATFORMS,
  escapeHtml, initials, garageOf, totalMiles, fmtDate, profileId, location, lfaStatusOf, rowsOf, usageSplitOf, splitTotal,
  avgOwnership, driverStyleLabel, quarterOptions, quarterKey, linesOf, fmtK,
  buildSummaryText, buildPersonaHtml, CODE_PHRASE, PHRASE_MAX, PERSONA_SUGGESTIONS, isCodePhrase, SHORT_BIO_FITS, shortBio, SPEC_OPTIONS, SPEC_LABELS, specLabel, specText,
} from "./outputs.js?v=202610091232";
import { SUPABASE_URL } from "./config.js?v=202610091232";

const app = document.getElementById("app");

// ---------- icons ----------
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  print: svg('<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  download: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v3h16v-3"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  doc: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  flag: svg('<path d="M4 21V4h11l-1 4h6v9H9l1-4H4"/>'),
  car: svg('<path d="M5 17h14M3 13l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  text: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  star: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  excel: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 8 8 8m0-8-8 8"/>'),
  warn: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  notes: svg('<path d="M5 3h10l4 4v14H5z"/><path d="M8 10h8M8 14h8M8 18h5"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  save: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.2c2.5.2 4.3 1.7 5 4.8"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
};

// ---------- small helpers ----------
let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.innerHTML = `${I.check}<span>${escapeHtml(msg)}</span>`;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
function timeAgo(d) {
  if (!d) return "";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function navigate(h) { window.location.hash = h; }

// ---------- form definition ----------
const AGE_RANGES = ["Under 30", "30s", "40s", "50s", "60s", "70+"];
const ALLOCATION_OPTIONS = ["Pending", ...DECISIONS];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const RACE_SERIES = ["NASA Competition", "NASA Time Trial", "SCCA Regional", "SCCA National", "SCCA Time Trials", "SCCA Solo", "PCA Club Racing", "Porsche Carrera Cup", "GR Cup", "Lucky Dog", "ChampCar", "WRL", "IMSA", "SRO", "Ferrari Challenge", "Lamborghini Super Trofeo"];
const BIO_FITS = 850; // characters of the full Bio that fit the top right of page 1
const COMMON_MAKES = ["Acura","Alfa Romeo","Aston Martin","Audi","Bentley","BMW","Bugatti","Cadillac","Chevrolet","Dodge","Ferrari","Ford","Honda","Hyundai","Jaguar","Jeep","Koenigsegg","Lamborghini","Land Rover","Lexus","Lotus","Lucid","Maserati","Mazda","McLaren","Mercedes Benz","Nissan","Pagani","Porsche","Ram","Rimac","Rivian","Rolls Royce","Subaru","Tesla","Toyota","Volkswagen","Volvo"];

// garage vehicles: Year, Make and Model are entered separately; "vehicle" is the combined name used everywhere else
function composeVehicle(g) {
  return [g.year, g.make, g.model].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
}
function splitVehicle(v) {
  let rest = String(v || "").trim(), year = "", make = "";
  const ym = rest.match(/^'?(\d{4}|\d{2})\s+(.*)$/);
  if (ym) { year = ym[1]; rest = ym[2]; }
  const low = rest.toLowerCase();
  const hit = [...COMMON_MAKES].sort((x, y) => y.length - x.length).find((m) => low.startsWith(m.toLowerCase() + " ") || low === m.toLowerCase() || low.startsWith(m.toLowerCase().replace(" ", "-") + " "));
  if (hit) { make = hit; rest = rest.slice(hit.length).trim(); }
  else {
    const first = low.split(/\s+/)[0];
    const alias = { chevy: "Chevrolet", vw: "Volkswagen", mercedes: "Mercedes Benz", benz: "Mercedes Benz", "mercedes-benz": "Mercedes Benz" }[first];
    if (alias) { make = alias; rest = rest.slice(first.length).trim(); }
    else if (first === "gr") make = "Toyota";
  }
  return { year, make, model: rest };
}

// fields required before a profile can be marked Complete
const REQUIRED_FOR_COMPLETE = [
  ["name", "Name"], ["age_range", "Age Range"], ["state", "State"], ["preferred_dealer", "Preferred Dealer"], ["summary", "Bio"],
  ["hpde_level", "HPDE Level"], ["race_level", "Race Level"], ["garage", "At least one garage vehicle"], ["lfa_status", "LFA Experience"],
  ["has_flips", "Recent flips (Yes or No)"], ["target_quarter", "Target delivery quarter"], ["usage_split", "Intended Usage adding up to 100%"], ["intended_use", "Why the GR GT"],
];
function missingForComplete(a) {
  return REQUIRED_FOR_COMPLETE.filter(([k]) => {
    if (k === "garage") return garageOf(a).length === 0;
    if (k === "usage_split") return splitTotal(a) !== 100;
    if (k === "has_flips") return a.has_flips !== true && a.has_flips !== false;
    return !String(a[k] ?? "").trim();
  }).map(([, label]) => label);
}

// labels used in change history
const FIELD_LABELS = {
  name: "Name", age_range: "Age Range", city: "City", state: "State", preferred_dealer: "Preferred Dealer", social_media: "Social Media (older notes)", socials: "Social Media", tmna_relationship: "TMNA Relationships",
  clubs: "Track and Driving Clubs", vip: "VIP", summary: "Bio", bio_short: "Short Bio",
  persona_left: "Banner Phrase (left)", persona_center: "Banner Phrase (center)", persona_right: "Banner Phrase (right)", code_phrase: "Banner Center Option",
  years_on_track: "Years on Track", track_days: "Track Days", race_series: "Racing Series", driver_style: "Raw Numbers vs Experience", driver_style_note: "Driver Style Note",
  lfa_status: "LFA Experience", lfa_note: "LFA Note", toyota_history: "Toyota / Lexus History", past_cars: "Significant Past Cars",
  usage_split: "Intended Usage", usage_note: "Intended Usage Note", target_quarter: "Target Quarter", timing_flex: "Timing Flexibility", timing_note: "Timing Note",
  spec_tags: "Spec Considerations", cross_shop: "Cross Shopping", concierge_rec: "Concierge Recommendation", assessment: "Concierge Assessment", strengths: "Strengths", concerns: "Flags", hpde_level: "HPDE Level", hpde_experience: "HPDE Experience", race_level: "Race Level", race_experience: "Race Experience",
  key_events: "Key Events", what_drives_you: "What Drives You", garage: "Current Garage",
  previous_toyota_lexus: "Previous Toyota / Lexus", has_flips: "Recent Flips", recent_flips: "Recent Flips Detail", timing: "Timing",
  gt_usage: "Planned GR GT Use", spec_consideration: "Spec Consideration (older notes)", intended_use: "Why the GR GT",
  interviewed_by: "Interviewed By", interview_date: "Interview Date", status: "Status", allocation: "Leadership Decision",
  call_notes: "Call Notes", needs_followup: "Needs Follow Up", followup_note: "Follow Up Note",
};
const LONG_FIELDS = ["call_notes", "followup_note", "summary", "bio_short", "hpde_experience", "race_experience", "key_events", "what_drives_you", "previous_toyota_lexus", "recent_flips", "spec_consideration", "intended_use", "social_media", "tmna_relationship",
  "clubs", "driver_style_note", "lfa_note", "usage_note", "timing_note", "assessment", "strengths", "concerns"];
const JSON_FIELDS = ["socials", "race_series", "toyota_history", "past_cars", "usage_split", "spec_tags", "cross_shop"];
function fmtVal(k, v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "(blank)";
  if (k === "gt_usage") return v.join(", ");
  if (k === "garage") return v.map((g) => g.vehicle).join("; ");
  if (k === "race_series") return v.join(", ");
  return String(v);
}
function diffFields(before, after) {
  const out = [];
  Object.keys(FIELD_LABELS).forEach((k) => {
    if (!(k in after)) return;
    const b = before[k] ?? null, a = after[k] ?? null;
    const norm = (x) => {
      if (BOOL_FIELDS.includes(k)) return JSON.stringify(!!x);
      if (k === "garage" && Array.isArray(x)) x = x.filter((g) => g.vehicle).map((g) => ({ v: (g.vehicle || "").trim(), u: g.usage || [], m: Number(g.miles) || null, a: String(g.acquired || "") || null, n: (g.use_note || "").trim() || null }));
      if (k === "usage_split" && x && typeof x === "object" && !USAGE_SPLIT.some(([s]) => Number(x[s]))) x = null;
      if (NUM_FIELDS.includes(k)) x = x === "" || x == null ? null : Number(x);
      return JSON.stringify(x === "" ? null : Array.isArray(x) && !x.length ? null : x);
    };
    if (norm(b) === norm(a)) return;
    if (LONG_FIELDS.includes(k) || JSON_FIELDS.includes(k) || k === "garage") out.push({ field: FIELD_LABELS[k], note: "edited" });
    else out.push({ field: FIELD_LABELS[k], from: fmtVal(k, b), to: fmtVal(k, a) });
  });
  return out;
}

const SECTIONS = [
  { id: "bio", title: "Bio", icon: I.user, check: (a) => !!(a.name && a.age_range && a.state && a.preferred_dealer && a.summary) },
  { id: "social", title: "Social & Connections", icon: I.users, check: (a) => rowsOf(a.socials, "handle").length > 0 || !!(a.tmna_relationship || a.clubs) },
  { id: "motorsports", title: "Motorsports / Events", icon: I.flag, check: (a) => !!(a.hpde_level && a.race_level) },
  { id: "car", title: "Car Profile", icon: I.car, check: (a) => garageOf(a).length > 0 && !!a.lfa_status },
  { id: "buyer", title: "Buyer Profile", icon: I.target, check: (a) => !!(a.target_quarter && splitTotal(a) === 100 && a.intended_use) },
  { id: "assess", title: "Assessment", icon: I.check, check: (a) => !!(a.concierge_rec && a.assessment) },
];

const TEXT_FIELDS = [
  "name", "age_range", "city", "state", "preferred_dealer", "social_media", "tmna_relationship", "clubs", "summary",
  "hpde_experience", "race_experience", "key_events", "what_drives_you", "driver_style_note",
  "lfa_status", "lfa_note", "previous_toyota_lexus", "recent_flips", "timing", "spec_consideration", "intended_use",
  "usage_note", "target_quarter", "timing_flex", "timing_note", "concierge_rec", "assessment", "strengths", "concerns",
  "interviewed_by", "interview_date", "status", "hpde_level", "race_level", "allocation",
  "call_notes", "followup_note", "bio_short", "persona_left", "persona_center", "persona_right",
];
const NUM_FIELDS = ["years_on_track", "track_days", "driver_style"];
const BOOL_FIELDS = ["vip", "needs_followup", "code_phrase"];

const blankCar = () => ({ year: "", make: "", model: "", vehicle: "", usage: [], miles: "", acquired: "", use_note: "" });
function blankApplicant() {
  return {
    status: "Draft",
    interview_date: todayISO(),
    interviewed_by: currentProfile?.full_name || "",
    name: "", age_range: "", city: "", state: "", preferred_dealer: "", social_media: "", tmna_relationship: "", clubs: "", vip: false,
    summary: "", socials: [{ platform: "Instagram", handle: "", note: "", followers: "" }],
    hpde_experience: "", race_experience: "", key_events: "", what_drives_you: "",
    years_on_track: "", track_days: "", race_series: [], driver_style: null, driver_style_note: "",
    garage: [blankCar()], lfa_owner: false, lfa_status: "", lfa_note: "", previous_toyota_lexus: "", recent_flips: "",
    toyota_history: [], past_cars: [],
    timing: "", spec_consideration: "", intended_use: "", gt_usage: [],
    usage_split: null, usage_note: "", target_quarter: "", timing_flex: "", timing_note: "", spec_tags: [], cross_shop: [],
    concierge_rec: "", assessment: "", strengths: "", concerns: "",
    hpde_level: "", race_level: "", has_flips: null, allocation: "Pending",
    call_notes: "", needs_followup: false, followup_note: "",
    bio_short: "", persona_left: "", persona_center: "", persona_right: "", code_phrase: false,
  };
}

// ---------- app state ----------
let session = null;
let currentProfile = null;
let renderSeq = 0;
let unsubscribeLive = null;
let dirty = false;
let liveRefresh = null;     // current page's handler for teammate saves
let presenceRefresh = null; // current page's handler for "who has what open"
let editingMap = {};        // applicantId -> [teammate names] with that profile open
let flushHook = null;       // editor: start an autosave before leaving; returns true if it did
let reconnectHook = null;   // editor: called when the connection comes back
let pageCleanup = null;     // current page's teardown (timers, listeners)
let restoreDraftFor = null; // editor: reopen with the unsaved local copy

function buildEditingMap(state) {
  const map = {};
  Object.entries(state || {}).forEach(([userId, metas]) => {
    if (currentProfile && userId === currentProfile.id) return;
    (metas || []).forEach((m) => {
      if (!m.applicant) return;
      (map[m.applicant] = map[m.applicant] || []);
      if (m.name && !map[m.applicant].includes(m.name)) map[m.applicant].push(m.name);
    });
  });
  return map;
}
function editingText(id) {
  const names = editingMap[id] || [];
  if (!names.length) return "";
  return `${names.join(" and ")} ${names.length > 1 ? "are" : "is"} editing`;
}

// ---------- connection banner ----------
const conn = { net: navigator.onLine, realtime: true, fetch: true, rtTimer: null, wasDown: false };
function connDown() { return !!session && (!conn.net || !conn.realtime || !conn.fetch); }
function paintConn() {
  let el = document.getElementById("conn-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "conn-banner";
    el.className = "conn-banner";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  const down = connDown();
  el.innerHTML = `${I.warn}<span><b>Connection lost.</b> Keep this tab open and keep typing. Changes are kept on this computer and save automatically when the connection is back.</span>`;
  el.classList.toggle("show", down);
  if (conn.wasDown && !down) { toast("Back online"); if (reconnectHook) reconnectHook(); }
  conn.wasDown = down;
}
window.addEventListener("online", () => { conn.net = true; conn.fetch = true; paintConn(); });
window.addEventListener("offline", () => { conn.net = false; paintConn(); });
function realtimeStatus(status) {
  clearTimeout(conn.rtTimer);
  if (status === "SUBSCRIBED") { conn.realtime = true; paintConn(); return; }
  if (!session) return;
  // give the live connection a few seconds to recover before warning
  if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) conn.rtTimer = setTimeout(() => { conn.realtime = false; paintConn(); }, 4000);
}
function noteFetchResult(ok, err) {
  if (ok) { if (!conn.fetch) { conn.fetch = true; paintConn(); } return; }
  if (err && /fetch|network|load failed/i.test(err.message || String(err))) { conn.fetch = false; paintConn(); }
}
setInterval(() => { if (!conn.fetch && navigator.onLine) { conn.fetch = true; paintConn(); } }, 20000);

window.addEventListener("beforeunload", (e) => {
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});

function parseRoute() {
  const parts = (window.location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "login") return { name: "login" };
  if (parts[0] === "new") return { name: "editor", id: null };
  if (parts[0] === "p" && parts[1] && parts[2] === "outputs") return { name: "outputs", id: parts[1] };
  if (parts[0] === "p" && parts[1]) return { name: "editor", id: parts[1] };
  if (parts[0] === "account") return { name: "account" };
  if (parts[0] === "analytics") return { name: "analytics" };
  return { name: "list" };
}

let lastHash = window.location.hash;
window.addEventListener("hashchange", () => {
  if (dirty && flushHook && flushHook()) { dirty = false; }
  if (dirty && !confirm("You have unsaved changes on this profile. Leave anyway? (A local copy is kept and offered next time you open it.)")) {
    history.replaceState(null, "", lastHash);
    return;
  }
  dirty = false;
  lastHash = window.location.hash;
  render();
});

async function render() {
  const seq = ++renderSeq;
  if (pageCleanup) { pageCleanup(); pageCleanup = null; }
  liveRefresh = null;
  presenceRefresh = null;
  flushHook = null;
  reconnectHook = null;
  if (SUPABASE_URL.startsWith("PASTE")) return renderNotConfigured();
  const route = parseRoute();
  if (!session) session = await getSession();
  if (!session && route.name !== "login") return navigate("#/login");
  if (session && route.name === "login") return navigate("#/");
  if (route.name === "login") return renderLogin();
  if (!currentProfile) currentProfile = await getCurrentProfile();
  if (!unsubscribeLive) {
    unsubscribeLive = subscribeApplicants((p) => liveRefresh && liveRefresh(p), realtimeStatus);
    joinPresence(currentProfile, (state) => { editingMap = buildEditingMap(state); if (presenceRefresh) presenceRefresh(); });
  }
  if (route.name !== "editor") setEditing(null);
  if (route.name === "list") return renderList(seq);
  if (route.name === "editor") return renderEditor(route, seq);
  if (route.name === "outputs") return renderOutputs(route, seq);
  if (route.name === "account") return renderAccount(seq);
  if (route.name === "analytics") return renderAnalytics(seq);
}

// Deferred with setTimeout: running Supabase calls inside the auth callback
// deadlocks supabase-js's auth lock, which shows up as pages that never load.
onAuthChange((s) => setTimeout(() => handleAuthChange(s), 0));
function handleAuthChange(s) {
  const was = !!session;
  session = s;
  if (!s) { currentProfile = null; leavePresence(); if (unsubscribeLive) { unsubscribeLive(); unsubscribeLive = null; } paintConn(); }
  if (was !== !!s) render();
}

// ---------- switching to the CRM ----------
try { localStorage.setItem("grc-last-tool", "profiles"); } catch {}
function wireToolSwitch() {
  const link = document.querySelector('.ts-opt[data-tool="crm"]');
  if (!link) return;
  link.addEventListener("click", (e) => {
    try { localStorage.setItem("grc-last-tool", "crm"); } catch {}
    if (!dirty) return;
    // let autosave finish first so nothing typed is lost
    e.preventDefault();
    const started = flushHook ? flushHook() : false;
    const t0 = Date.now();
    const wait = () => {
      if (!dirty || !started || Date.now() - t0 > 5000) { window.location.href = link.href; return; }
      setTimeout(wait, 150);
    };
    wait();
  });
}

function shell(active, inner) {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="tool-switch" role="tablist" aria-label="Switch tool">
          <span class="brand-dot"></span>
          <a href="../crm/" class="ts-opt " data-tool="crm" role="tab" aria-selected="false"><span class="ts-long">Concierge </span>CRM</a>
          <a href="../profiles/" class="ts-opt on" data-tool="profiles" role="tab" aria-selected="true"><span class="ts-long">Applicant </span>Profiles</a>
        </div>
        <nav class="nav">
          <a href="#/" class="${active === "list" ? "active" : ""}">Applicants</a>
          <a href="#/new" class="${active === "new" ? "active" : ""}">New Profile</a>
          <a href="#/analytics" class="${active === "analytics" ? "active" : ""}">Analytics</a>
        </nav>
        <div class="user-area">
          <a href="#/account" class="user-chip ${active === "account" ? "active" : ""}" title="Account">
            <span class="user-avatar">${escapeHtml(initials(currentProfile?.full_name))}</span>
            <span class="user-name">${escapeHtml(currentProfile?.full_name || "")}</span>
            ${currentProfile?.is_admin ? `<span class="admin-tag">Admin</span>` : ""}
          </a>
          <button id="logout-btn" class="btn btn-ghost" title="Log out" aria-label="Log out">Log Out</button>
        </div>
      </header>
      <main class="main-content" id="main">${inner}</main>
    </div>`;
  wireToolSwitch();
  document.getElementById("logout-btn").addEventListener("click", async () => {
    if (dirty && !confirm("Unsaved changes will be lost. Log out?")) return;
    dirty = false;
    await signOut();
  });
  return document.getElementById("main");
}

function renderNotConfigured() {
  app.innerHTML = `<div class="login-wrap"><div class="login-card" style="max-width:420px">
    <div class="brand brand-lg"><span class="brand-dot"></span><span>Portal</span></div>
    <p class="login-sub">Not connected to a database yet. Add the Supabase URL and anon key to <b>js/config.js</b> (see README, step 3).</p>
  </div></div>`;
}

// ============================================================
// LOGIN
// ============================================================
function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <form id="login-form" class="login-card">
        <div class="brand brand-lg"><span class="brand-dot"></span><span>Portal</span></div>
        <p class="login-sub">Sign in to continue.</p>
        <label>Email</label>
        <input type="email" id="login-email" required autocomplete="username" />
        <label>Password</label>
        <input type="password" id="login-password" required autocomplete="current-password" />
        <div id="login-error" class="error-text"></div>
        <button type="submit" class="btn btn-primary btn-full">Sign In</button>
      </form>
    </div>`;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const err = document.getElementById("login-error");
    err.textContent = "";
    btn.disabled = true;
    const { error } = await signIn(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value);
    if (error) { err.textContent = error.message; btn.disabled = false; }
  });
}

// ============================================================
// LIST
// ============================================================
const listState = Object.assign({ q: "", status: "", dealer: "", flag: "", alloc: "", sort: "updated_at", dir: "desc" }, store.get("gtap-list") || {});

async function renderList(seq) {
  const main = shell("list", `<div class="loading">Loading applicants…</div>`);
  let rows;
  try { rows = await listApplicants(); } catch (e) { main.innerHTML = `<div class="banner error">${escapeHtml(e.message)}</div>`; return; }
  if (seq !== renderSeq) return;
  liveRefresh = async () => {
    // don't redraw while someone is typing in the search box
    if (document.activeElement && document.activeElement.id === "q") return;
    try { rows = await listApplicants(); draw(); } catch {}
  };
  presenceRefresh = () => main.querySelectorAll("[data-ed]").forEach((el) => { el.textContent = editingText(el.dataset.ed); });

  const dealers = [...new Set(rows.map((r) => (r.preferred_dealer || "").trim()).filter(Boolean))].sort();
  let backupNote = "";
  if (currentProfile?.is_admin && rows.length) {
    const last = await lastExportAt();
    if (seq !== renderSeq) return;
    const days = last ? Math.floor((Date.now() - new Date(last.last_export_at).getTime()) / 86400000) : null;
    if (days === null || days >= 14) {
      backupNote = `<div class="banner"><span>${days === null ? "No Excel backup has been exported yet." : `Last Excel backup was ${days} days ago${last.full_name ? ` (by ${escapeHtml(last.full_name)})` : ""}.`} Export one to keep an offline copy.</span><button class="btn btn-primary" id="backup-btn">${I.excel}Export now</button></div>`;
    }
  }

  function filtered() {
    const q = listState.q.toLowerCase();
    let out = rows.filter((r) => {
      if (listState.status && r.status !== listState.status) return false;
      if (listState.dealer && (r.preferred_dealer || "").trim() !== listState.dealer) return false;
      if (listState.alloc && (r.allocation || "Pending") !== listState.alloc) return false;
      if (listState.flag === "vip" && !r.vip) return false;
      if (listState.flag === "lfa" && lfaStatusOf(r) !== "Owned") return false;
      if (listState.flag === "followup" && !r.needs_followup) return false;
      if (q) {
        const hay = [profileId(r), r.name, r.city, r.state, r.preferred_dealer, r.summary, r.interviewed_by, r.social_media, r.tmna_relationship, ...garageOf(r).map((g) => g.vehicle)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const k = listState.sort, dir = listState.dir === "asc" ? 1 : -1;
    const val = (r) => (k === "garage" ? garageOf(r).length : k === "miles" ? totalMiles(r) : k === "profile_no" ? Number(r.profile_no) || 0 : k === "timing" ? quarterKey(r.target_quarter) ?? 1e9 : (r[k] || "").toString().toLowerCase());
    out.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
    return out;
  }

  function kpi(label, num, key, val) {
    const on = listState[key] === val && val !== "";
    return `<button class="kpi ${on ? "active" : ""}" data-k="${key}" data-v="${val}"><span class="kpi-num">${num}</span><span class="kpi-label">${label}</span></button>`;
  }
  function th(label, key) {
    const on = listState.sort === key;
    return `<th data-sort="${key}">${label}<span class="sort-ic ${on ? "on" : ""}">${on ? (listState.dir === "asc" ? "▲" : "▼") : "▼"}</span></th>`;
  }

  function draw() {
    store.set("gtap-list", listState);
    const list = filtered();
    main.innerHTML = `
      <div class="page-header">
        <div><h1>Applicants</h1><p class="muted">Interview profiles for GR GT allocation review</p></div>
        <div class="page-actions">
          <button class="btn" id="export-btn">${I.excel}Export Excel</button>
          <a href="#/new" class="btn btn-primary">${I.plus}New Profile</a>
        </div>
      </div>
      ${backupNote}
      <div class="kpi-strip">
        ${kpi("Total", rows.length, "status", "")}
        ${kpi("Complete", rows.filter((r) => r.status === "Complete").length, "status", "Complete")}
        ${kpi("Drafts", rows.filter((r) => r.status === "Draft").length, "status", "Draft")}
        ${kpi("VIP", rows.filter((r) => r.vip).length, "flag", "vip")}
        ${kpi("LFA Owners", rows.filter((r) => lfaStatusOf(r) === "Owned").length, "flag", "lfa")}
        ${kpi("Need Follow Up", rows.filter((r) => r.needs_followup).length, "flag", "followup")}
      </div>
      <div class="filters">
        <label class="search-box">${I.search}<input id="q" placeholder="Search name, ID, state, dealer, vehicle, bio…" value="${escapeHtml(listState.q)}"></label>
        <select id="f-status"><option value="">All statuses</option><option ${listState.status === "Draft" ? "selected" : ""}>Draft</option><option ${listState.status === "Complete" ? "selected" : ""}>Complete</option></select>
        <select id="f-dealer"><option value="">All dealers</option>${dealers.map((d) => `<option ${listState.dealer === d ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")}</select>
        <select id="f-alloc"><option value="">Any outcome</option>${ALLOCATION_OPTIONS.map((o) => `<option ${listState.alloc === o ? "selected" : ""}>${o}</option>`).join("")}</select>
        <select id="f-flag"><option value="">Any flags</option><option value="vip" ${listState.flag === "vip" ? "selected" : ""}>VIP only</option><option value="lfa" ${listState.flag === "lfa" ? "selected" : ""}>LFA owners only</option><option value="followup" ${listState.flag === "followup" ? "selected" : ""}>Needs follow up</option></select>
      </div>
      <div class="table-wrap">
        ${list.length ? `<table class="crm-table">
          <thead><tr>${th("ID", "profile_no")}${th("Applicant", "name")}${th("Preferred Dealer", "preferred_dealer")}${th("Garage", "garage")}${th("Timing", "timing")}<th>Flags</th>${th("Status", "status")}${th("Outcome", "allocation")}${th("Interviewed By", "interviewed_by")}${th("Updated", "updated_at")}</tr></thead>
          <tbody>${list.map((r) => `
            <tr class="clickable-row" data-id="${r.id}">
              <td><span class="muted" style="font-size:12px;white-space:nowrap">${escapeHtml(profileId(r))}</span></td>
              <td><div class="cell-name">${escapeHtml(r.name)}</div><div class="cell-sub muted">${escapeHtml([r.age_range, location(r)].filter(Boolean).join(" · "))}</div><div class="editing-note" data-ed="${r.id}">${escapeHtml(editingText(r.id))}</div></td>
              <td>${escapeHtml(r.preferred_dealer || "")}</td>
              <td>${garageOf(r).length}<div class="cell-sub muted">${totalMiles(r) ? totalMiles(r).toLocaleString() + " mi/yr" : ""}</div></td>
              <td>${escapeHtml(r.target_quarter || r.timing || "")}</td>
              <td><div class="pill-row">${r.vip ? `<span class="pill pill-vip">${I.star}VIP</span>` : ""}${lfaStatusOf(r) === "Owned" ? `<span class="pill pill-lfa">LFA</span>` : ""}${r.needs_followup ? `<span class="pill pill-followup" title="${escapeHtml(r.followup_note || "Needs another call")}">${I.phone}Follow up</span>` : ""}</div></td>
              <td><span class="pill pill-${r.status.toLowerCase()}">${r.status}</span></td>
              <td><span class="pill pill-alloc-${(r.allocation || "Pending").toLowerCase()}">${escapeHtml(r.allocation || "Pending")}</span></td>
              <td>${escapeHtml(r.interviewed_by || "")}<div class="cell-sub muted">${r.interview_date ? fmtDate(r.interview_date) : ""}</div></td>
              <td><span class="muted" style="font-size:13px">${timeAgo(r.updated_at)}</span></td>
            </tr>`).join("")}</tbody></table>`
          : `<div class="empty-state">${rows.length ? "No applicants match these filters." : "No profiles yet. Start one with <b>New Profile</b> when you get an applicant on the phone."}</div>`}
      </div>`;

    const q = main.querySelector("#q");
    q.addEventListener("input", () => { listState.q = q.value; const pos = q.selectionStart; draw(); const n = main.querySelector("#q"); n.focus(); n.setSelectionRange(pos, pos); });
    main.querySelector("#f-status").addEventListener("change", (e) => { listState.status = e.target.value; draw(); });
    main.querySelector("#f-dealer").addEventListener("change", (e) => { listState.dealer = e.target.value; draw(); });
    main.querySelector("#f-flag").addEventListener("change", (e) => { listState.flag = e.target.value; draw(); });
    main.querySelector("#f-alloc").addEventListener("change", (e) => { listState.alloc = e.target.value; draw(); });
    main.querySelectorAll(".kpi").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.k, v = b.dataset.v;
      if (v === "") { listState.status = ""; listState.flag = ""; }
      else listState[k] = listState[k] === v ? "" : v;
      draw();
    }));
    main.querySelectorAll("th[data-sort]").forEach((t) => t.addEventListener("click", () => {
      const k = t.dataset.sort;
      if (listState.sort === k) listState.dir = listState.dir === "asc" ? "desc" : "asc";
      else { listState.sort = k; listState.dir = k === "updated_at" ? "desc" : "asc"; }
      draw();
    }));
    main.querySelectorAll(".clickable-row").forEach((tr) => tr.addEventListener("click", () => navigate(`#/p/${tr.dataset.id}`)));
    main.querySelector("#export-btn").addEventListener("click", () => exportExcel(filtered()));
    const bb = main.querySelector("#backup-btn");
    if (bb) bb.addEventListener("click", () => { exportExcel(rows); backupNote = ""; draw(); });
  }
  draw();
}

function exportExcel(rows) {
  if (!window.XLSX) return alert("Excel library didn't load. Check your connection and try again.");
  const wb = XLSX.utils.book_new();
  appendApplicantSheets(wb, rows);
  XLSX.writeFile(wb, `GR GT Applicants ${todayISO()}.xlsx`, { cellDates: true });
  markExported();
}

function appendApplicantSheets(wb, rows) {
  const hist = (list) => rowsOf(list, "model").map((h) => `${[h.year, h.model].filter(Boolean).join(" ")}${Number(h.held) ? ` (${h.held}y)` : ""}${h.note ? `: ${h.note}` : ""}`).join("; ");
  const people = rows.map((r) => {
    const u = usageSplitOf(r) || {};
    return {
    "Profile ID": profileId(r), Name: r.name, Status: r.status, "Age Range": r.age_range, City: r.city, State: r.state, "Preferred Dealer": r.preferred_dealer,
    VIP: r.vip ? "Yes" : "No", "LFA Experience": lfaStatusOf(r), "LFA Note": r.lfa_note,
    "Social Media": rowsOf(r.socials, "handle").map((x) => `${x.platform || ""} ${x.handle}${Number(x.followers) ? ` (${fmtK(x.followers)})` : ""}`.trim()).join("; ") || r.social_media,
    "TMNA Relationships": linesOf(r.tmna_relationship).join("; "), "Clubs": linesOf(r.clubs).join("; "), Bio: r.summary, "What Drives Them": r.what_drives_you,
    "HPDE Level": r.hpde_level, "HPDE Details": r.hpde_experience, "Race Level": r.race_level, "Racing Series": (r.race_series || []).join(", "), "Race Details": r.race_experience,
    "Years on Track": r.years_on_track ?? null, "Track Days": r.track_days ?? null, "Key Events": linesOf(r.key_events).join("; "),
    "Driver Style (0 numbers, 100 experience)": r.driver_style ?? null, "Driver Style Note": r.driver_style_note,
    "Vehicles": garageOf(r).length, "Combined Miles/Yr": totalMiles(r), "Avg Ownership (yrs)": avgOwnership(r),
    "Toyota/Lexus History": hist(r.toyota_history) || r.previous_toyota_lexus, "Significant Past Cars": hist(r.past_cars),
    "Recent Flips": r.has_flips === true ? "Yes" : r.has_flips === false ? "No" : "", "Flip Details": r.recent_flips,
    "Why the GR GT": r.intended_use, ...Object.fromEntries(USAGE_SPLIT.map(([k, l]) => [`${l} %`, u[k] ?? null])), "Usage Note": r.usage_note,
    "Target Quarter": r.target_quarter, "Timing Flexibility": r.timing_flex, "Timing Note": r.timing_note, "Timing (older answer)": r.timing,
    "Spec Considerations": specText(r) || r.spec_consideration,
    "Cross Shopping": rowsOf(r.cross_shop, "model").map((c) => `${c.model}${c.status ? ` (${c.status})` : ""}`).join("; "),
    "Concierge Rec": r.concierge_rec, "Assessment": r.assessment, Strengths: linesOf(r.strengths).join("; "), Flags: linesOf(r.concerns).join("; "),
    "Leadership Decision": r.allocation || "Pending", "Needs Follow Up": r.needs_followup ? "Yes" : "No", "Follow Up Note": r.followup_note,
    "Call Notes": r.call_notes, "Interviewed By": r.interviewed_by, "Interview Date": r.interview_date ? new Date(r.interview_date + "T12:00:00") : null,
    "Last Updated": r.updated_at ? new Date(r.updated_at) : null,
  }; });
  const garage = [];
  rows.forEach((r) => garageOf(r).forEach((g) => garage.push({ "Profile ID": profileId(r), Applicant: r.name, Vehicle: g.vehicle, Year: g.year || splitVehicle(g.vehicle).year, Make: g.make || makeOf(g.vehicle), Model: g.model || splitVehicle(g.vehicle).model, Usage: (g.usage || []).join(", "), "Miles/Yr": Number(g.miles) || null, "Year Acquired": g.acquired || null, "How It's Used": g.use_note || "" })));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(people, { cellDates: true }), "Applicants");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(garage), "Garages");
}

// ============================================================
// EDITOR (the interview form)
// ============================================================
async function renderEditor(route, seq) {
  let isNew = !route.id;
  const main = shell(isNew ? "new" : "list", `<div class="loading">Loading profile…</div>`);
  main.classList.add("wide");
  let record = null;
  if (!isNew) {
    try { record = await getApplicant(route.id); } catch (e) { main.innerHTML = `<div class="banner error">Couldn't load this profile: ${escapeHtml(e.message)}</div>`; return; }
    if (seq !== renderSeq) return;
  }
  const [team, others] = await Promise.all([listTeam(), listApplicants().catch(() => [])]);
  if (seq !== renderSeq) return;
  const changes = record ? await listChanges(record.id) : [];
  if (seq !== renderSeq) return;
  const dealerNames = [...new Set(others.map((o) => (o.preferred_dealer || "").trim()).filter(Boolean))].sort();
  let draftKey = `gtap-draft-${route.id || "new"}`;
  let edDirty = false; // this page's own flag; the global one only tracks the page on screen
  const setDirty = (v) => { edDirty = v; if (seq === renderSeq) dirty = v; };
  if (record) setEditing(record.id);
  const notesOpen = store.get("gtap-notes-open") !== false;
  const localDraft = store.get(draftKey);
  const restoring = restoreDraftFor === draftKey && localDraft;
  restoreDraftFor = null;
  let a = restoring ? Object.assign({}, localDraft.data, record ? { id: record.id, updated_at: record.updated_at } : {})
    : record ? JSON.parse(JSON.stringify(record)) : blankApplicant();
  if (!Array.isArray(a.garage) || !a.garage.length) a.garage = [blankCar()];
  a.garage.forEach((g) => {
    if (g.vehicle && !g.model && !g.year) {
      const p = splitVehicle(g.vehicle);
      g.year = p.year; g.model = p.model; g.make = g.make || p.make;
    }
  });
  ["socials", "race_series", "toyota_history", "past_cars", "spec_tags", "cross_shop"].forEach((k) => { if (!Array.isArray(a[k])) a[k] = []; });
  if (!a.socials.length) a.socials.push({ platform: "Instagram", handle: "", note: "", followers: "" });
  if (!a.allocation) a.allocation = "Pending";
  if (!a.lfa_status && a.lfa_owner) a.lfa_status = "Owned";

  const draftIsNewer = !restoring && localDraft && (!record || new Date(localDraft.savedAt) > new Date(record.updated_at));

  const field = (key, label, opts = {}) => {
    const v = a[key] ?? "";
    const hint = opts.hint ? ` <span class="hint">${opts.hint}</span>` : "";
    let input;
    if (opts.type === "textarea") input = `<textarea data-f="${key}" rows="${opts.rows || 3}" placeholder="${opts.ph || ""}">${escapeHtml(v)}</textarea>`;
    else if (opts.type === "select") {
      const optsList = v && !opts.options.includes(v) ? [...opts.options, v] : opts.options;
      input = `<select data-f="${key}">${opts.noBlank ? "" : `<option value=""></option>`}${optsList.map((o) => `<option ${o === v ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`;
    }
    else input = `<input type="${opts.type || "text"}" data-f="${key}" value="${escapeHtml(v)}" placeholder="${opts.ph || ""}" ${opts.list ? `list="${opts.list}"` : ""} ${opts.min != null ? `min="${opts.min}"` : ""} ${opts.step ? `step="${opts.step}"` : ""} ${opts.max ? `maxlength="${opts.max}"` : ""} autocomplete="off">`;
    return `<div class="form-field ${opts.span ? "span-2" : ""}"><label>${label}${hint}</label>${input}${opts.after || ""}</div>`;
  };
  const toggle = (key, label, sub) => `
    <label class="toggle-card ${a[key] ? "on" : ""}" data-toggle="${key}">
      <input type="checkbox" data-f="${key}" ${a[key] ? "checked" : ""}>
      <span class="tc-box">${I.check}</span>
      <span><div class="tc-label">${label}</div><div class="tc-sub">${sub}</div></span>
    </label>`;
  // an older free text answer, shown only when there is one, so nothing already typed is lost
  const legacy = (key, label) => (String(a[key] ?? "").trim() ? field(key, label, { type: "textarea", rows: 2, span: true, hint: "(from before this section changed; move it into the fields above, then clear it)" }) : "");

  // ----- repeating rows (social media, car history, cross shopping) -----
  const ROW_DEFS = {
    socials: { blank: () => ({ platform: "Instagram", handle: "", note: "", followers: "" }), add: "Add account", cols: [
      { k: "platform", type: "select", options: SOCIAL_PLATFORMS, w: "130px" },
      { k: "handle", ph: "@handle or channel name", w: "1fr" },
      { k: "note", ph: "What they post, e.g. Track days, builds", w: "1.3fr" },
      { k: "followers", type: "number", ph: "Followers", w: "110px" },
    ] },
    toyota_history: { blank: () => ({ year: "", model: "", held: "", note: "" }), add: "Add Toyota or Lexus", cols: [
      { k: "year", ph: "Year", w: "70px", num: true },
      { k: "model", ph: "Model, e.g. Lexus IS F", w: "1.2fr" },
      { k: "held", type: "number", ph: "Years held", w: "100px" },
      { k: "note", ph: "Note, e.g. Traded for the 6MT", w: "1fr" },
    ] },
    past_cars: { blank: () => ({ year: "", model: "", held: "", note: "" }), add: "Add past car", cols: [
      { k: "year", ph: "Year", w: "70px", num: true },
      { k: "model", ph: "Make and model, e.g. BMW M3 (E92)", w: "1.2fr" },
      { k: "held", type: "number", ph: "Years held", w: "100px" },
      { k: "note", ph: "Note", w: "1fr" },
    ] },
    cross_shop: { blank: () => ({ model: "", status: "", note: "" }), add: "Add a car they're considering", cols: [
      { k: "model", ph: "Model, e.g. Porsche 911 GT3", w: "1.3fr" },
      { k: "status", type: "select", options: CROSS_STATUSES, w: "140px" },
      { k: "note", ph: "Note, e.g. Keeping it", w: "1fr" },
    ] },
  };
  const rowsBlock = (key) => `<div class="rows-ed" data-rows="${key}"></div><button type="button" class="btn btn-sm" data-add-row="${key}">${I.plus}${ROW_DEFS[key].add}</button>`;
  function drawRows(key) {
    const def = ROW_DEFS[key];
    const box = main.querySelector(`[data-rows="${key}"]`);
    if (!box) return;
    const tpl = `${def.cols.map((c) => c.w).join(" ")} 32px`;
    box.innerHTML = a[key].map((r, i) => `
      <div class="row-ed" data-i="${i}" style="grid-template-columns:${tpl}">
        ${def.cols.map((c) => c.type === "select"
          ? `<select data-rc="${c.k}"><option value=""></option>${c.options.map((o) => `<option ${r[c.k] === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`
          : `<input data-rc="${c.k}" ${c.type === "number" ? `type="number" min="0"` : ""} ${c.num ? `inputmode="numeric" maxlength="4"` : ""} value="${escapeHtml(r[c.k] ?? "")}" placeholder="${c.ph || ""}">`).join("")}
        <button type="button" class="icon-btn" data-rm-row title="Remove">${I.trash}</button>
      </div>`).join("");
  }
  function onRowInput(e) {
    const el = e.target.closest("[data-rc]"); if (!el) return false;
    const box = el.closest("[data-rows]"), row = el.closest(".row-ed");
    const key = box.dataset.rows, k = el.dataset.rc;
    const col = ROW_DEFS[key].cols.find((c) => c.k === k);
    let v = el.value;
    if (col.num) { v = v.replace(/[^0-9]/g, "").slice(0, 4); if (el.value !== v) el.value = v; }
    a[key][+row.dataset.i][k] = col.type === "number" ? (v === "" ? "" : Number(v)) : v;
    updateProgress(); markDirty();
    return true;
  }

  // ----- tags (racing series, spec considerations) -----
  const tagBlock = (key, ph, list) => `<div class="tag-ed" data-tags="${key}"><div class="tag-list"></div><input class="tag-in" placeholder="${ph}" ${list ? `list="${list}"` : ""}></div>`;
  const tagLabel = (key, t) => (key === "spec_tags" ? t.label : t);
  function drawTags(key) {
    const box = main.querySelector(`[data-tags="${key}"] .tag-list`);
    if (!box) return;
    box.innerHTML = a[key].map((t, i) => `<span class="tag-chip ${key === "spec_tags" && t.priority ? "pri" : ""}" data-i="${i}">${key === "spec_tags" ? `<button type="button" class="tag-star" data-star title="Mark as their priority">${I.star}</button>` : ""}${escapeHtml(tagLabel(key, t))}<button type="button" class="tag-x" data-untag title="Remove">✕</button></span>`).join("");
  }
  function addTag(key, raw) {
    const v = raw.trim(); if (!v) return;
    if (a[key].some((t) => tagLabel(key, t).toLowerCase() === v.toLowerCase())) return;
    a[key].push(key === "spec_tags" ? { label: v, priority: false } : v);
    drawTags(key); markDirty();
  }

  // ----- spec considerations checklist -----
  const specOn = (l) => a.spec_tags.some((t) => t.label === l);
  const specBox = (l, text) => `<label class="spec-opt ${specOn(l) ? "on" : ""}"><input type="checkbox" data-spec="${escapeHtml(l)}" ${specOn(l) ? "checked" : ""}><span class="spec-box">${I.check}</span>${escapeHtml(text)}</label>`;
  // display layout: interior choices share one card
  const SPEC_CARDS = [
    { title: "Color", cats: ["Color"], cls: "full" },
    { title: "Wheels", cats: ["Wheels"] },
    { title: "Brakes", cats: ["Brakes"] },
    { title: "Interior", cats: ["Interior Color", "Interior Material", "Seat Type"], names: ["Color", "Material", "Seat"], cls: "tall" },
    { title: "Exhaust", cats: ["Exhaust"] },
    { title: "Accessories", cats: ["Accessories"] },
  ];
  const specCount = (cats) => a.spec_tags.filter((t) => SPEC_LABELS.includes(t.label) && cats.some((c) => t.label.startsWith(c + ": "))).length;
  const specBlock = () => `<div class="spec-grid">${SPEC_CARDS.map((card) => `
      <div class="spec-card ${card.cls || ""}" data-spec-cat="${card.cats.join("|")}">
        <div class="spec-head"><span>${card.title}</span><em>${specCount(card.cats) || ""}</em></div>
        ${card.cats.map((c, ci) => SPEC_OPTIONS.find(([n]) => n === c)[1].map(([sub, opts]) => {
          const name = sub || (card.names ? card.names[ci] : "");
          return `<div class="spec-sub">${name ? `<div class="spec-sub-name">${name}</div>` : ""}<div class="spec-pills">${opts.map((o) => specBox(specLabel(c, sub, o), o)).join("")}</div></div>`;
        }).join("")).join("")}
      </div>`).join("")}
      <div id="spec-old"></div></div>`;
  function drawSpecOld() {
    const box = main.querySelector("#spec-old"); if (!box) return;
    const old = a.spec_tags.map((t, i) => [t, i]).filter(([t]) => !SPEC_LABELS.includes(t.label));
    box.innerHTML = old.length ? `<div class="spec-card"><div class="spec-head"><span>Older entries</span></div><div class="spec-pills">${old.map(([t, i]) => `<span class="tag-chip" data-spec-i="${i}">${escapeHtml(t.label)}<button type="button" class="tag-x" data-spec-rm title="Remove">✕</button></span>`).join("")}</div></div>` : "";
  }

  // ----- intended usage split -----
  const splitBlock = () => `
    <div class="split-ed">${USAGE_SPLIT.map(([k, l]) => `<label class="split-in"><span>${l}</span><span class="pct-wrap"><input type="number" min="0" max="100" step="5" data-split="${k}" value="${a.usage_split && a.usage_split[k] !== "" && a.usage_split[k] != null ? a.usage_split[k] : ""}" placeholder="0"><i>%</i></span></label>`).join("")}
      <div class="split-total" id="split-total"></div></div>`;
  function paintSplitTotal() {
    const t = splitTotal(a), el = main.querySelector("#split-total");
    if (!el) return;
    el.className = `split-total ${t === 100 ? "ok" : t ? "off" : ""}`;
    el.innerHTML = t === 100 ? `${I.check}Adds up to 100%` : t ? `Total ${t}%, needs to add up to 100%` : "Enter how their time with the car splits, adding up to 100%";
  }

  // ----- driver style slider -----
  const styleSet = () => a.driver_style !== null && a.driver_style !== "" && a.driver_style !== undefined;
  const sliderBlock = () => `
    <div class="style-ed ${styleSet() ? "" : "unset"}" id="style-ed">
      <div class="style-ends"><span>Raw numbers</span><span>Overall experience</span></div>
      <input type="range" min="0" max="100" step="5" id="style-range" value="${styleSet() ? a.driver_style : 50}">
      <div class="style-foot"><b id="style-label">${styleSet() ? driverStyleLabel(a.driver_style) : "Not set yet. Drag the slider to set it."}</b><button type="button" class="btn btn-ghost btn-sm" id="style-clear" ${styleSet() ? "" : "hidden"}>Clear</button></div>
    </div>`;

  const bioCount = () => { const n = (a.summary || "").length; return `${n.toLocaleString()} / ~${BIO_FITS.toLocaleString()} characters fit on the PDF`; };

  main.innerHTML = `
    <datalist id="dealer-list">${dealerNames.map((t) => `<option value="${escapeHtml(t)}">`).join("")}</datalist>
    <datalist id="make-list">${COMMON_MAKES.map((t) => `<option value="${t}">`).join("")}</datalist>
    <datalist id="series-list">${RACE_SERIES.map((t) => `<option value="${t}">`).join("")}</datalist>
    <div class="editor-bar">
      <div class="editor-title">
        <a href="#/" class="back-link">${I.back}Applicants</a>
        <div class="avatar" id="ed-avatar">${escapeHtml(initials(a.name))}</div>
        <div style="min-width:0">
          <div class="editor-name"><span id="ed-name">${escapeHtml(a.name) || "New applicant"}</span><span class="ed-id" id="ed-id">${escapeHtml(profileId(record || {}))}</span></div>
          <div class="save-state ${isNew ? "" : "saved"}" id="save-state"><span class="dot"></span><span>${isNew ? "Not saved yet · autosaves once a name is entered" : `Saved ${timeAgo(record.updated_at)}${record.updated_by_name ? " by " + escapeHtml(record.updated_by_name) : ""}`}</span></div>
          <div class="presence-note" id="presence-note"></div>
        </div>
      </div>
      <div class="page-actions">
        <button type="button" class="btn ${notesOpen ? "on" : ""}" id="notes-toggle" title="Show or hide the call notes panel">${I.notes}Notes</button>
        <div class="form-field" style="margin:0"><select data-f="status" style="padding:8px 10px;font-size:13px">${["Draft", "Complete"].map((s) => `<option ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        ${isNew ? "" : `<a href="#/p/${record.id}/outputs" class="btn" id="outputs-btn">${I.doc}Outputs</a>`}
        <button class="btn btn-primary" id="save-btn">${I.save}Save<span class="muted" style="color:rgba(255,255,255,.65);font-size:11px;margin-left:2px">Ctrl S</span></button>
      </div>
    </div>
    ${draftIsNewer ? `<div class="banner" id="draft-banner"><span>There are unsaved changes to this profile from ${timeAgo(localDraft.savedAt)} on this computer.</span><span class="page-actions"><button class="btn btn-ghost" id="draft-discard">Discard</button><button class="btn btn-primary" id="draft-restore">Restore them</button></span></div>` : ""}
    <div id="team-banner"></div>
    <div id="err-banner"></div>

    <div class="editor-layout ${notesOpen ? "with-notes" : ""}" id="editor-layout">
      <nav class="section-nav" id="section-nav">
        ${SECTIONS.map((s, i) => `<a href="javascript:void 0" data-sec="${s.id}"><span class="sn-num">0${i + 1}</span>${s.title}<span class="sn-done" data-done="${s.id}"></span></a>`).join("")}
        <div class="sep"></div>
        <span id="nav-outputs">${isNew ? `<span class="muted" style="padding:6px 12px;display:block">Save once to unlock the outputs.</span>` : `<a href="#/p/${record.id}/outputs">${I.doc}&nbsp;Outputs</a>`}</span>
      </nav>

      <form id="ed-form" autocomplete="off" onsubmit="return false">
        <section class="form-section" id="sec-bio">
          <header><div><div class="sec-kicker">01</div><h2>${I.user}Bio</h2></div></header>
          <div class="form-grid">
            ${field("name", "Name", { ph: "First and last name" })}
            ${field("age_range", "Age Range", { type: "select", options: AGE_RANGES })}
            ${field("city", "City", { ph: "City only, no street address" })}
            ${field("state", "State", { type: "select", options: US_STATES })}
            ${field("preferred_dealer", "Preferred Dealer", { ph: "Start typing to pick an existing dealer", list: "dealer-list" })}
            <div class="form-field"><label>&nbsp;</label>${toggle("vip", "VIP", "Shows as a VIP badge on the PDF")}</div>
            ${field("summary", "Bio", { type: "textarea", rows: 9, span: true, ph: "Who they are, how they got into driving, their relationship with Toyota and Lexus. Leave a blank line between paragraphs.", after: `<div class="field-foot" id="bio-count">${bioCount()}</div>` })}
            ${field("what_drives_you", "What Drives You", { type: "textarea", rows: 2, span: true, hint: "(in their words; quoted at the top of the PDF)" })}
          </div>
        </section>

        <section class="form-section" id="sec-social">
          <header><div><div class="sec-kicker">02</div><h2>${I.users}Social &amp; Connections</h2></div></header>
          <div class="form-field"><label>Social Media <span class="hint">(follower counts can be filled in after the call; the PDF shows them as of the interview date)</span></label></div>
          ${rowsBlock("socials")}
          <div class="form-grid" style="margin-top:16px">
            ${field("tmna_relationship", "TMC / TMNA Relationships", { type: "textarea", rows: 3, hint: "(one per line)", ph: "Former Tier 1 supplier executive (2014 to 2019)\nLexus Owner Advisory Panel since 2021" })}
            ${field("clubs", "Track & Driving Clubs", { type: "textarea", rows: 3, hint: "(one per line)", ph: "NASA Arizona Region\nPorsche Club of America, Zone 8" })}
            ${legacy("social_media", "Social Media notes")}
          </div>
        </section>

        <section class="form-section" id="sec-motorsports">
          <header><div><div class="sec-kicker">03</div><h2>${I.flag}Motorsports / Events Profile</h2></div></header>
          <div class="form-grid">
            ${field("hpde_level", "HPDE Level", { type: "select", options: HPDE_LEVELS })}
            ${field("race_level", "Race Level", { type: "select", options: RACE_LEVELS })}
            ${field("years_on_track", "Years on Track", { type: "number", min: 0, step: "1" })}
            ${field("track_days", "Total Track Days", { type: "number", min: 0, step: "1", hint: "(best estimate)" })}
            ${field("hpde_experience", "HPDE Details", { type: "textarea", ph: "Tracks, how often, run group, instructor certifications" })}
            <div class="form-field"><label>Racing Series <span class="hint">(type and press Enter)</span></label>${tagBlock("race_series", "e.g. NASA Competition", "series-list")}</div>
            ${field("race_experience", "Race Details", { type: "textarea", span: true, ph: "Series, license, results" })}
            ${field("key_events", "Key Motorsports Events Attended", { type: "textarea", span: true, hint: "(one per line)", ph: "Rolex 24 at Daytona\nMonterey Car Week" })}
            <div class="form-field span-2"><label>Raw Numbers vs. Overall Experience <span class="hint">(what matters more to them in a car)</span></label>${sliderBlock()}</div>
            ${field("driver_style_note", "Driver Style Note", { type: "textarea", rows: 2, span: true, ph: "Reads spec sheets but rarely quotes them. Values steering feel over peak horsepower." })}
          </div>
        </section>

        <section class="form-section" id="sec-car">
          <header><div><div class="sec-kicker">04</div><h2>${I.car}Car Profile</h2></div><span class="garage-total" id="garage-total"></span></header>
          <div class="form-field"><label>Current Garage <span class="hint">(year acquired is used for average ownership)</span></label></div>
          <div class="garage-list" id="garage-list"></div>
          <button type="button" class="btn" id="add-car">${I.plus}Add vehicle</button>
          <div class="form-grid" style="margin-top:18px">
            ${field("lfa_status", "Previous LFA Experience", { type: "select", options: LFA_STATUSES })}
            ${field("lfa_note", "LFA Note", { type: "textarea", rows: 2, ph: "Drove one at the 2012 Lexus Performance Driving School…" })}
          </div>
          <div class="form-field" style="margin-top:16px"><label>Toyota / Lexus History <span class="hint">(cars they've owned)</span></label></div>
          ${rowsBlock("toyota_history")}
          <div class="form-field" style="margin-top:16px"><label>Significant Past Cars <span class="hint">(other makes worth noting)</span></label></div>
          ${rowsBlock("past_cars")}
          <div class="form-grid" style="margin-top:16px">
            ${legacy("previous_toyota_lexus", "Previous Toyota / Lexus notes")}
            <div class="form-field"><label>Any Recent Vehicle Flips?</label><select data-f="has_flips"><option value=""></option><option value="yes" ${a.has_flips === true ? "selected" : ""}>Yes</option><option value="no" ${a.has_flips === false ? "selected" : ""}>No</option></select></div>
            ${field("recent_flips", "Flip Details", { type: "textarea", rows: 2, ph: "What was bought and resold, and how quickly" })}
          </div>
        </section>

        <section class="form-section" id="sec-buyer">
          <header><div><div class="sec-kicker">05</div><h2>${I.target}Buyer Profile</h2></div></header>
          <div class="form-grid">
            ${field("intended_use", "Why the GR GT", { type: "textarea", rows: 3, span: true, ph: "Why this car, and what they want to do with it" })}
            <div class="form-field span-2"><label>Intended Usage</label>${splitBlock()}</div>
            ${field("usage_note", "Usage Note", { span: true, ph: "One line, e.g. Primarily driven: HPDE and track days, plus long distance GT touring" })}
            ${field("target_quarter", "Target Delivery Quarter", { type: "select", options: quarterOptions() })}
            ${field("timing_flex", "Flexibility", { type: "select", options: TIMING_FLEX })}
            ${field("timing_note", "Timing Note", { type: "textarea", rows: 2, span: true, ph: "Wants delivery before the summer track season…", hint: a.timing ? `(earlier answer: ${escapeHtml(a.timing)})` : "" })}
            <div class="form-field span-2"><label>Spec Considerations <span class="hint">(check everything they're considering)</span></label>${specBlock()}</div>
            ${legacy("spec_consideration", "Spec Consideration notes")}
          </div>
          <div class="form-field" style="margin-top:16px"><label>Cross Shopping</label></div>
          ${rowsBlock("cross_shop")}
        </section>

        <section class="form-section" id="sec-assess">
          <header><div><div class="sec-kicker">06</div><h2>${I.check}Concierge Assessment</h2></div></header>
          <div class="form-grid">
            ${field("concierge_rec", "Concierge Recommendation", { type: "select", options: DECISIONS })}
            <div></div>
            ${field("assessment", "Assessment", { type: "textarea", rows: 3, span: true, ph: "Two or three sentences for leadership on why they're a fit (or not)." })}
            ${field("strengths", "Strengths", { type: "textarea", rows: 3, hint: "(one per line, shown with +)", ph: "Average hold of 4.9 yrs; no sale inside 3 yrs" })}
            ${field("concerns", "Flags", { type: "textarea", rows: 3, hint: "(one per line, shown with !)", ph: "Confirm preferred dealer is GR GT certified" })}
            <div class="span-2 banner-ed">
              <label class="banner-ed-title">PDF Banner Phrases <span class="hint">(three short phrases about them as a buyer, shown in the black banner on page 1)</span></label>
              <div class="banner-ed-grid">
                ${field("persona_left", "Left", { list: "persona-list", max: PHRASE_MAX, ph: "e.g. Track-Proven" , after: `<div class="field-foot" data-count="persona_left"></div>`})}
                ${field("persona_center", "Center", { list: "persona-list", max: PHRASE_MAX, ph: "e.g. Long-Term Owner" , after: `<div class="field-foot" data-count="persona_center"></div>`})}
                ${field("persona_right", "Right", { list: "persona-list", max: PHRASE_MAX, ph: "e.g. Driver, Not a Flipper" , after: `<div class="field-foot" data-count="persona_right"></div>`})}
              </div>
              <div id="persona-warn" class="field-foot over" hidden>“${CODE_PHRASE}” is reserved for the checkbox below and won't print as a typed phrase.</div>
              ${toggle("code_phrase", "Suggested approval", `Prints “${CODE_PHRASE}” in the center of the banner instead of the center phrase`)}
              <datalist id="persona-list">${PERSONA_SUGGESTIONS.map((x) => `<option value="${escapeHtml(x)}">`).join("")}</datalist>
            </div>
          </div>
        </section>

        <section class="form-section" id="sec-meta">
          <header><div><div class="sec-kicker">Interview</div><h2>Call Details &amp; Decision</h2></div></header>
          <div class="form-grid">
            ${field("interviewed_by", "Interviewed By", { type: "select", options: team.map((t) => t.full_name).filter(Boolean) })}
            ${field("interview_date", "Interview Date", { type: "date" })}
            ${field("allocation", "Leadership Decision", { type: "select", options: ALLOCATION_OPTIONS, noBlank: true, hint: "(set once leadership decides)" })}
            <div class="span-2">${toggle("needs_followup", "Needs another call", "Flag this guest for a follow up call")}</div>
            <div class="span-2" id="followup-note-wrap" ${a.needs_followup ? "" : "hidden"}>${field("followup_note", "What to follow up on", { type: "textarea", rows: 2, ph: "What's left to cover, best time to call back…" })}</div>
          </div>
          ${!isNew && currentProfile?.is_admin ? `<div style="margin-top:16px;display:flex;justify-content:flex-end"><button type="button" class="btn btn-danger" id="trash-btn">${I.trash}Move to Trash</button></div>` : ""}
        </section>
        ${isNew ? "" : (() => {
          const entries = changes.filter((c) => (c.changes || []).length);
          const last = entries[0];
          const when = (c) => `${fmtDate(c.changed_at || new Date())} ${new Date(c.changed_at || Date.now()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
          return `<details class="form-section history-box" id="sec-history">
          <summary>
            <div><div class="sec-kicker">Log</div><h2>Change History</h2></div>
            <span class="hist-sum muted">${entries.length ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"} · last by ${escapeHtml(last.changed_by_name || "someone")}, ${when(last)}` : "No changes yet"}</span>
            <span class="hist-chev">${I.back}</span>
          </summary>
          ${entries.length ? `<div class="history">${entries.map((c) => `
            <div class="hist-item">
              <div class="hist-meta"><b>${escapeHtml(c.changed_by_name || "Someone")}</b><span class="muted">${when(c)}</span></div>
              <ul>${(c.changes || []).map((x) => `<li><span class="hist-field">${escapeHtml(x.field)}</span>${x.note ? ` <span class="muted">${escapeHtml(x.note)}</span>` : x.from !== undefined ? ` <span class="hist-from">${escapeHtml(x.from)}</span> → <span class="hist-to">${escapeHtml(x.to)}</span>` : ""}</li>`).join("")}</ul>
            </div>`).join("")}</div>` : `<div class="muted" style="margin-top:12px">No changes recorded yet.</div>`}
        </details>`;
        })()}
      </form>

      <aside class="notes-panel" id="notes-panel">
        <div class="np-head"><h3>${I.notes}Call Notes</h3><button type="button" class="icon-btn" id="notes-close" title="Hide notes">✕</button></div>
        <textarea data-f="call_notes" placeholder="Jot things down while they talk, then sort them into the form after the call.">${escapeHtml(a.call_notes || "")}</textarea>
        <div class="np-foot muted">Saved with the profile. Not included in the summary or PDF.</div>
      </aside>
    </div>`;

  const form = main.querySelector("#ed-form");
  const saveState = main.querySelector("#save-state");

  // ----- garage -----
  function drawGarage() {
    const list = main.querySelector("#garage-list");
    list.innerHTML = a.garage.map((g, i) => `
      <div class="garage-row" data-i="${i}">
        <span class="g-num">${i + 1}</span>
        <div class="g-col">
          <label class="g-f"><span>Year</span><input data-g="year" value="${escapeHtml(g.year ?? "")}" placeholder="e.g. 2024" inputmode="numeric" maxlength="4"></label>
          <label class="g-f"><span>Make</span><input data-g="make" value="${escapeHtml(g.make || "")}" placeholder="e.g. Porsche" list="make-list"></label>
          <label class="g-f"><span>Model</span><input data-g="model" value="${escapeHtml(g.model || "")}" placeholder="e.g. 911 GT3 RS"></label>
        </div>
        <div class="g-col">
          <div class="g-f"><span>Use</span><div class="use-chips">${USAGE_OPTIONS.map((u) => `<button type="button" class="use-chip ${(g.usage || []).includes(u) ? "on" : ""}" data-use="${u}">${u}</button>`).join("")}</div></div>
          <div class="g-pair">
            <label class="g-f"><span>Miles / yr</span><input data-g="miles" type="number" min="0" step="500" value="${escapeHtml(g.miles ?? "")}" placeholder="Miles"></label>
            <label class="g-f"><span>Year acquired</span><input data-g="acquired" value="${escapeHtml(g.acquired ?? "")}" placeholder="e.g. 2021" inputmode="numeric" maxlength="4"></label>
          </div>
          <label class="g-f"><span>How it's used</span><input data-g="use_note" value="${escapeHtml(g.use_note || "")}" placeholder="e.g. Primary track car, about 10 events a year"></label>
        </div>
        <button type="button" class="icon-btn" data-rm title="Remove">${I.trash}</button>
      </div>`).join("");
    updateGarageTotal();
  }
  function updateGarageTotal() {
    const n = garageOf(a).length, m = totalMiles(a), avg = avgOwnership(a);
    main.querySelector("#garage-total").textContent = n ? `${n} vehicle${n === 1 ? "" : "s"}${m ? ` · ${m.toLocaleString()} mi/yr combined` : ""}${avg ? ` · ${avg} yr average ownership` : ""}` : "";
  }
  main.querySelector("#garage-list").addEventListener("input", (e) => {
    const row = e.target.closest(".garage-row"); if (!row) return;
    const g = a.garage[+row.dataset.i];
    const k = e.target.dataset.g;
    if (k === "year" || k === "acquired") {
      g[k] = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
      if (e.target.value !== g[k]) e.target.value = g[k];
    } else if (k === "make" || k === "model" || k === "use_note") g[k] = e.target.value;
    if (k === "year" || k === "make" || k === "model") g.vehicle = composeVehicle(g);
    if (k === "miles") g.miles = e.target.value === "" ? "" : Number(e.target.value);
    updateGarageTotal(); markDirty();
  });
  main.querySelector("#garage-list").addEventListener("click", (e) => {
    const row = e.target.closest(".garage-row"); if (!row) return;
    const i = +row.dataset.i;
    const chip = e.target.closest(".use-chip");
    if (chip) {
      const u = chip.dataset.use, list = a.garage[i].usage || (a.garage[i].usage = []);
      const at = list.indexOf(u);
      at >= 0 ? list.splice(at, 1) : list.push(u);
      list.sort((x, y) => USAGE_OPTIONS.indexOf(x) - USAGE_OPTIONS.indexOf(y));
      chip.classList.toggle("on", at < 0);
      markDirty();
    }
    if (e.target.closest("[data-rm]")) {
      a.garage.splice(i, 1);
      if (!a.garage.length) a.garage.push(blankCar());
      drawGarage(); markDirty();
    }
  });
  main.querySelector("#add-car").addEventListener("click", () => {
    a.garage.push(blankCar());
    drawGarage();
    const rows = main.querySelectorAll(".garage-row");
    rows[rows.length - 1].querySelector("input").focus();
  });
  drawGarage();

  // ----- rows, tags, usage split, slider -----
  Object.keys(ROW_DEFS).forEach(drawRows);
  drawTags("race_series"); drawSpecOld();
  paintSplitTotal();
  main.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-row]");
    if (add) {
      const key = add.dataset.addRow;
      a[key].push(ROW_DEFS[key].blank());
      drawRows(key);
      const rows = main.querySelectorAll(`[data-rows="${key}"] .row-ed`);
      const last = rows[rows.length - 1];
      (last.querySelector("input") || last.querySelector("select")).focus();
      return;
    }
    const rm = e.target.closest("[data-rm-row]");
    if (rm) {
      const key = rm.closest("[data-rows]").dataset.rows;
      a[key].splice(+rm.closest(".row-ed").dataset.i, 1);
      drawRows(key); updateGarageTotal(); updateProgress(); markDirty();
      return;
    }
    const oldSpec = e.target.closest("[data-spec-rm]");
    if (oldSpec) { a.spec_tags.splice(+oldSpec.closest("[data-spec-i]").dataset.specI, 1); drawSpecOld(); markDirty(); return; }
    const chip = e.target.closest(".tag-chip");
    if (chip) {
      const key = chip.closest("[data-tags]").dataset.tags, i = +chip.dataset.i;
      if (e.target.closest("[data-untag]")) { a[key].splice(i, 1); drawTags(key); markDirty(); }
      else if (e.target.closest("[data-star]")) { a[key][i].priority = !a[key][i].priority; drawTags(key); markDirty(); }
      return;
    }
    const tagBox = e.target.closest("[data-tags]");
    if (tagBox) tagBox.querySelector(".tag-in").focus();
  });
  main.addEventListener("keydown", (e) => {
    const inp = e.target.closest(".tag-in"); if (!inp) return;
    const key = inp.closest("[data-tags]").dataset.tags;
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(key, inp.value); inp.value = ""; }
    else if (e.key === "Backspace" && !inp.value && a[key].length) { a[key].pop(); drawTags(key); markDirty(); }
  });
  // picking from the suggestion list, or leaving the box, adds what was typed
  main.addEventListener("change", (e) => {
    const sp = e.target.closest("[data-spec]"); if (!sp) return;
    const l = sp.dataset.spec, at = a.spec_tags.findIndex((t) => t.label === l);
    if (sp.checked && at < 0) a.spec_tags.push({ label: l, priority: false });
    if (!sp.checked && at >= 0) a.spec_tags.splice(at, 1);
    a.spec_tags.sort((x, y) => (SPEC_LABELS.indexOf(x.label) + 1 || 999) - (SPEC_LABELS.indexOf(y.label) + 1 || 999));
    sp.closest(".spec-opt").classList.toggle("on", sp.checked);
    const card = sp.closest("[data-spec-cat]"); card.querySelector(".spec-head em").textContent = specCount(card.dataset.specCat.split("|")) || "";
    drawSpecOld(); updateProgress(); markDirty();
  });
  main.addEventListener("change", (e) => { const inp = e.target.closest(".tag-in"); if (inp && inp.value.trim()) { addTag(inp.closest("[data-tags]").dataset.tags, inp.value); inp.value = ""; } });
  const styleEd = main.querySelector("#style-ed");
  main.querySelector("#style-range").addEventListener("input", (e) => {
    a.driver_style = Number(e.target.value);
    styleEd.classList.remove("unset");
    main.querySelector("#style-label").textContent = driverStyleLabel(a.driver_style);
    main.querySelector("#style-clear").hidden = false;
    markDirty();
  });
  main.querySelector("#style-clear").addEventListener("click", () => {
    a.driver_style = null;
    styleEd.classList.add("unset");
    main.querySelector("#style-range").value = 50;
    main.querySelector("#style-label").textContent = "Not set yet. Drag the slider to set it.";
    main.querySelector("#style-clear").hidden = true;
    markDirty();
  });

  // ----- plain fields -----
  main.addEventListener("input", (e) => {
    if (onRowInput(e)) return;
    const sp = e.target.dataset?.split;
    if (sp) {
      a.usage_split = Object.assign({}, a.usage_split || {});
      a.usage_split[sp] = e.target.value === "" ? "" : Math.max(0, Math.min(100, Number(e.target.value)));
      paintSplitTotal(); markDirty();
      return;
    }
    const k = e.target.dataset?.f;
    if (!k) return;
    if (BOOL_FIELDS.includes(k) || k === "has_flips") return;
    a[k] = e.target.value;
    if (k === "name") {
      main.querySelector("#ed-name").textContent = a.name || "New applicant";
      main.querySelector("#ed-avatar").textContent = initials(a.name);
      e.target.classList.remove("invalid");
    }
    if (k === "summary") main.querySelector("#bio-count").textContent = bioCount();
    if (k.startsWith("persona_")) paintPersona();
    if (k === "summary") main.querySelector("#bio-count").classList.toggle("over", (a.summary || "").length > BIO_FITS);
    markDirty();
  });
  main.addEventListener("change", (e) => {
    if (e.target.closest("[data-rc]")) return;
    const k = e.target.dataset?.f;
    if (!k) return;
    if (k === "has_flips") { a.has_flips = e.target.value === "yes" ? true : e.target.value === "no" ? false : null; markDirty(); return; }
    if (BOOL_FIELDS.includes(k)) {
      a[k] = e.target.checked;
      e.target.closest(".toggle-card").classList.toggle("on", a[k]);
      if (k === "needs_followup") main.querySelector("#followup-note-wrap").hidden = !a[k];
      if (k === "code_phrase") paintPersona();
    } else a[k] = e.target.value;
    markDirty();
  });
  main.querySelector("#bio-count").classList.toggle("over", (a.summary || "").length > BIO_FITS);
  // banner phrases: the center box shows the code phrase while the checkbox is on
  function paintPersona() {
    const center = main.querySelector('[data-f="persona_center"]');
    center.disabled = !!a.code_phrase;
    center.value = a.code_phrase ? CODE_PHRASE : a.persona_center || "";
    center.closest(".form-field").classList.toggle("coded", !!a.code_phrase);
    const bad = ["persona_left", "persona_center", "persona_right"].filter((k) => !(k === "persona_center" && a.code_phrase) && isCodePhrase(a[k]));
    ["persona_left", "persona_center", "persona_right"].forEach((k) => main.querySelector(`[data-f="${k}"]`).classList.toggle("invalid", bad.includes(k)));
    main.querySelector("#persona-warn").hidden = !bad.length;
    ["persona_left", "persona_center", "persona_right"].forEach((k) => {
      const n = k === "persona_center" && a.code_phrase ? CODE_PHRASE.length : (a[k] || "").length;
      const el = main.querySelector(`[data-count="${k}"]`);
      el.textContent = `${n} / ${PHRASE_MAX}`;
      el.classList.toggle("over", n >= PHRASE_MAX);
    });
  }
  paintPersona();

  // ----- section nav: progress + scroll spy -----
  function updateProgress() {
    SECTIONS.forEach((s) => {
      const el = main.querySelector(`[data-done="${s.id}"]`);
      if (el) el.innerHTML = s.check(a) ? I.check : "";
    });
  }
  main.querySelectorAll("[data-sec]").forEach((l) => l.addEventListener("click", () => {
    main.querySelector(`#sec-${l.dataset.sec}`).scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        const id = en.target.id.replace("sec-", "");
        main.querySelectorAll("[data-sec]").forEach((l) => l.classList.toggle("active", l.dataset.sec === id));
      }
    });
  }, { rootMargin: "-140px 0px -60% 0px" });
  main.querySelectorAll(".form-section").forEach((s) => spy.observe(s));
  updateProgress();

  // ----- dirty tracking + local safety copy -----
  let draftTimer, dirtySince = 0, lastEditAt = 0;
  function markDirty() {
    if (!edDirty) dirtySince = Date.now();
    lastEditAt = Date.now();
    setDirty(true);
    saveState.className = "save-state dirty";
    saveState.lastElementChild.textContent = "Unsaved changes";
    updateProgress();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => store.set(draftKey, { savedAt: new Date().toISOString(), data: a }), 400);
  }

  if (draftIsNewer) {
    main.querySelector("#draft-discard").addEventListener("click", () => { store.del(draftKey); main.querySelector("#draft-banner").remove(); });
    main.querySelector("#draft-restore").addEventListener("click", () => { restoreDraftFor = draftKey; render(); });
  }
  if (restoring) markDirty();

  // ----- save (manual, or automatic for Drafts) -----
  const errBanner = main.querySelector("#err-banner");
  const teamBanner = main.querySelector("#team-banner");
  let saving = false, autosavePaused = false, lastSavedAt = record ? new Date(record.updated_at).getTime() : 0, lastSaveWasAuto = false;
  let lastSavedBy = record && record.updated_by_name && record.updated_by !== currentProfile.id ? record.updated_by_name : "";
  // change history: one entry per editing session, updated as saves happen
  let histId = null;
  let histBase = record ? JSON.parse(JSON.stringify(record)) : null;
  let lastSnapshot = histBase;
  const norm = (x) => (x || "").trim().toLowerCase().replace(/\s+/g, " ");
  const findDup = () => (isNew ? others.find((o) => norm(o.name) === norm(a.name)) : null);

  function buildPayload() {
    const payload = {};
    TEXT_FIELDS.forEach((k) => (payload[k] = typeof a[k] === "string" ? a[k].trim() || null : a[k] ?? null));
    payload.status = a.status || "Draft";
    BOOL_FIELDS.forEach((k) => (payload[k] = !!a[k]));
    payload.gt_usage = Array.isArray(a.gt_usage) ? a.gt_usage : [];
    payload.has_flips = a.has_flips === true || a.has_flips === false ? a.has_flips : null;
    payload.allocation = a.allocation || "Pending";
    payload.garage = garageOf(a).map((g) => ({
      year: String(g.year ?? "").trim() || null, make: (g.make || "").trim() || makeOf(g.vehicle) || null, model: (g.model || "").trim() || null,
      vehicle: g.vehicle.trim(), usage: g.usage || [], miles: Number(g.miles) || null,
      acquired: String(g.acquired ?? "").trim() || null, use_note: (g.use_note || "").trim() || null,
    }));
    NUM_FIELDS.forEach((k) => (payload[k] = a[k] === "" || a[k] == null || isNaN(Number(a[k])) ? null : Number(a[k])));
    const trimRows = (list, key, keys) => (list || []).filter((r) => String(r[key] ?? "").trim()).map((r) => Object.fromEntries(keys.map((k) => [k, typeof r[k] === "string" ? r[k].trim() || null : r[k] === "" ? null : r[k] ?? null])));
    payload.socials = trimRows(a.socials, "handle", ["platform", "handle", "note", "followers"]);
    payload.toyota_history = trimRows(a.toyota_history, "model", ["year", "model", "held", "note"]);
    payload.past_cars = trimRows(a.past_cars, "model", ["year", "model", "held", "note"]);
    payload.cross_shop = trimRows(a.cross_shop, "model", ["model", "status", "note"]);
    payload.race_series = (a.race_series || []).filter(Boolean);
    payload.spec_tags = (a.spec_tags || []).filter((t) => t && t.label).map((t) => ({ label: t.label, priority: !!t.priority }));
    const sp = a.usage_split || {};
    payload.usage_split = USAGE_SPLIT.some(([k]) => Number(sp[k])) ? Object.fromEntries(USAGE_SPLIT.map(([k]) => [k, Number(sp[k]) || 0])) : null;
    // kept in step for older reports that only know the Yes/No toggle
    payload.lfa_owner = payload.lfa_status === "Owned";
    return payload;
  }
  function paintSaved() {
    if (edDirty || saving || !lastSavedAt) return;
    saveState.className = "save-state saved";
    saveState.lastElementChild.textContent = `${lastSaveWasAuto ? "Autosaved" : "Saved"} ${timeAgo(lastSavedAt)}${lastSavedBy ? " by " + lastSavedBy : ""}`;
  }
  async function recordHistory(id, payload) {
    const diffs = diffFields(histBase, payload);
    if (histId) {
      if (await updateChange(histId, diffs)) return;
      // the session entry can't be updated any more: start a new one from the last save
      histBase = lastSnapshot; histId = null;
      const fresh = diffFields(histBase, payload);
      if (fresh.length) histId = await addChange(id, fresh, currentProfile);
      return;
    }
    if (diffs.length) histId = await addChange(id, diffs, currentProfile);
  }
  // a brand new profile was just stored: switch this page over without reloading it
  function becameSaved(created) {
    isNew = false;
    record = created;
    a.id = created.id;
    a.updated_at = created.updated_at;
    store.del(draftKey);
    draftKey = `gtap-draft-${created.id}`;
    histBase = JSON.parse(JSON.stringify(created));
    lastSnapshot = histBase;
    if (seq !== renderSeq) return;
    const idEl = main.querySelector("#ed-id");
    if (idEl) idEl.textContent = profileId(created); // they've already moved on to another page
    lastHash = `#/p/${created.id}`;
    history.replaceState(null, "", lastHash);
    setEditing(created.id);
    const bar = main.querySelector(".editor-bar .page-actions");
    if (bar && !main.querySelector("#outputs-btn")) {
      const link = document.createElement("a");
      link.href = `#/p/${created.id}/outputs`; link.className = "btn"; link.id = "outputs-btn";
      link.innerHTML = `${I.doc}Outputs`;
      bar.insertBefore(link, main.querySelector("#save-btn"));
      wireOutputs(link);
    }
    const nav = main.querySelector("#nav-outputs");
    if (nav) nav.innerHTML = `<a href="#/p/${created.id}/outputs">${I.doc}&nbsp;Outputs</a>`;
    const navNew = document.querySelector('.nav a[href="#/new"]');
    if (navNew) navNew.classList.remove("active");
  }

  async function save(opts = {}) {
    const auto = !!opts.auto;
    if (saving) return false;
    if (!auto) errBanner.innerHTML = "";
    if (!(a.name || "").trim()) {
      if (auto) return false;
      const n = main.querySelector('[data-f="name"]');
      n.classList.add("invalid"); n.focus();
      errBanner.innerHTML = `<div class="banner error">Add the applicant's name before saving.</div>`;
      return false;
    }
    const payload = buildPayload();
    if (payload.status === "Complete") {
      if (auto) return false;
      const missing = missingForComplete(a);
      if (missing.length) {
        errBanner.innerHTML = `<div class="banner error"><span><b>Can't mark Complete yet.</b> Still needed: ${missing.map(escapeHtml).join(", ")}. Save as Draft for now, or fill these in.</span></div>`;
        errBanner.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }
    }
    const dup = findDup();
    if (dup) {
      if (auto) return false; // a person should confirm this one
      if (!confirm(`A profile for "${dup.name}" already exists${dup.interviewed_by ? ` (interviewed by ${dup.interviewed_by})` : ""}. Create another one anyway?`)) return false;
    }
    const btn = main.querySelector("#save-btn");
    saving = true;
    btn.disabled = true;
    const editStamp = lastEditAt;
    if (auto) { saveState.className = "save-state dirty"; saveState.lastElementChild.textContent = "Autosaving…"; }
    try {
      if (isNew) {
        const created = await createApplicant(payload, currentProfile);
        await addChange(created.id, [{ field: "Profile", note: "created" }], currentProfile);
        becameSaved(created);
        if (!auto) toast("Profile created");
      } else {
        const saved = await updateApplicant(record.id, payload, currentProfile, record.updated_at);
        await recordHistory(record.id, payload);
        record = saved;
        a.updated_at = saved.updated_at;
        lastSnapshot = JSON.parse(JSON.stringify(saved));
        if (!auto) toast("Saved");
      }
      noteFetchResult(true);
      lastSavedAt = Date.now();
      lastSaveWasAuto = auto;
      lastSavedBy = "";
      // only clear "unsaved" if nothing was typed while the save was in flight
      if (lastEditAt === editStamp) { setDirty(false); store.del(draftKey); }
      if (!auto) teamBanner.innerHTML = "";
      paintSaved();
      return true;
    } catch (e) {
      noteFetchResult(false, e);
      if (e.code === "CONFLICT") {
        autosavePaused = true;
        teamBanner.innerHTML = "";
        errBanner.innerHTML = `<div class="banner error"><span>${escapeHtml(e.message)} Autosave is paused and your changes are kept on this computer.</span><span class="page-actions"><button class="btn" id="conf-reload">Load their version</button><button class="btn btn-danger" id="conf-force">Save mine over it</button></span></div>`;
        errBanner.querySelector("#conf-reload").addEventListener("click", () => reloadFresh(true));
        errBanner.querySelector("#conf-force").addEventListener("click", async () => { record.updated_at = new Date(Date.now() + 60000).toISOString(); autosavePaused = false; await save(); });
      } else if (!auto || conn.fetch) {
        errBanner.innerHTML = `<div class="banner error">Couldn't save: ${escapeHtml(e.message)}. Your changes are kept on this computer${auto ? " and autosave will keep trying" : ""}.</div>`;
      }
      if (auto) { saveState.className = "save-state dirty"; saveState.lastElementChild.textContent = "Unsaved changes"; }
      return false;
    } finally {
      saving = false;
      btn.disabled = false;
      paintSaved();
      if (queued) { queued = false; setTimeout(() => maybeAutosave(true), 0); }
    }
  }

  // ----- autosave: Drafts save themselves every 30 seconds while being edited -----
  const canAutosave = () => edDirty && !saving && !autosavePaused && (a.status || "Draft") === "Draft" && !!(a.name || "").trim() && !findDup();
  let queued = false;
  function maybeAutosave(force) {
    if (force && saving && edDirty) { queued = true; return true; }
    if (!canAutosave()) return false;
    const now = Date.now();
    if (force || now - dirtySince >= 30000 || now - lastEditAt >= 8000) { save({ auto: true }); return true; }
    return false;
  }
  const autoTimer = setInterval(() => { maybeAutosave(false); paintSaved(); }, 4000);
  const onHidden = () => { if (document.visibilityState === "hidden") maybeAutosave(true); };
  document.addEventListener("visibilitychange", onHidden);
  flushHook = () => maybeAutosave(true);
  reconnectHook = () => maybeAutosave(true);

  // ----- teammates -----
  async function reloadFresh(discardMine) {
    if (discardMine) store.del(draftKey);
    setDirty(false);
    const y = window.scrollY;
    await render();
    window.scrollTo(0, y);
  }
  liveRefresh = (p) => {
    const row = p && p.new;
    if (!record || !row || row.id !== record.id) return;
    const mine = row.updated_by ? row.updated_by === currentProfile.id : row.updated_by_name === currentProfile.full_name;
    if (mine || new Date(row.updated_at).getTime() <= new Date(record.updated_at).getTime()) return;
    const who = escapeHtml(row.updated_by_name || "A teammate");
    if (row.deleted_at) {
      autosavePaused = true;
      teamBanner.innerHTML = `<div class="banner error"><span><b>${who}</b> moved this profile to the Trash. Autosave is paused.</span><a class="btn" href="#/">Back to applicants</a></div>`;
      return;
    }
    if (!edDirty && !saving) {
      reloadFresh(false).then(() => toast(`Updated with ${row.updated_by_name || "a teammate"}'s changes`));
      return;
    }
    autosavePaused = true;
    teamBanner.innerHTML = `<div class="banner"><span><b>${who}</b> just saved this profile while you have unsaved changes. Autosave is paused so nothing gets overwritten.</span><span class="page-actions"><button class="btn" id="tb-load">Load their version</button><button class="btn btn-primary" id="tb-keep">Keep mine</button></span></div>`;
    teamBanner.querySelector("#tb-load").addEventListener("click", () => reloadFresh(true));
    teamBanner.querySelector("#tb-keep").addEventListener("click", () => { teamBanner.innerHTML = ""; save(); });
  };
  const presenceNote = main.querySelector("#presence-note");
  presenceRefresh = () => {
    const names = record ? editingMap[record.id] || [] : [];
    presenceNote.innerHTML = names.length ? `<span class="dot-live"></span>${escapeHtml(`${names.join(" and ")} also ${names.length > 1 ? "have" : "has"} this open`)}` : "";
  };
  presenceRefresh();

  // ----- call notes panel -----
  const layout = main.querySelector("#editor-layout");
  const notesBtn = main.querySelector("#notes-toggle");
  function setNotes(open) {
    layout.classList.toggle("with-notes", open);
    notesBtn.classList.toggle("on", open);
    store.set("gtap-notes-open", open);
    if (open) main.querySelector('[data-f="call_notes"]').focus();
  }
  notesBtn.addEventListener("click", () => setNotes(!layout.classList.contains("with-notes")));
  main.querySelector("#notes-close").addEventListener("click", () => setNotes(false));

  main.querySelector("#save-btn").addEventListener("click", () => save());
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setNotes(!layout.classList.contains("with-notes")); }
  };
  document.addEventListener("keydown", onKey);
  const cleanup = () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onHidden);
    clearInterval(autoTimer);
    spy.disconnect();
  };
  pageCleanup = cleanup;

  function wireOutputs(link) {
    link.addEventListener("click", async (e) => {
      if (!edDirty) return;
      e.preventDefault();
      if (await save()) { setDirty(false); navigate(`#/p/${record.id}/outputs`); }
    });
  }
  const outBtn = main.querySelector("#outputs-btn");
  if (outBtn) wireOutputs(outBtn);

  const trashBtn = main.querySelector("#trash-btn");
  if (trashBtn) trashBtn.addEventListener("click", async () => {
    if (!confirm(`Move ${record.name} to the Trash? An admin can restore it from the Account page.`)) return;
    await trashApplicant(record.id);
    setDirty(false); store.del(draftKey);
    toast("Moved to Trash");
    navigate("#/");
  });

  if (isNew && !draftIsNewer) main.querySelector('[data-f="name"]').focus();
}

// ============================================================
// OUTPUTS (text summary + Buyer Profile PDF)
// ============================================================
async function renderOutputs(route, seq) {
  const main = shell("list", `<div class="loading">Building outputs…</div>`);
  main.classList.add("wide");
  let a, team;
  try { [a, team] = await Promise.all([getApplicant(route.id), listTeam()]); } catch (e) { main.innerHTML = `<div class="banner error">${escapeHtml(e.message)}</div>`; return; }
  if (seq !== renderSeq) return;
  let mode = store.get("gtap-textmode") || "full";
  let outputsPhoto = null; // { url }: held only while this page is open, never saved or uploaded
  const preparer = () => {
    const name = a.interviewed_by || currentProfile?.full_name || "";
    const t = team.find((m) => m.full_name === name);
    return { name, title: t ? t.job_title : name === currentProfile?.full_name ? currentProfile.job_title : "" };
  };

  main.innerHTML = `
    <a href="#/p/${a.id}" class="back-link">${I.back}Back to profile</a>
    <div class="page-header" style="margin-top:8px">
      <div><h1>${escapeHtml(a.name)} <span class="muted" style="font-size:14px;font-weight:600">${escapeHtml(profileId(a))}</span></h1><p class="muted">Outputs reflect the last saved version${a.status === "Draft" ? " · <span style='color:var(--amber)'>still marked Draft</span>" : ""}</p></div>
    </div>
    <div class="outputs-grid">
      <div class="out-card sticky">
        <div class="out-head">
          <h2>${I.text}Text Summary</h2>
          <div class="out-toggle"><button data-mode="full">Full</button><button data-mode="compact">Compact</button></div>
        </div>
        <textarea class="out-text" id="out-text" spellcheck="false"></textarea>
        <div class="out-meta"><span class="muted" id="out-count"></span><span class="muted">Editable before copying</span></div>
        <button class="btn btn-primary btn-full" id="copy-btn" style="margin-top:12px">${I.copy}Copy to clipboard</button>
      </div>
      <div class="out-card">
        <div class="out-head">
          <h2>${I.doc}Buyer Profile PDF</h2>
          <div class="page-actions">
            <label class="btn" id="photo-btn" title="Shown on this PDF only. The photo is never saved.">${I.image}<span id="photo-label">${outputsPhoto ? "Change photo" : "Add photo"}</span><input type="file" accept="image/*" id="photo-in" hidden></label>
            <button class="btn btn-ghost" id="photo-rm" ${outputsPhoto ? "" : "hidden"}>Remove photo</button>
            <button class="btn btn-primary" id="pdf-print">${I.print}Print / Save PDF</button>
          </div>
        </div>
        <div class="muted" style="margin:-4px 0 10px">Drop a photo onto the preview to use it. It's only kept until you leave this page and is never stored in the tool. In the print window, choose <b>Save as PDF</b>.</div>
        <div id="fit-warn"></div>
        <div class="pdf-wrap" id="pdf-wrap"><iframe id="pdf-frame" title="Buyer Profile preview"></iframe><div class="pdf-drop" id="pdf-drop">${I.image}<span>Drop the photo here</span></div></div>
      </div>
    </div>`;

  const ta = main.querySelector("#out-text");
  function drawText() {
    ta.value = buildSummaryText(a, mode);
    main.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    count();
  }
  function count() { main.querySelector("#out-count").textContent = `${ta.value.length.toLocaleString()} characters`; }
  ta.addEventListener("input", count);
  main.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; store.set("gtap-textmode", mode); drawText(); }));
  drawText();

  main.querySelector("#copy-btn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(ta.value); }
    catch { ta.select(); document.execCommand("copy"); }
    toast("Summary copied");
  });

  // ----- PDF preview -----
  const frame = main.querySelector("#pdf-frame");
  const wrap = main.querySelector("#pdf-wrap");
  const PAGE_W = 816;
  function fitPreview() {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) return;
    const h = doc.documentElement.scrollHeight;
    const scale = Math.min(1, wrap.clientWidth / PAGE_W);
    frame.style.width = `${PAGE_W}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${scale})`;
    wrap.style.height = `${h * scale}px`;
  }
  function checkFit() {
    const doc = frame.contentDocument;
    const over = [...doc.querySelectorAll(".fit")].filter((el) => el.scrollHeight > el.clientHeight + 2).map((el) => el.dataset.fit);
    const box = main.querySelector("#fit-warn");
    const noBanner = !a.code_phrase && !["persona_left", "persona_center", "persona_right"].some((k) => String(a[k] || "").trim());
    box.innerHTML = (over.length ? `<div class="banner"><span><b>Some text is cut off on the PDF:</b> ${over.map(escapeHtml).join(", ")}. Shorten ${over.length === 1 ? "it" : "them"} on the interview form to fit the two pages.</span></div>` : "")
      + (noBanner ? `<div class="banner"><span><b>The black banner on page 1 is empty.</b> Add the three banner phrases in the Concierge Assessment section of the form.</span></div>` : "");
  }
  function drawPdf() {
    frame.onload = () => {
      const doc = frame.contentDocument;
      const done = () => { if (seq !== renderSeq) return; fitPreview(); checkFit(); };
      done();
      (doc.fonts ? doc.fonts.ready : Promise.resolve()).then(done);
      doc.querySelectorAll("img").forEach((img) => img.addEventListener("load", done));
    };
    frame.srcdoc = buildPersonaHtml(a, { photo: outputsPhoto && outputsPhoto.url, preparer: preparer() });
  }
  drawPdf();
  const onResize = () => fitPreview();
  window.addEventListener("resize", onResize);
  pageCleanup = () => window.removeEventListener("resize", onResize);

  function usePhoto(file) {
    if (!file || !/^image\//.test(file.type)) { if (file) alert("That file isn't an image."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      outputsPhoto = { url: reader.result };
      main.querySelector("#photo-label").textContent = "Change photo";
      main.querySelector("#photo-rm").hidden = false;
      drawPdf();
    };
    reader.readAsDataURL(file);
  }
  main.querySelector("#photo-in").addEventListener("change", (e) => { usePhoto(e.target.files[0]); e.target.value = ""; });
  main.querySelector("#photo-rm").addEventListener("click", () => {
    outputsPhoto = null;
    main.querySelector("#photo-label").textContent = "Add photo";
    main.querySelector("#photo-rm").hidden = true;
    drawPdf();
  });
  // the iframe swallows drag events, so a cover appears over it while a file is dragged in
  const drop = main.querySelector("#pdf-drop");
  let dragDepth = 0;
  const hasFile = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const onDragEnter = (e) => { if (!hasFile(e)) return; dragDepth++; drop.classList.add("show"); };
  const onDragLeave = () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove("show"); };
  const onDragOver = (e) => { if (hasFile(e)) e.preventDefault(); };
  const onDrop = (e) => {
    if (!hasFile(e)) return;
    e.preventDefault();
    dragDepth = 0; drop.classList.remove("show");
    if (e.target.closest && e.target.closest("#pdf-wrap, #pdf-drop, .out-card")) usePhoto(e.dataTransfer.files[0]);
  };
  document.addEventListener("dragenter", onDragEnter);
  document.addEventListener("dragleave", onDragLeave);
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("drop", onDrop);
  pageCleanup = () => {
    window.removeEventListener("resize", onResize);
    document.removeEventListener("dragenter", onDragEnter);
    document.removeEventListener("dragleave", onDragLeave);
    document.removeEventListener("dragover", onDragOver);
    document.removeEventListener("drop", onDrop);
  };

  main.querySelector("#pdf-print").addEventListener("click", () => {
    const t = document.title;
    document.title = frame.contentDocument.title;
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => (document.title = t), 1000);
  });
}

// ============================================================
// ANALYTICS
// ============================================================
const analyticsState = Object.assign({ status: "", vip: false, compare: "lfa" }, store.get("gtap-analytics") || {});
const TWO_WORD_MAKES = ["land rover", "aston martin", "alfa romeo", "rolls royce", "range rover"];
const MAKE_ALIASES = { gr: "Toyota", vw: "Volkswagen", mercedes: "Mercedes Benz", "mercedes-benz": "Mercedes Benz", benz: "Mercedes Benz", chevy: "Chevrolet", mclaren: "McLaren", bmw: "BMW", gmc: "GMC", "rolls-royce": "Rolls Royce", "range rover": "Land Rover" };
function makeOf(vehicle) {
  const v = (vehicle || "").trim().replace(/^'?\d{2,4}\s+/, "").toLowerCase();
  if (!v) return null;
  const two = TWO_WORD_MAKES.find((m) => v.startsWith(m));
  const raw = two || v.split(/\s+/)[0];
  if (MAKE_ALIASES[raw]) return MAKE_ALIASES[raw];
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}
const hasText = (t) => !!(t && String(t).trim());
const isNone = (t) => /^\s*(none|no|nope|n\/?a|0|nothing)\b/i.test(t || "");
// structured answers win; older profiles without them fall back to reading the text
const hasFlips = (r) => (r.has_flips === true || r.has_flips === false ? r.has_flips : hasText(r.recent_flips) && !isNone(r.recent_flips));
const hpde = (r) => (r.hpde_level ? r.hpde_level !== "None" : hasText(r.hpde_experience) && !isNone(r.hpde_experience));
const racer = (r) => (r.race_level ? r.race_level !== "None" : hasText(r.race_experience) && !isNone(r.race_experience));
const makeFor = (g) => (g.make && g.make.trim()) || makeOf(g.vehicle);
const priorToyota = (r) => rowsOf(r.toyota_history, "model").length > 0 || (hasText(r.previous_toyota_lexus) && !isNone(r.previous_toyota_lexus));
// main planned use: the biggest share of the usage split; older profiles fall back to their first use chip
const OLD_USE = { "Track Days": "track", "Weekend Street": "street", "Daily Driver": "street", "Shows & Events": "events", Collection: "collection" };
function primaryUse(r) {
  const u = usageSplitOf(r);
  if (u) return USAGE_SPLIT.reduce((best, [k]) => (u[k] > u[best] ? k : best), USAGE_SPLIT[0][0]);
  const first = (r.gt_usage || []).find((x) => OLD_USE[x]);
  return first ? OLD_USE[first] : null;
}
const quartersOut = (r) => { const q = quarterKey(r.target_quarter); if (q == null) return null; const now = new Date(); return q - (now.getFullYear() * 4 + Math.floor(now.getMonth() / 3)); };
function weekStart(d) {
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

async function renderAnalytics(seq) {
  const main = shell("analytics", `<div class="loading">Crunching numbers…</div>`);
  let all;
  try { all = await listApplicants(); } catch (e) { main.innerHTML = `<div class="banner error">${escapeHtml(e.message)}</div>`; return; }
  if (seq !== renderSeq) return;
  liveRefresh = async () => { try { all = await listApplicants(); draw(); } catch {} };

  let drawer = null; // { title, rows }

  function draw() {
    store.set("gtap-analytics", analyticsState);
    const rows = all.filter((r) => (!analyticsState.status || r.status === analyticsState.status) && (!analyticsState.vip || r.vip));
    const n = rows.length;
    const pct = (k) => (n ? Math.round((k / n) * 100) : 0);
    const groups = {}; // id -> items
    const titles = {}; // id -> card title
    let gid = 0;

    // ---- chart renderers (each registers its items for drill down + Excel) ----
    const PALETTE = ["#e0263f", "#4d8bff", "#b87a0e", "#1f9e8f", "#9b6cff"];
    const NEUTRAL = "#55555d";
    const reg = (title, items) => { const id = `g${gid++}`; groups[id] = items; titles[id] = title; return id; };
    const tip = (it) => `${it.label}: ${it.rows.length} applicant${it.rows.length === 1 ? "" : "s"} (${pct(it.rows.length)}%)`;
    const empty = `<div class="an-empty">Nothing recorded yet</div>`;
    const any = (items) => items.some((i) => i.rows.length);
    const head = (title, note) => `<div class="an-head"><h2>${title}</h2>${note ? `<span class="an-note">${note}</span>` : ""}</div>`;
    const wrap = (cls, title, note, body) => `<div class="an-card ${cls}">${head(title, note)}${body}</div>`;

    // vertical columns, for ordered buckets (age, garage size)
    function columns(title, items, opts = {}) {
      const id = reg(title, items);
      const max = Math.max(1, ...items.map((i) => i.rows.length));
      const body = any(items) ? `<div class="cols">${items.map((it, i) => `
        <button class="col" data-g="${id}" data-i="${i}" ${it.rows.length ? "" : "disabled"} title="${escapeHtml(tip(it))}">
          <span class="col-val">${it.rows.length ? it.rows.length : ""}</span>
          <span class="col-bar-wrap"><span class="col-bar" style="height:${(it.rows.length / max) * 100}%"></span></span>
          <span class="col-label">${escapeHtml(it.label)}</span>
        </button>`).join("")}</div>` : empty;
      return wrap(opts.cls || "", title, opts.note, body);
    }

    // horizontal bars, sorted, top item highlighted (usage lists, makes, dealers)
    function hbars(title, items, opts = {}) {
      const id = reg(title, items);
      const max = Math.max(1, ...items.map((i) => i.rows.length));
      const sorted = items.map((it, i) => ({ it, i })).sort((x, y) => y.it.rows.length - x.it.rows.length);
      const body = any(items) ? `<div class="hbars">${sorted.map(({ it, i }, rank) => `
        <button class="hbar ${rank === 0 && it.rows.length ? "top" : ""}" data-g="${id}" data-i="${i}" ${it.rows.length ? "" : "disabled"} title="${escapeHtml(tip(it))}">
          ${opts.ranked ? `<span class="hbar-rank">${rank + 1}</span>` : ""}
          <span class="hbar-text"><span class="hbar-label">${escapeHtml(it.label)}</span><span class="hbar-num">${it.rows.length}<span class="hbar-pct">${pct(it.rows.length)}%</span></span></span>
          <span class="hbar-track"><span class="hbar-fill" style="width:${(it.rows.length / max) * 100}%"></span></span>
        </button>`).join("")}</div>` : empty;
      return wrap(opts.cls || "", title, opts.note, body);
    }

    // one 100% bar split into parts + legend (motorsports, timing, team)
    function split(title, items, opts = {}) {
      const id = reg(title, items);
      const total = items.reduce((t, i) => t + i.rows.length, 0) || 1;
      const color = (it, i) => it.color || (it.neutral ? NEUTRAL : PALETTE[i % PALETTE.length]);
      const body = any(items) ? `
        <div class="split">${items.map((it, i) => it.rows.length ? `<button class="seg" data-g="${id}" data-i="${i}" style="flex:${it.rows.length};background:${color(it, i)}" title="${escapeHtml(tip(it))}"></button>` : "").join("")}</div>
        <div class="legend">${items.map((it, i) => `
          <button class="leg" data-g="${id}" data-i="${i}" ${it.rows.length ? "" : "disabled"} title="${escapeHtml(tip(it))}">
            <span class="leg-dot" style="background:${color(it, i)}"></span>
            <span class="leg-label">${escapeHtml(it.label)}</span>
            <span class="leg-num">${it.rows.length}</span>
            <span class="leg-pct">${Math.round((it.rows.length / total) * 100)}%</span>
          </button>`).join("")}</div>` : empty;
      return wrap(opts.cls || "", title, opts.note, body);
    }

    // headline number (LFA ownership)
    function hero(title, yes, no, caption, opts = {}) {
      const items = [yes, no];
      const id = reg(title, items);
      const p = pct(yes.rows.length);
      const body = `
        <button class="hero" data-g="${id}" data-i="0" ${yes.rows.length ? "" : "disabled"} title="${escapeHtml(tip(yes))}">
          <span class="hero-num">${p}<small>%</small></span>
          <span class="hero-cap">${caption}<br><b>${yes.rows.length} of ${n}</b> applicants</span>
        </button>
        <div class="split thin">${yes.rows.length ? `<button class="seg" data-g="${id}" data-i="0" style="flex:${yes.rows.length};background:${PALETTE[0]}" title="${escapeHtml(tip(yes))}"></button>` : ""}${no.rows.length ? `<button class="seg" data-g="${id}" data-i="1" style="flex:${no.rows.length};background:${NEUTRAL}" title="${escapeHtml(tip(no))}"></button>` : ""}</div>
        <div class="legend inline">
          <button class="leg" data-g="${id}" data-i="0" ${yes.rows.length ? "" : "disabled"}><span class="leg-dot" style="background:${PALETTE[0]}"></span><span class="leg-label">${escapeHtml(yes.label)}</span><span class="leg-num">${yes.rows.length}</span></button>
          <button class="leg" data-g="${id}" data-i="1" ${no.rows.length ? "" : "disabled"}><span class="leg-dot" style="background:${NEUTRAL}"></span><span class="leg-label">${escapeHtml(no.label)}</span><span class="leg-num">${no.rows.length}</span></button>
        </div>`;
      return wrap(opts.cls || "", title, opts.note, body);
    }

    // stat tiles (profile signals)
    function tiles(title, items, opts = {}) {
      const id = reg(title, items);
      const body = `<div class="tiles">${items.map((it, i) => `
        <button class="tile" data-g="${id}" data-i="${i}" ${it.rows.length ? "" : "disabled"} title="${escapeHtml(tip(it))}">
          <span class="tile-num">${pct(it.rows.length)}<small>%</small></span>
          <span class="tile-label">${escapeHtml(it.label)}</span>
          <span class="tile-sub">${it.rows.length} of ${n}</span>
          <span class="tile-track"><span style="width:${pct(it.rows.length)}%"></span></span>
        </button>`).join("")}</div>`;
      return wrap(opts.cls || "", title, opts.note, body);
    }

    // side by side comparison of groups
    function compare(title, opts = {}) {
      const defs = {
        lfa: { label: "LFA ownership", groups: [["LFA owners", (r) => lfaStatusOf(r) === "Owned"], ["Non owners", (r) => lfaStatusOf(r) !== "Owned"]] },
        allocation: { label: "Allocation outcome", groups: ALLOCATION_OPTIONS.map((o) => [o, (r) => (r.allocation || "Pending") === o]) },
        age: { label: "Age range", groups: AGE_RANGES.map((o) => [o, (r) => r.age_range === o]) },
      };
      const def = defs[analyticsState.compare] || defs.lfa;
      const gs = def.groups.map(([label, fn]) => ({ label, rows: rows.filter(fn) })).filter((g) => g.rows.length);
      const id = reg(`${title}: ${def.label}`, gs);
      const share = (rs, fn) => (rs.length ? Math.round((rs.filter(fn).length / rs.length) * 100) : 0);
      const metrics = [
        ["Track experience", (rs) => share(rs, (r) => hpde(r) || racer(r)), "%"],
        ["Advanced or Instructor HPDE", (rs) => share(rs, (r) => r.hpde_level === "Advanced" || r.hpde_level === "Instructor"), "%"],
        ["Track is their main planned use", (rs) => share(rs, (r) => primaryUse(r) === "track"), "%"],
        ["Wants delivery within a year", (rs) => share(rs, (r) => { const q = quartersOut(r); return q != null ? q <= 3 : (r.timing || "").toLowerCase() === "ready now"; }), "%"],
        ["Prior Toyota / Lexus owner", (rs) => share(rs, priorToyota), "%"],
        ["Recent flips", (rs) => share(rs, hasFlips), "%"],
        ["Avg garage size", (rs) => (rs.length ? (rs.reduce((t, r) => t + garageOf(r).length, 0) / rs.length).toFixed(1) : "0"), ""],
      ];
      const picker = `<select id="an-compare" class="an-select">${Object.entries(defs).map(([k, d]) => `<option value="${k}" ${analyticsState.compare === k ? "selected" : ""}>By ${d.label.toLowerCase()}</option>`).join("")}</select>`;
      const body = gs.length > 1 ? `<div class="cmp-wrap"><table class="cmp">
        <thead><tr><th></th>${gs.map((g, i) => `<th><button data-g="${id}" data-i="${i}" title="See who's in this group">${escapeHtml(g.label)}<span>${g.rows.length}</span></button></th>`).join("")}</tr></thead>
        <tbody>${metrics.map(([label, fn, unit]) => {
          const vals = gs.map((g) => fn(g.rows));
          const max = Math.max(...vals.map(Number));
          return `<tr><td class="cmp-label">${label}</td>${vals.map((v) => `<td class="${Number(v) === max && max > 0 ? "hi" : ""}">${v}${unit}</td>`).join("")}</tr>`;
        }).join("")}</tbody></table></div>`
        : `<div class="an-empty">Needs at least two groups with applicants</div>`;
      return `<div class="an-card ${opts.cls || ""}"><div class="an-head"><h2>${title}</h2>${picker}</div>${body}</div>`;
    }

    const by = (fn, order) => {
      const m = new Map();
      rows.forEach((r) => [].concat(fn(r)).filter((x) => x != null && x !== "").forEach((k) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(r)) m.get(k).push(r); }));
      let items = [...m.entries()].map(([label, rs]) => ({ label, rows: rs }));
      if (order) items = order.map((o) => ({ label: o, rows: m.get(o) || [] }));
      else items.sort((x, y) => y.rows.length - x.rows.length || x.label.localeCompare(y.label));
      return items;
    };

    // age
    const age = by((r) => r.age_range || "Not set", [...AGE_RANGES, "Not set"]).filter((i) => i.label !== "Not set" || i.rows.length);
    // LFA / flags
    const lfa = [
      { label: "Owned", rows: rows.filter((r) => lfaStatusOf(r) === "Owned") },
      { label: "No ownership", rows: rows.filter((r) => lfaStatusOf(r) !== "Owned"), neutral: true },
    ];
    const LFA_COLORS = { Owned: PALETTE[0], Driven: PALETTE[1], Inquired: PALETTE[2], None: NEUTRAL, "Not set": "#3a3a40" };
    const lfaExp = by((r) => lfaStatusOf(r) || "Not set", [...LFA_STATUSES, "Not set"]).filter((i) => i.label !== "Not set" || i.rows.length).map((it) => ({ ...it, color: LFA_COLORS[it.label] }));
    const flags = [
      { label: "Prior Toyota / Lexus owner", rows: rows.filter(priorToyota) },
      { label: "TMNA relationship noted", rows: rows.filter((r) => hasText(r.tmna_relationship) && !isNone(r.tmna_relationship)) },
      { label: "Recent flips noted", rows: rows.filter(hasFlips), tone: "amber" },
    ];
    // intended usage: main use per applicant, plus the average split
    const useLabel = Object.fromEntries(USAGE_SPLIT);
    const gtUse = by((r) => (primaryUse(r) ? useLabel[primaryUse(r)] : null), USAGE_SPLIT.map(([, l]) => l));
    const splits = rows.map(usageSplitOf).filter(Boolean);
    const avgSplit = splits.length ? USAGE_SPLIT.map(([k, l]) => `${l.split(" /")[0]} ${Math.round(splits.reduce((t, u) => t + u[k], 0) / splits.length)}%`).join(", ") : "";
    const states = by((r) => (r.state || "").trim() || null).slice(0, 10);
    // garage usage (applicants with at least one vehicle in that use)
    const garageUse = by((r) => garageOf(r).flatMap((g) => g.usage || []), USAGE_OPTIONS);
    // motorsports
    const ms = [
      { label: "HPDE and racing", rows: rows.filter((r) => hpde(r) && racer(r)), tone: "red" },
      { label: "HPDE only", rows: rows.filter((r) => hpde(r) && !racer(r)) },
      { label: "Racing only", rows: rows.filter((r) => !hpde(r) && racer(r)) },
      { label: "No track experience", rows: rows.filter((r) => !hpde(r) && !racer(r)), neutral: true },
    ];
    // garage size
    const gsize = (r) => { const k = garageOf(r).length; return k === 0 ? "None recorded" : k === 1 ? "1 vehicle" : k <= 3 ? "2 to 3" : k <= 5 ? "4 to 5" : k <= 9 ? "6 to 9" : "10 or more"; };
    const garageSize = by(gsize, ["1 vehicle", "2 to 3", "4 to 5", "6 to 9", "10 or more", "None recorded"]).filter((i) => i.label !== "None recorded" || i.rows.length);
    // makes
    const makes = by((r) => garageOf(r).map(makeFor)).slice(0, 10);
    const hpdeLevels = by((r) => r.hpde_level || "Not set", [...HPDE_LEVELS, "Not set"]).filter((i) => i.label !== "Not set" || i.rows.length);
    const raceLevels = by((r) => r.race_level || "Not set", [...RACE_LEVELS, "Not set"]).filter((i) => i.label !== "Not set" || i.rows.length);
    const ALLOC_COLORS = { Pending: NEUTRAL, Approve: "#2a9d5c", Waitlist: "#b87a0e", Decline: "#a01c30", "Not set": NEUTRAL };
    const alloc = by((r) => r.allocation || "Pending", ALLOCATION_OPTIONS).map((it) => ({ ...it, color: ALLOC_COLORS[it.label] }));
    const recs = by((r) => r.concierge_rec || "Not set", [...DECISIONS, "Not set"]).filter((i) => i.label !== "Not set" || i.rows.length).map((it) => ({ ...it, color: ALLOC_COLORS[it.label] }));
    // interviews per week, last 12 weeks
    const thisWeek = weekStart(new Date());
    const weeks = [];
    for (let w = 11; w >= 0; w--) { const d = new Date(thisWeek); d.setDate(d.getDate() - w * 7); weeks.push(d); }
    const weekly = weeks.map((d) => ({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      rows: rows.filter((r) => { const when = r.interview_date ? new Date(r.interview_date + "T12:00:00") : new Date(r.created_at); return weekStart(when).getTime() === d.getTime(); }),
    }));
    // timing: target delivery quarter, in date order; older free answers after them
    const timingRaw = by((r) => (r.target_quarter || "").trim() || ((r.timing || "").trim() ? `Earlier: ${r.timing.trim()}` : "Not set"));
    const tRank = (l) => quarterKey(l) ?? (l === "Not set" ? 1e9 : 1e8);
    const timing = timingRaw.sort((x, y) => tRank(x.label) - tRank(y.label) || y.rows.length - x.rows.length).slice(0, 10);

    // team
    const team = by((r) => (r.interviewed_by || "").trim() || "Not set");

    const trackActive = rows.filter((r) => hpde(r) || racer(r)).length;
    const vehicles = rows.reduce((t, r) => t + garageOf(r).length, 0);
    const avgGarage = n ? (vehicles / n).toFixed(1) : "0";
    const milesRows = rows.filter((r) => totalMiles(r) > 0);
    const avgMiles = milesRows.length ? Math.round(milesRows.reduce((t, r) => t + totalMiles(r), 0) / milesRows.length).toLocaleString() : "—";

    const kpis = [
      { label: "Applicants", value: n },
      { label: "LFA owners", value: `${pct(rows.filter((r) => lfaStatusOf(r) === "Owned").length)}%` },
      { label: "Track experience", value: `${pct(trackActive)}%` },
      { label: "Avg garage size", value: avgGarage },
      { label: "Avg miles / yr", value: avgMiles },
    ];
    function filterDesc() {
      const f = [analyticsState.status ? `${analyticsState.status} profiles` : "All profiles", analyticsState.vip ? "VIP only" : null].filter(Boolean);
      return f.join(", ");
    }

    main.innerHTML = `
      <div class="page-header">
        <div><h1>Analytics</h1><p class="muted">${n} applicant${n === 1 ? "" : "s"} in view<span class="no-print"> · click any bar to see who's in it</span></p>
          <p class="print-only print-meta">GR GT Applicant Profiles · ${escapeHtml(filterDesc())} · Generated ${fmtDate(new Date())}</p></div>
        <div class="filters no-print" style="margin:0">
          <button class="btn" id="an-excel">${I.excel}Export Excel</button>
          <button class="btn btn-primary" id="an-print">${I.print}Print / Save PDF</button>
          <select id="an-status"><option value="">All statuses</option><option ${analyticsState.status === "Complete" ? "selected" : ""}>Complete</option><option ${analyticsState.status === "Draft" ? "selected" : ""}>Draft</option></select>
          <button class="chip ${analyticsState.vip ? "active" : ""}" id="an-vip">${I.star}VIP only</button>
        </div>
      </div>
      <div class="kpi-strip an-kpis">
        <div class="kpi"><span class="kpi-num">${n}</span><span class="kpi-label">Applicants</span></div>
        <div class="kpi"><span class="kpi-num">${pct(rows.filter((r) => lfaStatusOf(r) === "Owned").length)}%</span><span class="kpi-label">LFA owners</span></div>
        <div class="kpi"><span class="kpi-num">${pct(trackActive)}%</span><span class="kpi-label">Track experience</span></div>
        <div class="kpi"><span class="kpi-num">${avgGarage}</span><span class="kpi-label">Avg garage size</span></div>
        <div class="kpi"><span class="kpi-num">${avgMiles}</span><span class="kpi-label">Avg miles / yr</span></div>
      </div>
      <div class="an-section-title">Who they are</div>
      <div class="an-grid">
        ${columns("Age Ranges", age, { cls: "span-5" })}
        ${hero("LFA Ownership", lfa[0], lfa[1], "currently own or have owned a Lexus LFA", { cls: "span-3" })}
        ${tiles("Profile Signals", flags, { cls: "span-4 tiles-stack" })}
        ${hbars("Top States", states, { cls: "span-7", ranked: true, note: "Top 10" })}
        ${split("LFA Experience", lfaExp, { cls: "span-5" })}
      </div>
      <div class="an-section-title">What they want</div>
      <div class="an-grid">
        ${hbars("Main Planned Use", gtUse, { cls: "span-6", note: avgSplit ? `Average split: ${avgSplit}` : "Biggest share of each applicant's usage split" })}
        ${columns("Target Delivery", timing, { cls: "span-6", note: "By quarter" })}
      </div>
      <div class="an-section-title">Driving and ownership</div>
      <div class="an-grid">
        ${split("Motorsports Experience", ms, { cls: "span-5" })}
        ${hbars("Current Garage Use", garageUse, { cls: "span-7", note: "Applicants with a car used this way" })}
        ${columns("HPDE Level", hpdeLevels, { cls: "span-6" })}
        ${columns("Race Level", raceLevels, { cls: "span-6" })}
        ${columns("Garage Size", garageSize, { cls: "span-5", note: "Vehicles per applicant" })}
        ${hbars("Most Common Makes Owned", makes, { cls: "span-7", ranked: true, note: "Top 10" })}
      </div>
      <div class="an-section-title">Decisions</div>
      <div class="an-grid">
        <div class="span-4 an-stack">${split("Concierge Recommendation", recs)}${split("Leadership Decision", alloc)}</div>
        ${compare("Compare Groups", { cls: "span-8" })}
      </div>
      <div class="an-section-title">Program</div>
      <div class="an-grid">
        ${columns("Interviews per Week", weekly, { cls: "span-8 weekly", note: "Last 12 weeks, by interview date" })}
        ${split("Interviews by Team Member", team, { cls: "span-4" })}
      </div>
      <div class="drawer-scrim ${drawer ? "open" : ""}" id="an-scrim"></div>
      <aside class="drawer ${drawer ? "open" : ""}" id="an-drawer">
        ${drawer ? `
          <div class="drawer-head"><div><div class="sec-kicker">${escapeHtml(drawer.group)}</div><h2>${escapeHtml(drawer.title)}</h2><span class="muted">${drawer.rows.length} applicant${drawer.rows.length === 1 ? "" : "s"}</span></div><button class="icon-btn" id="an-close" title="Close">✕</button></div>
          <div class="drawer-list">${drawer.rows.map((r) => `
            <a class="drawer-item" href="#/p/${r.id}">
              <span class="user-avatar" style="width:30px;height:30px;font-size:11px">${escapeHtml(initials(r.name))}</span>
              <span style="min-width:0"><b>${escapeHtml(r.name)}</b><div class="muted">${escapeHtml([r.age_range, r.preferred_dealer].filter(Boolean).join(" · "))}</div></span>
              <span class="pill-row" style="margin-left:auto">${r.vip ? `<span class="pill pill-vip">VIP</span>` : ""}${lfaStatusOf(r) === "Owned" ? `<span class="pill pill-lfa">LFA</span>` : ""}</span>
            </a>`).join("")}</div>` : ""}
      </aside>`;

    main.querySelector("#an-print").addEventListener("click", () => {
      const t = document.title;
      document.title = `GR GT Applicant Analytics ${todayISO()}`;
      window.print();
      document.title = t;
    });
    main.querySelector("#an-excel").addEventListener("click", () => {
      if (!window.XLSX) return alert("Excel library didn't load. Check your connection and try again.");
      const aoa = [["GR GT Applicant Analytics"], [`Filter: ${filterDesc()}`], [`Generated: ${fmtDate(new Date())}`], [],
        ["Key Figures", "Value"], ...kpis.map((k) => [k.label, k.value]), []];
      Object.keys(groups).forEach((id) => {
        aoa.push([titles[id], "Applicants", "% of total"]);
        groups[id].forEach((it) => aoa.push([it.label, it.rows.length, n ? Math.round((it.rows.length / n) * 1000) / 10 + "%" : "0%"]));
        aoa.push([]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 34 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Summary");
      appendApplicantSheets(wb, rows);
      XLSX.writeFile(wb, `GR GT Applicant Analytics ${todayISO()}.xlsx`, { cellDates: true });
      markExported();
    });
    main.querySelector("#an-compare").addEventListener("change", (e) => { analyticsState.compare = e.target.value; draw(); });
    main.querySelector("#an-status").addEventListener("change", (e) => { analyticsState.status = e.target.value; draw(); });
    main.querySelector("#an-vip").addEventListener("click", () => { analyticsState.vip = !analyticsState.vip; draw(); });
    main.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => {
      if (b.disabled) return;
      const it = groups[b.dataset.g][+b.dataset.i];
      const group = titles[b.dataset.g];
      drawer = { group, title: it.label, rows: [...it.rows].sort((x, y) => x.name.localeCompare(y.name)) };
      draw();
    }));
    const close = () => { drawer = null; draw(); };
    main.querySelector("#an-scrim").addEventListener("click", close);
    const cb = main.querySelector("#an-close");
    if (cb) cb.addEventListener("click", close);
  }
  const esc = (e) => { if (e.key === "Escape" && drawer) { drawer = null; draw(); } };
  document.addEventListener("keydown", esc);
  window.addEventListener("hashchange", () => document.removeEventListener("keydown", esc), { once: true });
  draw();
}

// ============================================================
// ACCOUNT
// ============================================================
async function renderAccount(seq) {
  const main = shell("account", "");
  main.innerHTML = `
    <div class="page-header"><div><h1>Account</h1><p class="muted">${escapeHtml(currentProfile?.email || "")}</p></div></div>
    <div class="account-grid">
      <div class="form-section">
        <header><h2>Name and title</h2></header>
        <div class="form-field"><label>Shown as "Interviewed By" on new profiles</label><input type="text" id="acc-name" value="${escapeHtml(currentProfile?.full_name || "")}"></div>
        <div class="form-field" style="margin-top:12px"><label>Job title <span class="hint">(shown in the PDF footer, e.g. Concierge Lead)</span></label><input type="text" id="acc-title" value="${escapeHtml(currentProfile?.job_title || "")}"></div>
        <button class="btn btn-primary" id="acc-name-save" style="margin-top:12px">Save</button>
      </div>
      <div class="form-section">
        <header><h2>Password</h2></header>
        <div class="form-field"><label>New password (8+ characters)</label><input type="text" id="acc-pw" style="-webkit-text-security:disc" autocomplete="new-password"></div>
        <button class="btn btn-primary" id="acc-pw-save" style="margin-top:12px">Change password</button>
      </div>
      ${currentProfile?.is_admin ? `<div class="form-section" style="grid-column:1/-1"><header><h2>${I.trash}Trash</h2><span class="muted">Restore a profile, or delete it forever</span></header><div id="trash-list" class="loading">Loading…</div></div>` : ""}
    </div>`;
  main.querySelector("#acc-name-save").addEventListener("click", async () => {
    const v = main.querySelector("#acc-name").value.trim();
    const title = main.querySelector("#acc-title").value.trim();
    if (!v) return;
    try {
      await setDisplayName(v); currentProfile.full_name = v;
      await setJobTitle(title); currentProfile.job_title = title;
      toast("Saved"); render();
    } catch (e) { alert(e.message); }
  });
  main.querySelector("#acc-pw-save").addEventListener("click", async () => {
    const v = main.querySelector("#acc-pw").value;
    if (v.length < 8) return alert("Use at least 8 characters.");
    try { await changePassword(v); main.querySelector("#acc-pw").value = ""; toast("Password changed"); } catch (e) { alert(e.message); }
  });
  if (currentProfile?.is_admin) {
    const box = main.querySelector("#trash-list");
    async function drawTrash() {
      const items = await listTrash();
      if (seq !== renderSeq) return;
      box.className = "";
      box.innerHTML = items.length ? items.map((t) => `<div class="trash-row"><span><b>${escapeHtml(t.name)}</b> <span class="muted">trashed ${timeAgo(t.deleted_at)}</span></span><span class="page-actions"><button class="btn" data-restore="${t.id}">Restore</button><button class="btn btn-danger" data-kill="${t.id}">Delete forever</button></span></div>`).join("") : `<div class="muted">Trash is empty.</div>`;
      box.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => { await restoreApplicant(b.dataset.restore); toast("Restored"); drawTrash(); }));
      box.querySelectorAll("[data-kill]").forEach((b) => b.addEventListener("click", async () => { if (!confirm("Delete this profile permanently? This can't be undone.")) return; await deleteApplicantForever(b.dataset.kill); toast("Deleted"); drawTrash(); }));
    }
    drawTrash();
  }
}

render();
