import {
  signIn, signOut, getSession, onAuthChange, getCurrentProfile, setDisplayName, changePassword,
  listApplicants, getApplicant, createApplicant, updateApplicant, trashApplicant,
  listTrash, restoreApplicant, deleteApplicantForever, subscribeApplicants,
} from "./api.js";
import {
  USAGE_OPTIONS, escapeHtml, initials, garageOf, totalMiles, fmtDate,
  buildSummaryText,
} from "./outputs.js";
import { SUPABASE_URL } from "./config.js";

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
  save: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
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
const GT_USE_OPTIONS = ["Track Days", "Weekend Street", "Collection", "Daily Driver", "Shows & Events"];
const TIMING_SUGGESTIONS = ["Ready now", "Within 6 months", "Within 12 months", "Flexible / whenever allocated"];

const SECTIONS = [
  { id: "bio", title: "Bio", icon: I.user, check: (a) => !!(a.name && a.age_range && a.preferred_dealer) },
  { id: "summary", title: "Summary", icon: I.text, check: (a) => !!a.summary },
  { id: "motorsports", title: "Motorsports / Events", icon: I.flag, check: (a) => !!(a.hpde_experience || a.race_experience || a.key_events || a.what_drives_you) },
  { id: "car", title: "Car Profile", icon: I.car, check: (a) => garageOf(a).length > 0 },
  { id: "buyer", title: "Buyer Profile", icon: I.target, check: (a) => !!(a.timing || a.spec_consideration || a.intended_use || (a.gt_usage || []).length) },
];

const TEXT_FIELDS = [
  "name", "age_range", "preferred_dealer", "social_media", "tmna_relationship", "summary",
  "hpde_experience", "race_experience", "key_events", "what_drives_you",
  "previous_toyota_lexus", "recent_flips", "timing", "spec_consideration", "intended_use",
  "interviewed_by", "interview_date", "status",
];
const BOOL_FIELDS = ["vip", "lfa_owner"];

function blankApplicant() {
  return {
    status: "Draft",
    interview_date: todayISO(),
    interviewed_by: currentProfile?.full_name || "",
    name: "", age_range: "", preferred_dealer: "", social_media: "", tmna_relationship: "", vip: false,
    summary: "",
    hpde_experience: "", race_experience: "", key_events: "", what_drives_you: "",
    garage: [{ vehicle: "", usage: [], miles: "" }], lfa_owner: false, previous_toyota_lexus: "", recent_flips: "",
    timing: "", spec_consideration: "", intended_use: "", gt_usage: [],
  };
}

// ---------- app state ----------
let session = null;
let currentProfile = null;
let renderSeq = 0;
let unsubscribeLive = null;
let dirty = false;
let liveRefresh = null;

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
  liveRefresh = null;
  if (SUPABASE_URL.startsWith("PASTE")) return renderNotConfigured();
  const route = parseRoute();
  if (!session) session = await getSession();
  if (!session && route.name !== "login") return navigate("#/login");
  if (session && route.name === "login") return navigate("#/");
  if (route.name === "login") return renderLogin();
  if (!currentProfile) currentProfile = await getCurrentProfile();
  if (!unsubscribeLive) {
    unsubscribeLive = subscribeApplicants(() => liveRefresh && liveRefresh());
  }
  if (route.name === "list") return renderList(seq);
  if (route.name === "editor") return renderEditor(route, seq);
  if (route.name === "outputs") return renderOutputs(route, seq);
  if (route.name === "account") return renderAccount(seq);
  if (route.name === "analytics") return renderAnalytics(seq);
}

onAuthChange((s) => {
  const was = !!session;
  session = s;
  if (!s) { currentProfile = null; if (unsubscribeLive) { unsubscribeLive(); unsubscribeLive = null; } }
  if (was !== !!s) render();
});

function shell(active, inner) {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a href="#/" class="brand"><span class="brand-dot"></span><span>GR GT Applicant Profiles</span></a>
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
          <button id="logout-btn" class="btn btn-ghost">Log Out</button>
        </div>
      </header>
      <main class="main-content" id="main">${inner}</main>
    </div>`;
  document.getElementById("logout-btn").addEventListener("click", async () => {
    if (dirty && !confirm("Unsaved changes will be lost. Log out?")) return;
    dirty = false;
    await signOut();
  });
  return document.getElementById("main");
}

function renderNotConfigured() {
  app.innerHTML = `<div class="login-wrap"><div class="login-card" style="max-width:420px">
    <div class="brand brand-lg"><span class="brand-dot"></span><span>GR GT Applicant Profiles</span></div>
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
        <div class="brand brand-lg"><span class="brand-dot"></span><span>GR GT Applicant Profiles</span></div>
        <p class="login-sub">Sign in with the account your team lead set up for you.</p>
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
const listState = Object.assign({ q: "", status: "", dealer: "", flag: "", sort: "updated_at", dir: "desc" }, store.get("gtap-list") || {});

async function renderList(seq) {
  const main = shell("list", `<div class="loading">Loading applicants…</div>`);
  let rows;
  try { rows = await listApplicants(); } catch (e) { main.innerHTML = `<div class="banner error">${escapeHtml(e.message)}</div>`; return; }
  if (seq !== renderSeq) return;
  liveRefresh = async () => {
    try { rows = await listApplicants(); draw(); } catch {}
  };

  const dealers = [...new Set(rows.map((r) => (r.preferred_dealer || "").trim()).filter(Boolean))].sort();

  function filtered() {
    const q = listState.q.toLowerCase();
    let out = rows.filter((r) => {
      if (listState.status && r.status !== listState.status) return false;
      if (listState.dealer && (r.preferred_dealer || "").trim() !== listState.dealer) return false;
      if (listState.flag === "vip" && !r.vip) return false;
      if (listState.flag === "lfa" && !r.lfa_owner) return false;
      if (q) {
        const hay = [r.name, r.preferred_dealer, r.summary, r.interviewed_by, r.social_media, r.tmna_relationship, ...garageOf(r).map((g) => g.vehicle)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const k = listState.sort, dir = listState.dir === "asc" ? 1 : -1;
    const val = (r) => (k === "garage" ? garageOf(r).length : k === "miles" ? totalMiles(r) : (r[k] || "").toString().toLowerCase());
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
      <div class="kpi-strip">
        ${kpi("Total", rows.length, "status", "")}
        ${kpi("Complete", rows.filter((r) => r.status === "Complete").length, "status", "Complete")}
        ${kpi("Drafts", rows.filter((r) => r.status === "Draft").length, "status", "Draft")}
        ${kpi("VIP", rows.filter((r) => r.vip).length, "flag", "vip")}
        ${kpi("LFA Owners", rows.filter((r) => r.lfa_owner).length, "flag", "lfa")}
      </div>
      <div class="filters">
        <label class="search-box">${I.search}<input id="q" placeholder="Search name, dealer, vehicle, summary…" value="${escapeHtml(listState.q)}"></label>
        <select id="f-status"><option value="">All statuses</option><option ${listState.status === "Draft" ? "selected" : ""}>Draft</option><option ${listState.status === "Complete" ? "selected" : ""}>Complete</option></select>
        <select id="f-dealer"><option value="">All dealers</option>${dealers.map((d) => `<option ${listState.dealer === d ? "selected" : ""}>${escapeHtml(d)}</option>`).join("")}</select>
        <select id="f-flag"><option value="">Any flags</option><option value="vip" ${listState.flag === "vip" ? "selected" : ""}>VIP only</option><option value="lfa" ${listState.flag === "lfa" ? "selected" : ""}>LFA owners only</option></select>
      </div>
      <div class="table-wrap">
        ${list.length ? `<table class="crm-table">
          <thead><tr>${th("Applicant", "name")}${th("Preferred Dealer", "preferred_dealer")}${th("Garage", "garage")}${th("Timing", "timing")}<th>Flags</th>${th("Status", "status")}${th("Interviewed By", "interviewed_by")}${th("Updated", "updated_at")}</tr></thead>
          <tbody>${list.map((r) => `
            <tr class="clickable-row" data-id="${r.id}">
              <td><div class="cell-name">${escapeHtml(r.name)}</div><div class="cell-sub muted">${escapeHtml(r.age_range || "")}</div></td>
              <td>${escapeHtml(r.preferred_dealer || "")}</td>
              <td>${garageOf(r).length}<div class="cell-sub muted">${totalMiles(r) ? totalMiles(r).toLocaleString() + " mi/yr" : ""}</div></td>
              <td>${escapeHtml(r.timing || "")}</td>
              <td><div class="pill-row">${r.vip ? `<span class="pill pill-vip">${I.star}VIP</span>` : ""}${r.lfa_owner ? `<span class="pill pill-lfa">LFA</span>` : ""}</div></td>
              <td><span class="pill pill-${r.status.toLowerCase()}">${r.status}</span></td>
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
  }
  draw();
}

function exportExcel(rows) {
  if (!window.XLSX) return alert("Excel library didn't load. Check your connection and try again.");
  const wb = XLSX.utils.book_new();
  appendApplicantSheets(wb, rows);
  XLSX.writeFile(wb, `GR GT Applicants ${todayISO()}.xlsx`, { cellDates: true });
}

function appendApplicantSheets(wb, rows) {
  const people = rows.map((r) => ({
    Name: r.name, Status: r.status, "Age Range": r.age_range, "Preferred Dealer": r.preferred_dealer,
    VIP: r.vip ? "Yes" : "No", "LFA Owner": r.lfa_owner ? "Yes" : "No",
    "Social Media": r.social_media, "TMNA Relationship": r.tmna_relationship, Summary: r.summary,
    "HPDE Experience": r.hpde_experience, "Race Experience": r.race_experience, "Key Events": r.key_events, "What Drives Them": r.what_drives_you,
    "Vehicles": garageOf(r).length, "Combined Miles/Yr": totalMiles(r),
    "Previous Toyota/Lexus": r.previous_toyota_lexus, "Recent Flips": r.recent_flips,
    Timing: r.timing, "Spec Consideration": r.spec_consideration, "GR GT Use": (r.gt_usage || []).join(", "), "Intended Use": r.intended_use,
    "Interviewed By": r.interviewed_by, "Interview Date": r.interview_date ? new Date(r.interview_date + "T12:00:00") : null,
    "Last Updated": r.updated_at ? new Date(r.updated_at) : null,
  }));
  const garage = [];
  rows.forEach((r) => garageOf(r).forEach((g) => garage.push({ Applicant: r.name, Vehicle: g.vehicle, Usage: (g.usage || []).join(", "), "Miles/Yr": Number(g.miles) || null })));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(people, { cellDates: true }), "Applicants");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(garage), "Garages");
}

// ============================================================
// EDITOR (the interview form)
// ============================================================
async function renderEditor(route, seq) {
  const isNew = !route.id;
  const main = shell(isNew ? "new" : "list", `<div class="loading">Loading profile…</div>`);
  let record = null;
  if (!isNew) {
    try { record = await getApplicant(route.id); } catch (e) { main.innerHTML = `<div class="banner error">Couldn't load this profile: ${escapeHtml(e.message)}</div>`; return; }
    if (seq !== renderSeq) return;
  }
  const draftKey = `gtap-draft-${route.id || "new"}`;
  let a = record ? JSON.parse(JSON.stringify(record)) : blankApplicant();
  if (!Array.isArray(a.garage) || !a.garage.length) a.garage = [{ vehicle: "", usage: [], miles: "" }];

  const localDraft = store.get(draftKey);
  const draftIsNewer = localDraft && (!record || new Date(localDraft.savedAt) > new Date(record.updated_at));

  const field = (key, label, opts = {}) => {
    const v = a[key] ?? "";
    const hint = opts.hint ? ` <span class="hint">${opts.hint}</span>` : "";
    let input;
    if (opts.type === "textarea") input = `<textarea data-f="${key}" rows="${opts.rows || 3}" placeholder="${opts.ph || ""}">${escapeHtml(v)}</textarea>`;
    else if (opts.type === "select") input = `<select data-f="${key}"><option value=""></option>${opts.options.map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    else input = `<input type="${opts.type || "text"}" data-f="${key}" value="${escapeHtml(v)}" placeholder="${opts.ph || ""}" ${opts.list ? `list="${opts.list}"` : ""} autocomplete="off">`;
    return `<div class="form-field ${opts.span ? "span-2" : ""}"><label>${label}${hint}</label>${input}</div>`;
  };
  const toggle = (key, label, sub) => `
    <label class="toggle-card ${a[key] ? "on" : ""}" data-toggle="${key}">
      <input type="checkbox" data-f="${key}" ${a[key] ? "checked" : ""}>
      <span class="tc-box">${I.check}</span>
      <span><div class="tc-label">${label}</div><div class="tc-sub">${sub}</div></span>
    </label>`;

  main.innerHTML = `
    <datalist id="timing-list">${TIMING_SUGGESTIONS.map((t) => `<option value="${t}">`).join("")}</datalist>
    <a href="#/" class="back-link">${I.back}All applicants</a>
    <div class="editor-bar">
      <div class="editor-title">
        <div class="avatar" id="ed-avatar">${escapeHtml(initials(a.name))}</div>
        <div style="min-width:0">
          <div class="editor-name" id="ed-name">${escapeHtml(a.name) || "New applicant"}</div>
          <div class="save-state ${isNew ? "" : "saved"}" id="save-state"><span class="dot"></span><span>${isNew ? "Not saved yet" : `Saved ${timeAgo(record.updated_at)}${record.updated_by_name ? " by " + escapeHtml(record.updated_by_name) : ""}`}</span></div>
        </div>
      </div>
      <div class="page-actions">
        <div class="form-field" style="margin:0"><select data-f="status" style="padding:8px 10px;font-size:13px">${["Draft", "Complete"].map((s) => `<option ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        ${isNew ? "" : `<a href="#/p/${record.id}/outputs" class="btn" id="outputs-btn">${I.doc}Outputs</a>`}
        <button class="btn btn-primary" id="save-btn">${I.save}Save<span class="muted" style="color:rgba(255,255,255,.65);font-size:11px;margin-left:2px">Ctrl S</span></button>
      </div>
    </div>
    ${draftIsNewer ? `<div class="banner" id="draft-banner"><span>There are unsaved changes to this profile from ${timeAgo(localDraft.savedAt)} on this computer.</span><span class="page-actions"><button class="btn btn-ghost" id="draft-discard">Discard</button><button class="btn btn-primary" id="draft-restore">Restore them</button></span></div>` : ""}
    <div id="err-banner"></div>

    <div class="editor-layout">
      <nav class="section-nav" id="section-nav">
        ${SECTIONS.map((s, i) => `<a href="javascript:void 0" data-sec="${s.id}"><span class="sn-num">0${i + 1}</span>${s.title}<span class="sn-done" data-done="${s.id}"></span></a>`).join("")}
        <div class="sep"></div>
        ${isNew ? `<span class="muted" style="padding:6px 12px">Save once to unlock the outputs.</span>` : `<a href="#/p/${record.id}/outputs">${I.doc}&nbsp;Outputs</a>`}
      </nav>

      <form id="ed-form" autocomplete="off" onsubmit="return false">
        <section class="form-section" id="sec-bio">
          <header><div><div class="sec-kicker">01</div><h2>${I.user}Bio</h2></div></header>
          <div class="form-grid">
            ${field("name", "Name", { ph: "First and last name" })}
            ${field("age_range", "Age Range", { type: "select", options: AGE_RANGES })}
            ${field("preferred_dealer", "Preferred Dealer", { ph: "Dealership name" })}
            ${field("social_media", "Social Media Accounts", { type: "textarea", rows: 2, ph: "One per line, e.g. Instagram @handle" })}
            ${field("tmna_relationship", "Relationships / Affiliation with TMNA", { type: "textarea", rows: 2, span: true, ph: "Who they know, prior programs, events, ambassador roles…" })}
            <div class="span-2">${toggle("vip", "VIP", "Flag this applicant as a VIP")}</div>
          </div>
        </section>

        <section class="form-section" id="sec-summary">
          <header><div><div class="sec-kicker">02</div><h2>${I.text}Summary</h2></div></header>
          ${field("summary", "Short summary of the applicant", { type: "textarea", rows: 4, ph: "Two or three sentences on who they are and why they stand out." })}
        </section>

        <section class="form-section" id="sec-motorsports">
          <header><div><div class="sec-kicker">03</div><h2>${I.flag}Motorsports / Events Profile</h2></div></header>
          <div class="form-grid">
            ${field("hpde_experience", "HPDE Experience", { type: "textarea", ph: "Tracks, how often, run group / level" })}
            ${field("race_experience", "Race Experience", { type: "textarea", ph: "Series, license, results" })}
            ${field("key_events", "Key Motorsports Events Attended", { type: "textarea", span: true, ph: "Le Mans, Rolex 24, Monterey Car Week, GR Academy…" })}
            ${field("what_drives_you", "What Drives You", { type: "textarea", span: true, ph: "In their words, what they love about driving and the hobby" })}
          </div>
        </section>

        <section class="form-section" id="sec-car">
          <header><div><div class="sec-kicker">04</div><h2>${I.car}Car Profile</h2></div><span class="garage-total" id="garage-total"></span></header>
          <div class="form-field"><label>Current Garage <span class="hint">(how each is used and miles per year)</span></label></div>
          <div class="garage-head"><span></span><span>Vehicle</span><span>How it's used</span><span>Miles / yr</span><span></span></div>
          <div class="garage-list" id="garage-list"></div>
          <button type="button" class="btn" id="add-car">${I.plus}Add vehicle</button>
          <div class="form-grid" style="margin-top:18px">
            <div class="span-2">${toggle("lfa_owner", "LFA Ownership", "Currently owns or has owned a Lexus LFA")}</div>
            ${field("previous_toyota_lexus", "Previous Toyota / Lexus Vehicles", { type: "textarea" })}
            ${field("recent_flips", "Recent Vehicle Flips", { type: "textarea", ph: "Anything bought and resold quickly" })}
          </div>
        </section>

        <section class="form-section" id="sec-buyer">
          <header><div><div class="sec-kicker">05</div><h2>${I.target}Buyer Profile</h2></div></header>
          <div class="form-grid">
            ${field("timing", "Timing", { list: "timing-list", ph: "When they'd take delivery" })}
            ${field("spec_consideration", "Spec Consideration", { type: "textarea", rows: 2, ph: "Color, options, packages" })}
            <div class="form-field span-2"><label>How they plan to use the GR GT <span class="hint">(pick all that apply)</span></label><div class="use-chips" id="gt-use"></div></div>
            ${field("intended_use", "Why do they want the GR GT? (Intended use)", { type: "textarea", rows: 3, span: true })}
          </div>
        </section>

        <section class="form-section" id="sec-meta">
          <header><div><div class="sec-kicker">Interview</div><h2>Call details</h2></div></header>
          <div class="form-grid">
            ${field("interviewed_by", "Interviewed By")}
            ${field("interview_date", "Interview Date", { type: "date" })}
          </div>
          ${!isNew && currentProfile?.is_admin ? `<div style="margin-top:16px;display:flex;justify-content:flex-end"><button type="button" class="btn btn-danger" id="trash-btn">${I.trash}Move to Trash</button></div>` : ""}
        </section>
      </form>
    </div>`;

  const form = main.querySelector("#ed-form");
  const saveState = main.querySelector("#save-state");

  // ----- garage -----
  function drawGarage() {
    const list = main.querySelector("#garage-list");
    list.innerHTML = a.garage.map((g, i) => `
      <div class="garage-row" data-i="${i}">
        <span class="g-num">${i + 1}</span>
        <input data-g="vehicle" value="${escapeHtml(g.vehicle)}" placeholder="Year, make, model">
        <div class="use-chips">${USAGE_OPTIONS.map((u) => `<button type="button" class="use-chip ${(g.usage || []).includes(u) ? "on" : ""}" data-use="${u}">${u}</button>`).join("")}</div>
        <input data-g="miles" type="number" min="0" step="500" value="${escapeHtml(g.miles ?? "")}" placeholder="Miles">
        <button type="button" class="icon-btn" data-rm title="Remove">${I.trash}</button>
      </div>`).join("");
    updateGarageTotal();
  }
  function updateGarageTotal() {
    const n = garageOf(a).length, m = totalMiles(a);
    main.querySelector("#garage-total").textContent = n ? `${n} vehicle${n === 1 ? "" : "s"}${m ? ` · ${m.toLocaleString()} mi/yr combined` : ""}` : "";
  }
  main.querySelector("#garage-list").addEventListener("input", (e) => {
    const row = e.target.closest(".garage-row"); if (!row) return;
    const g = a.garage[+row.dataset.i];
    if (e.target.dataset.g === "vehicle") g.vehicle = e.target.value;
    if (e.target.dataset.g === "miles") g.miles = e.target.value === "" ? "" : Number(e.target.value);
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
      if (!a.garage.length) a.garage.push({ vehicle: "", usage: [], miles: "" });
      drawGarage(); markDirty();
    }
  });
  main.querySelector("#add-car").addEventListener("click", () => {
    a.garage.push({ vehicle: "", usage: [], miles: "" });
    drawGarage();
    const rows = main.querySelectorAll(".garage-row");
    rows[rows.length - 1].querySelector("input").focus();
  });
  drawGarage();

  // ----- GR GT intended use chips -----
  function drawGtUse() {
    if (!Array.isArray(a.gt_usage)) a.gt_usage = [];
    main.querySelector("#gt-use").innerHTML = GT_USE_OPTIONS.map((u) => `<button type="button" class="use-chip ${a.gt_usage.includes(u) ? "on" : ""}" data-gtuse="${u}">${u}</button>`).join("");
  }
  main.querySelector("#gt-use").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-gtuse]"); if (!chip) return;
    const u = chip.dataset.gtuse, at = a.gt_usage.indexOf(u);
    at >= 0 ? a.gt_usage.splice(at, 1) : a.gt_usage.push(u);
    a.gt_usage.sort((x, y) => GT_USE_OPTIONS.indexOf(x) - GT_USE_OPTIONS.indexOf(y));
    chip.classList.toggle("on", at < 0);
    markDirty();
  });
  drawGtUse();

  // ----- plain fields -----
  main.addEventListener("input", (e) => {
    const k = e.target.dataset?.f;
    if (!k) return;
    if (BOOL_FIELDS.includes(k)) return;
    a[k] = e.target.value;
    if (k === "name") {
      main.querySelector("#ed-name").textContent = a.name || "New applicant";
      main.querySelector("#ed-avatar").textContent = initials(a.name);
      e.target.classList.remove("invalid");
    }
    markDirty();
  });
  main.addEventListener("change", (e) => {
    const k = e.target.dataset?.f;
    if (!k) return;
    if (BOOL_FIELDS.includes(k)) {
      a[k] = e.target.checked;
      e.target.closest(".toggle-card").classList.toggle("on", a[k]);
    } else a[k] = e.target.value;
    markDirty();
  });

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
  let draftTimer;
  function markDirty() {
    dirty = true;
    saveState.className = "save-state dirty";
    saveState.lastElementChild.textContent = "Unsaved changes";
    updateProgress();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => store.set(draftKey, { savedAt: new Date().toISOString(), data: a }), 400);
  }

  if (draftIsNewer) {
    main.querySelector("#draft-discard").addEventListener("click", () => { store.del(draftKey); main.querySelector("#draft-banner").remove(); });
    main.querySelector("#draft-restore").addEventListener("click", () => {
      const keep = { id: a.id, updated_at: a.updated_at };
      a = Object.assign({}, localDraft.data, keep);
      // repaint fields
      TEXT_FIELDS.forEach((k) => main.querySelectorAll(`[data-f="${k}"]`).forEach((el) => (el.value = a[k] ?? "")));
      BOOL_FIELDS.forEach((k) => { const el = main.querySelector(`[data-f="${k}"]`); el.checked = !!a[k]; el.closest(".toggle-card").classList.toggle("on", !!a[k]); });
      if (!Array.isArray(a.garage) || !a.garage.length) a.garage = [{ vehicle: "", usage: [], miles: "" }];
      drawGarage();
      drawGtUse();
      main.querySelector("#ed-name").textContent = a.name || "New applicant";
      main.querySelector("#ed-avatar").textContent = initials(a.name);
      main.querySelector("#draft-banner").remove();
      markDirty();
    });
  }

  // ----- save -----
  const errBanner = main.querySelector("#err-banner");
  async function save() {
    errBanner.innerHTML = "";
    if (!(a.name || "").trim()) {
      const n = main.querySelector('[data-f="name"]');
      n.classList.add("invalid"); n.focus();
      errBanner.innerHTML = `<div class="banner error">Add the applicant's name before saving.</div>`;
      return false;
    }
    const payload = {};
    TEXT_FIELDS.forEach((k) => (payload[k] = typeof a[k] === "string" ? a[k].trim() || null : a[k] ?? null));
    payload.status = a.status || "Draft";
    BOOL_FIELDS.forEach((k) => (payload[k] = !!a[k]));
    payload.gt_usage = Array.isArray(a.gt_usage) ? a.gt_usage : [];
    payload.garage = garageOf(a).map((g) => ({ vehicle: g.vehicle.trim(), usage: g.usage || [], miles: Number(g.miles) || null }));
    const btn = main.querySelector("#save-btn");
    btn.disabled = true;
    try {
      if (isNew) {
        const created = await createApplicant(payload, currentProfile);
        store.del(draftKey);
        dirty = false;
        toast("Profile created");
        lastHash = `#/p/${created.id}`;
        navigate(lastHash);
        return true;
      }
      const saved = await updateApplicant(record.id, payload, currentProfile, record.updated_at);
      record = saved;
      a.updated_at = saved.updated_at;
      store.del(draftKey);
      dirty = false;
      saveState.className = "save-state saved";
      saveState.lastElementChild.textContent = "Saved just now";
      toast("Saved");
      return true;
    } catch (e) {
      if (e.code === "CONFLICT") {
        errBanner.innerHTML = `<div class="banner error"><span>${escapeHtml(e.message)} Your changes are kept on this computer.</span><span class="page-actions"><button class="btn" id="conf-reload">Load their version</button><button class="btn btn-danger" id="conf-force">Save mine over it</button></span></div>`;
        errBanner.querySelector("#conf-reload").addEventListener("click", () => { store.del(draftKey); dirty = false; render(); });
        errBanner.querySelector("#conf-force").addEventListener("click", async () => { record.updated_at = new Date(Date.now() + 60000).toISOString(); await save(); });
      } else {
        errBanner.innerHTML = `<div class="banner error">Couldn't save: ${escapeHtml(e.message)}. Your changes are kept on this computer.</div>`;
      }
      return false;
    } finally {
      btn.disabled = false;
    }
  }
  main.querySelector("#save-btn").addEventListener("click", save);
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  };
  document.addEventListener("keydown", onKey);
  const cleanup = () => { document.removeEventListener("keydown", onKey); spy.disconnect(); window.removeEventListener("hashchange", cleanup); };
  window.addEventListener("hashchange", cleanup);

  const outBtn = main.querySelector("#outputs-btn");
  if (outBtn) outBtn.addEventListener("click", async (e) => {
    if (!dirty) return;
    e.preventDefault();
    if (await save()) { lastHash = `#/p/${record.id}/outputs`; navigate(lastHash); }
  });

  const trashBtn = main.querySelector("#trash-btn");
  if (trashBtn) trashBtn.addEventListener("click", async () => {
    if (!confirm(`Move ${record.name} to the Trash? An admin can restore it from the Account page.`)) return;
    await trashApplicant(record.id);
    dirty = false; store.del(draftKey);
    toast("Moved to Trash");
    navigate("#/");
  });

  if (isNew && !draftIsNewer) main.querySelector('[data-f="name"]').focus();
}

// ============================================================
// OUTPUTS (text summary; Bio Persona slot reserved)
// ============================================================
async function renderOutputs(route, seq) {
  const main = shell("list", `<div class="loading">Building outputs…</div>`);
  let a;
  try { a = await getApplicant(route.id); } catch (e) { main.innerHTML = `<div class="banner error">${escapeHtml(e.message)}</div>`; return; }
  if (seq !== renderSeq) return;
  let mode = store.get("gtap-textmode") || "full";

  main.innerHTML = `
    <a href="#/p/${a.id}" class="back-link">${I.back}Back to the interview form</a>
    <div class="page-header" style="margin-top:8px">
      <div><h1>${escapeHtml(a.name)}</h1><p class="muted">Outputs reflect the last saved version${a.status === "Draft" ? " · <span style='color:var(--amber)'>still marked Draft</span>" : ""}</p></div>
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
        <div class="out-head"><h2>${I.doc}Bio Persona</h2></div>
        <div class="empty-state">Bio Persona design coming soon.</div>
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

}

// ============================================================
// ANALYTICS
// ============================================================
const analyticsState = Object.assign({ status: "", vip: false }, store.get("gtap-analytics") || {});
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
const hasFlips = (r) => hasText(r.recent_flips) && !isNone(r.recent_flips);
const hpde = (r) => hasText(r.hpde_experience) && !isNone(r.hpde_experience);
const racer = (r) => hasText(r.race_experience) && !isNone(r.race_experience);

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
      const color = (it, i) => it.neutral ? NEUTRAL : PALETTE[i % PALETTE.length];
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
      { label: "Owner", rows: rows.filter((r) => r.lfa_owner) },
      { label: "Not an owner", rows: rows.filter((r) => !r.lfa_owner), neutral: true },
    ];
    const flags = [
      { label: "Prior Toyota / Lexus owner", rows: rows.filter((r) => hasText(r.previous_toyota_lexus) && !isNone(r.previous_toyota_lexus)) },
      { label: "TMNA relationship noted", rows: rows.filter((r) => hasText(r.tmna_relationship) && !isNone(r.tmna_relationship)) },
      { label: "Recent flips noted", rows: rows.filter(hasFlips), tone: "amber" },
    ];
    // planned GR GT use
    const gtUse = by((r) => r.gt_usage || [], GT_USE_OPTIONS);
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
    const makes = by((r) => garageOf(r).map((g) => makeOf(g.vehicle))).slice(0, 10);
    // timing
    const timingRaw = by((r) => (r.timing || "").trim() || "Not set");
    const tRank = (l) => { const i = TIMING_SUGGESTIONS.findIndex((t) => t.toLowerCase() === l.toLowerCase()); return i < 0 ? (l === "Not set" ? 99 : 50) : i; };
    const timing = timingRaw.sort((x, y) => tRank(x.label) - tRank(y.label) || y.rows.length - x.rows.length).slice(0, 5);

    // team
    const team = by((r) => (r.interviewed_by || "").trim() || "Not set");

    const trackActive = rows.filter((r) => hpde(r) || racer(r)).length;
    const vehicles = rows.reduce((t, r) => t + garageOf(r).length, 0);
    const avgGarage = n ? (vehicles / n).toFixed(1) : "0";
    const milesRows = rows.filter((r) => totalMiles(r) > 0);
    const avgMiles = milesRows.length ? Math.round(milesRows.reduce((t, r) => t + totalMiles(r), 0) / milesRows.length).toLocaleString() : "—";

    const kpis = [
      { label: "Applicants", value: n },
      { label: "LFA owners", value: `${pct(rows.filter((r) => r.lfa_owner).length)}%` },
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
        <div class="kpi"><span class="kpi-num">${pct(rows.filter((r) => r.lfa_owner).length)}%</span><span class="kpi-label">LFA owners</span></div>
        <div class="kpi"><span class="kpi-num">${pct(trackActive)}%</span><span class="kpi-label">Track experience</span></div>
        <div class="kpi"><span class="kpi-num">${avgGarage}</span><span class="kpi-label">Avg garage size</span></div>
        <div class="kpi"><span class="kpi-num">${avgMiles}</span><span class="kpi-label">Avg miles / yr</span></div>
      </div>
      <div class="an-section-title">Who they are</div>
      <div class="an-grid">
        ${columns("Age Ranges", age, { cls: "span-5" })}
        ${hero("LFA Ownership", lfa[0], lfa[1], "currently own or have owned a Lexus LFA", { cls: "span-3" })}
        ${tiles("Profile Signals", flags, { cls: "span-4 tiles-stack" })}
      </div>
      <div class="an-section-title">What they want</div>
      <div class="an-grid">
        ${hbars("Planned GR GT Use", gtUse, { cls: "span-7", note: "Applicants can pick several" })}
        ${split("Timing", timing, { cls: "span-5" })}
      </div>
      <div class="an-section-title">Driving and ownership</div>
      <div class="an-grid">
        ${split("Motorsports Experience", ms, { cls: "span-5" })}
        ${hbars("Current Garage Use", garageUse, { cls: "span-7", note: "Applicants with a car used this way" })}
        ${columns("Garage Size", garageSize, { cls: "span-5", note: "Vehicles per applicant" })}
        ${hbars("Most Common Makes Owned", makes, { cls: "span-7", ranked: true, note: "Top 10" })}
      </div>
      <div class="an-section-title">Program</div>
      <div class="an-grid">
        ${split("Interviews by Team Member", team, { cls: "span-12" })}
      </div>
      <div class="drawer-scrim ${drawer ? "open" : ""}" id="an-scrim"></div>
      <aside class="drawer ${drawer ? "open" : ""}" id="an-drawer">
        ${drawer ? `
          <div class="drawer-head"><div><div class="sec-kicker">${escapeHtml(drawer.group)}</div><h2>${escapeHtml(drawer.title)}</h2><span class="muted">${drawer.rows.length} applicant${drawer.rows.length === 1 ? "" : "s"}</span></div><button class="icon-btn" id="an-close" title="Close">✕</button></div>
          <div class="drawer-list">${drawer.rows.map((r) => `
            <a class="drawer-item" href="#/p/${r.id}">
              <span class="user-avatar" style="width:30px;height:30px;font-size:11px">${escapeHtml(initials(r.name))}</span>
              <span style="min-width:0"><b>${escapeHtml(r.name)}</b><div class="muted">${escapeHtml([r.age_range, r.preferred_dealer].filter(Boolean).join(" · "))}</div></span>
              <span class="pill-row" style="margin-left:auto">${r.vip ? `<span class="pill pill-vip">VIP</span>` : ""}${r.lfa_owner ? `<span class="pill pill-lfa">LFA</span>` : ""}</span>
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
    });
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
        <header><h2>Display name</h2></header>
        <div class="form-field"><label>Shown as "Interviewed By" on new profiles</label><input type="text" id="acc-name" value="${escapeHtml(currentProfile?.full_name || "")}"></div>
        <button class="btn btn-primary" id="acc-name-save" style="margin-top:12px">Save name</button>
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
    if (!v) return;
    try { await setDisplayName(v); currentProfile.full_name = v; toast("Name updated"); render(); } catch (e) { alert(e.message); }
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
