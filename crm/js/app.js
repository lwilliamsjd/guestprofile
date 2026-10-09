import {
  signIn,
  signOut,
  getSession,
  getCurrentProfile,
  listTeam,
  setDisplayName,
  changePassword,
  listMeisters,
  listTrashedMeisters,
  listDealerships,
  findDuplicateMeisters,
  searchEverything,
  importMeisters,
  listStatusHistory,
  listMeisterRollups,
  getMeister,
  createMeister,
  updateMeister,
  deleteMeister,
  restoreMeister,
  purgeMeister,
  listInteractions,
  addInteraction,
  deleteInteraction,
  listCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  countCategoryUses,
  setInteractionCategory,
  setInteractionDetails,
  fetchAnalyticsData,
  listGuests,
  addGuest,
  updateGuest,
  deleteGuest,
  listFollowUpsForMeister,
  listMyFollowUps,
  listRecentDoneFollowUps,
  countMyDueFollowUps,
  addFollowUp,
  updateFollowUp,
  deleteFollowUp,
  listCommentsForInteractions,
  listCommentCounts,
  addComment,
  updateComment,
  deleteComment,
  listRecentActivity,
  subscribeToChanges,
  onAuthChange,
  setNotificationPrefs,
  listNotifications,
  listUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markMeisterNotificationsRead,
} from "./api.js?v=202610091232";
import { exportToExcel } from "./export.js?v=202610091232";
import { wireImport } from "./import-export.js?v=202610091232";

const app = document.getElementById("app");
let currentProfile = null;
let unsubscribeRealtime = null;
let myDueCount = 0;
let myUnread = []; // [{id, meister_id}] unread notifications for the signed-in user
let categories = []; // question categories (all, including retired)
const activeCategories = () => categories.filter((c) => c.active);
const catById = (id) => categories.find((c) => c.id === id);

// Meisters are dealer contacts, not buyers: they're either New or Contacted.
// The older stages are kept only so any Meister already saved with one still
// displays it; they can't be picked any more.
const STATUSES = ["New", "Contacted"];
const LEGACY_STATUSES = ["Engaged", "Sold", "Not Interested"];
const ALL_STATUSES = [...STATUSES, ...LEGACY_STATUSES];
const CONCIERGES = ["Freddie", "Logan"];
const METHODS = ["Phone", "Text", "Email", "In Person", "Other"];
const DIRECTIONS = ["Outbound", "Inbound"];
const GUEST_STATUSES = ["Allocated", "Ordered", "Delivered"];
const STALE_DAYS = 30; // no contact for this long = "stale" on the dashboard
let team = []; // [{id, full_name, concierge}] for @mentions
let connState = "ok"; // ok | reconnecting | offline

// ============================================================
// ICONS  (inline SVG, inherit currentColor — consistent on every OS)
// ============================================================
const I = {
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z"/></svg>`,
  text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  person: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  calendarPlus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  sort: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15v-4M12 15V7M17 15v-2"/></svg>`,
  inbound: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>`,
  outbound: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
  building: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V13h6v8M7 7h.01M12 7h.01M17 7h.01M7 11h.01M17 11h.01"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>`,
  restore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  flag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 1-1h12l-2 4 2 4H5"/></svg>`,
  car: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M3 11l2-5h14l2 5v6H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg>`,
  print: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>`,
};

const METHOD_ICON = { Phone: I.phone, Text: I.text, Email: I.mail, "In Person": I.person, Other: I.other };
const QUICK_ACTIONS = [
  { label: "Call", icon: I.phone, method: "Phone" },
  { label: "Text", icon: I.text, method: "Text" },
  { label: "Email", icon: I.mail, method: "Email" },
  { label: "Note", icon: I.note, method: "Other" },
];

// ============================================================
// STATE
// ============================================================
let uiState = freshUiState("activity");
function freshUiState(tab) {
  return {
    activeTab: tab,
    composerOpen: false,
    composerMethod: "Phone",
    composerDirection: "Outbound",
    composerWithFollowUp: false,
    methodFilter: "",
    guestFormOpen: false,
    editingGuestId: null,
    fuFormOpen: false,
    editingFuId: null,
    replyingTo: null,
    editingCommentId: null,
    editingIntId: null,
    focusId: null,
  };
}

// Dashboard, activity, and analytics filters are remembered per browser.
const dashState = loadState("dash", { q: "", status: "", concierge: "", sort: "updated", dir: "desc" });
const actState = loadState("act", { q: "", method: "", person: "", category: "", direction: "" });
const fuPageState = { showDone: false, editingId: null };
const anaState = loadState("ana", { range: "30d", from: "", to: "", concierge: "", drill: null, compare: true });
anaState.drill = null;
const catMgrState = { editingId: null };
const dealerState = { q: "", sort: "meisters" };
const importState = { rows: [], headers: [], map: {}, fileName: "", done: null };
const searchState = { open: false, q: "", results: null, active: 0 };
const trashState = { open: false };

function loadState(key, defaults) {
  try {
    const raw = localStorage.getItem("crm:" + key);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...defaults };
}
function saveState(key, obj) {
  try { localStorage.setItem("crm:" + key, JSON.stringify(obj)); } catch { /* ignore */ }
}

// Draft preservation: anything typed into a [data-draft] field survives a
// re-render. Only DIRTY fields are captured, so fresh server values still
// win when the user hasn't touched a field.
let drafts = {};
let draftsRouteKey = null;

function captureDrafts() {
  document.querySelectorAll("#main-content [data-draft]").forEach((el) => {
    let dirty;
    if (el.tagName === "SELECT") {
      const def = [...el.options].find((o) => o.defaultSelected) || el.options[0];
      dirty = def ? def.value !== el.value : true;
    } else {
      dirty = el.value !== el.defaultValue;
    }
    // Once a field has a draft it stays sticky (re-rendering it makes it look
    // "clean" again), otherwise only capture fields the user actually changed.
    if (dirty || el.id in drafts) drafts[el.id] = el.value;
  });
}
function dv(id, fallback = "") {
  return id in drafts ? drafts[id] : fallback ?? "";
}
function clearDrafts(prefix) {
  for (const k of Object.keys(drafts)) if (!prefix || k.startsWith(prefix)) delete drafts[k];
}

// ============================================================
// ROUTER
// ============================================================
window.addEventListener("hashchange", () => render());
window.addEventListener("DOMContentLoaded", init);

async function init() {
  if (!document.getElementById("toast-root")) {
    const tr = document.createElement("div");
    tr.id = "toast-root";
    document.body.appendChild(tr);
  }
  if (!document.getElementById("conn-banner")) {
    const b = document.createElement("div");
    b.id = "conn-banner";
    document.body.appendChild(b);
  }
  const session = await getSession();
  if (session) {
    currentProfile = await getCurrentProfile();
    team = await listTeam().catch(() => []);
    startRealtime();
  }
  render();

  // Never await Supabase calls directly inside the auth callback: supabase-js
  // holds its auth lock while the callback runs, so those calls deadlock and
  // every later query hangs. Defer the work until the callback has returned.
  onAuthChange((event, sess) => setTimeout(() => handleAuthEvent(event, sess), 0));
  async function handleAuthEvent(event, sess) {
    if (event === "SIGNED_IN") {
      const alreadySignedIn = !!currentProfile;
      currentProfile = await getCurrentProfile();
      team = await listTeam().catch(() => []);
      if (!alreadySignedIn) {
        startRealtime();
        navigate("#/dashboard");
      }
    } else if (event === "SIGNED_OUT") {
      currentProfile = null;
      if (unsubscribeRealtime) unsubscribeRealtime();
      navigate("#/login");
    } else if (event === "TOKEN_REFRESHED") {
      setConn("ok");
    }
  }

  // Connection awareness: browser offline/online + realtime channel health.
  window.addEventListener("offline", () => setConn("offline"));
  window.addEventListener("online", () => { setConn("reconnecting"); startRealtime(); render(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentProfile) checkSession();
  });

  // Global search: Ctrl+K / Cmd+K anywhere, Esc closes.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (currentProfile) openSearch();
    } else if (e.key === "Escape" && searchState.open) {
      closeSearch();
    }
  });
}

// If the session silently expired (laptop asleep for a long time), say so and
// send the user to the login page instead of letting every save fail.
async function checkSession() {
  const session = await getSession();
  if (!session && currentProfile) {
    toast("Your session expired. Please sign in again.", "error");
    currentProfile = null;
    if (unsubscribeRealtime) unsubscribeRealtime();
    navigate("#/login");
  }
}

function setConn(state) {
  if (connState === state) return;
  connState = state;
  const b = document.getElementById("conn-banner");
  if (!b) return;
  if (state === "ok") { b.className = ""; b.innerHTML = ""; return; }
  b.className = `show ${state}`;
  b.innerHTML = state === "offline"
    ? `${I.alert} You're offline. Anything you type is kept, but nothing can save until the connection is back.`
    : `${I.clock} Reconnecting to live updates…`;
}

function startRealtime() {
  if (unsubscribeRealtime) unsubscribeRealtime();
  unsubscribeRealtime = subscribeToChanges(
    () => {
      const route = parseHash();
      if (route.name !== "login" && !(route.name === "meister" && route.mode === "new") && route.name !== "import") render({ live: true });
    },
    (status) => {
      if (status === "SUBSCRIBED") setConn(navigator.onLine === false ? "offline" : "ok");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConn(navigator.onLine === false ? "offline" : "reconnecting");
    }
  );
}

function navigate(hash) {
  if (window.location.hash === hash) render();
  else window.location.hash = hash;
}

function parseHash() {
  const hash = window.location.hash || "#/dashboard";
  const parts = hash.replace(/^#\//, "").split("/");
  if (parts[0] === "" || parts[0] === "dashboard") return { name: "dashboard", key: "dashboard" };
  if (parts[0] === "login") return { name: "login", key: "login" };
  if (parts[0] === "activity") return { name: "activity", key: "activity" };
  if (parts[0] === "followups") return { name: "followups", key: "followups" };
  if (parts[0] === "notifications") return { name: "notifications", key: "notifications" };
  if (parts[0] === "analytics" || parts[0] === "insights") return { name: "analytics", key: "analytics" };
  if (parts[0] === "account") return { name: "account", key: "account" };
  if (parts[0] === "dealerships") return { name: "dealerships", key: "dealerships" };
  if (parts[0] === "import") return { name: "import", key: "import" };
  if (parts[0] === "meister" && parts[1] === "new") return { name: "meister", mode: "new", key: "meister:new" };
  if (parts[0] === "meister" && parts[1]) return { name: "meister", mode: "view", id: parts[1], key: `meister:${parts[1]}` };
  return { name: "dashboard", key: "dashboard" };
}

// ============================================================
// RENDER
// ============================================================
let renderSeq = 0;
let lastPaintedKey = null;

async function render() {
  const seq = ++renderSeq;
  const route = parseHash();

  if (route.key !== draftsRouteKey) {
    drafts = {};
    draftsRouteKey = route.key;
    if (route.name === "meister") uiState = freshUiState(route.mode === "new" ? "profile" : "activity");
  } else {
    captureDrafts();
  }

  const session = await getSession();
  if (seq !== renderSeq) return;

  if (!session && route.name !== "login") return void (window.location.hash = "#/login");
  if (session && route.name === "login") return void (window.location.hash = "#/dashboard");
  if (route.name === "login") return renderLogin();

  if (route.key !== lastPaintedKey || !app.querySelector(".shell")) {
    renderShell(route, (c) => (c.innerHTML = `<div class="loading">Loading…</div>`));
    lastPaintedKey = route.key;
  }

  if (currentProfile) {
    [myDueCount, myUnread, categories] = await Promise.all([
      countMyDueFollowUps(currentProfile.id),
      listUnreadNotifications(currentProfile.id),
      listCategories().catch(() => categories),
    ]);
  }
  if (seq !== renderSeq) return;

  if (route.name === "dashboard") return renderDashboard(route, seq);
  if (route.name === "activity") return renderActivity(route, seq);
  if (route.name === "followups") return renderFollowUpsPage(route, seq);
  if (route.name === "notifications") return renderNotificationsPage(route, seq);
  if (route.name === "analytics") return renderAnalyticsPage(route, seq);
  if (route.name === "account") return renderAccount(route, seq);
  if (route.name === "dealerships") return renderDealershipsPage(route, seq);
  if (route.name === "import") return renderImportPage(route, seq);
  if (route.name === "meister") return renderMeister(route, seq);
}

// ---------- switching to Applicant Profiles ----------
try { localStorage.setItem("grc-last-tool", "crm"); } catch {}
function wireToolSwitch() {
  const link = document.querySelector('.ts-opt[data-tool="profiles"]');
  if (!link) return;
  link.addEventListener("click", (e) => {
    captureDrafts();
    const unsaved = Object.values(drafts).some((v) => String(v || "").trim());
    if (unsaved && !confirm("You have text typed here that hasn't been logged or saved yet. Switch to Profiles anyway?")) { e.preventDefault(); return; }
    try { localStorage.setItem("grc-last-tool", "profiles"); } catch {}
  });
}

function renderShell(route, contentFn) {
  if (route.key === draftsRouteKey) captureDrafts();
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="tool-switch" role="tablist" aria-label="Switch tool">
          <span class="brand-dot"></span>
          <a href="../crm/" class="ts-opt on" data-tool="crm" role="tab" aria-selected="true"><span class="ts-long">Concierge </span>CRM</a>
          <a href="../profiles/" class="ts-opt " data-tool="profiles" role="tab" aria-selected="false"><span class="ts-long">Applicant </span>Profiles</a>
        </div>
        <nav class="nav">
          <a href="#/dashboard" class="${route.name === "dashboard" || route.name === "meister" || route.name === "import" ? "active" : ""}">Meisters</a>
          <a href="#/dealerships" class="${route.name === "dealerships" ? "active" : ""}">Dealerships</a>
          <a href="#/activity" class="${route.name === "activity" ? "active" : ""}">Activity Log</a>
          <a href="#/followups" class="${route.name === "followups" ? "active" : ""}">Follow-Ups${myDueCount ? `<span class="nav-badge">${myDueCount}</span>` : ""}</a>
          <a href="#/analytics" class="${route.name === "analytics" ? "active" : ""}">Analytics</a>
        </nav>
        <div class="user-area">
          <button id="search-btn" class="search-trigger" title="Search everything (Ctrl+K)">${I.search}<span class="search-kbd">Ctrl K</span></button>
          <a href="#/notifications" class="bell ${route.name === "notifications" ? "active" : ""}" title="Notifications">${I.bell}${myUnread.length ? `<span class="bell-count">${myUnread.length > 99 ? "99+" : myUnread.length}</span>` : ""}</a>
          <a href="#/account" class="user-chip ${route.name === "account" ? "active" : ""}" title="Account settings">
            <span class="user-avatar">${initials(currentProfile?.full_name)}</span>
            <span class="user-name">${escapeHtml(currentProfile?.full_name || "")}</span>
            ${currentProfile?.is_admin ? `<span class="admin-tag">Admin</span>` : ""}
          </a>
          <button id="logout-btn" class="btn btn-ghost" title="Log out" aria-label="Log out">Log Out</button>
        </div>
      </header>
      <main id="main-content" class="main-content"></main>
    </div>
  `;
  document.getElementById("logout-btn").addEventListener("click", () => signOut());
  wireToolSwitch();
  document.getElementById("search-btn").addEventListener("click", openSearch);
  contentFn(document.getElementById("main-content"));
}

function paint(route, seq, fn) {
  if (seq !== renderSeq) return false;
  let container;
  renderShell(route, (c) => (container = c));
  fn(container);
  return true;
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
    </div>
  `;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    btn.disabled = true;
    const { error } = await signIn(
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value
    );
    if (error) {
      errorEl.textContent = error.message;
      btn.disabled = false;
    }
  });
}

// ============================================================
// DASHBOARD
// ============================================================
function isStale(m) {
  if (m.status === "Sold" || m.status === "Not Interested") return false;
  const last = m.last_contact || m.created_at;
  return last && Date.now() - new Date(last).getTime() > STALE_DAYS * 86400000;
}

async function renderDashboard(route, seq) {
  let meisters, rollups, myFus;
  try {
    [meisters, rollups, myFus] = await Promise.all([listMeisters(), listMeisterRollups(currentProfile.id), listMyFollowUps(currentProfile.id).catch(() => [])]);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load meisters: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  meisters.forEach((m) => Object.assign(m, rollups[m.id] || { last_contact: null, interaction_count: 0, guest_count: 0, my_follow_up: null }));

  const counts = { total: meisters.length, overdue: 0, stale: 0 };
  ALL_STATUSES.forEach((s) => (counts[s] = 0));
  meisters.forEach((m) => {
    counts[m.status] = (counts[m.status] || 0) + 1;
    if (m.my_follow_up && followUpState(m.my_follow_up.due_at) === "overdue") counts.overdue++;
    if (isStale(m)) counts.stale++;
  });
  // New and Contacted always; an old stage only shows while a Meister still has it
  const shownStatuses = ALL_STATUSES.filter((s) => STATUSES.includes(s) || counts[s] > 0);

  // Today panel: what needs attention right now, for the signed-in user.
  const pendingFus = myFus.filter((f) => !f.done_at);
  const overdueFus = pendingFus.filter((f) => followUpState(f.due_at) === "overdue");
  const todayFus = pendingFus.filter((f) => followUpState(f.due_at) === "today");
  const staleList = meisters.filter(isStale).sort((a, b) => ((a.last_contact || a.created_at) < (b.last_contact || b.created_at) ? -1 : 1));
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();
  const firstName = (currentProfile.full_name || "").split(/\s+/)[0];
  const todayEmpty = !overdueFus.length && !todayFus.length && !myUnread.length && !staleList.length;

  container.innerHTML = `
    <div class="page-header">
      <h1>Meisters</h1>
      <div class="page-actions">
        <a href="#/import" class="btn btn-ghost">${I.upload} Import</a>
        <button id="export-btn" class="btn btn-ghost">${I.download} Export to Excel</button>
        <button id="new-meister-btn" class="btn btn-primary">${I.plus} Add Meister</button>
      </div>
    </div>

    <div class="today-panel">
      <div class="today-head">
        <div><h2>${greeting}${firstName ? ", " + escapeHtml(firstName) : ""}</h2><span class="muted">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div>
        ${todayEmpty ? `<span class="today-clear">${I.check} You're all caught up</span>` : ""}
      </div>
      ${todayEmpty ? "" : `<div class="today-grid">
        ${overdueFus.length ? `<div class="today-col">
          <div class="today-lbl fu-overdue">${I.alert} Overdue (${overdueFus.length})</div>
          ${overdueFus.slice(0, 5).map((f) => `<a href="#/meister/${f.meister_id}" class="today-row"><span class="today-title">${escapeHtml(f.title)}</span><span class="muted">${escapeHtml(f.meisters?.name || "")} · ${fmtDateTime(f.due_at)}</span></a>`).join("")}
          ${overdueFus.length > 5 ? `<a href="#/followups" class="today-more">+${overdueFus.length - 5} more</a>` : ""}
        </div>` : ""}
        ${todayFus.length ? `<div class="today-col">
          <div class="today-lbl fu-today">${I.calendar} Due today (${todayFus.length})</div>
          ${todayFus.slice(0, 5).map((f) => `<a href="#/meister/${f.meister_id}" class="today-row"><span class="today-title">${escapeHtml(f.title)}</span><span class="muted">${escapeHtml(f.meisters?.name || "")} · ${fmtTime(f.due_at)}</span></a>`).join("")}
          ${todayFus.length > 5 ? `<a href="#/followups" class="today-more">+${todayFus.length - 5} more</a>` : ""}
        </div>` : ""}
        ${myUnread.length ? `<div class="today-col">
          <div class="today-lbl">${I.bell} New activity (${myUnread.length})</div>
          ${[...new Set(myUnread.map((n) => n.meister_id))].slice(0, 5).map((id) => { const m = meisters.find((x) => x.id === id); return m ? `<a href="#/meister/${id}" class="today-row"><span class="today-title"><span class="unread-dot"></span>${escapeHtml(m.name)}</span><span class="muted">${escapeHtml(m.dealership || "")}</span></a>` : ""; }).join("")}
          <a href="#/notifications" class="today-more">All notifications</a>
        </div>` : ""}
        ${staleList.length ? `<div class="today-col">
          <div class="today-lbl st-stale">${I.clock} Going quiet (${staleList.length})</div>
          ${staleList.slice(0, 5).map((m) => `<a href="#/meister/${m.id}" class="today-row"><span class="today-title">${escapeHtml(m.name)}</span><span class="muted">${m.last_contact ? "last contact " + relativeTime(m.last_contact) : "never contacted"} · ${escapeHtml(m.concierge || "unassigned")}</span></a>`).join("")}
          ${staleList.length > 5 ? `<button class="today-more link-btn" data-status="__stale">See all ${staleList.length}</button>` : ""}
        </div>` : ""}
      </div>`}
    </div>

    <div class="kpi-strip">
      <button class="kpi ${dashState.status === "" ? "active" : ""}" data-status=""><span class="kpi-num">${counts.total}</span><span class="kpi-label">Total</span></button>
      ${shownStatuses.map(
        (s) => `<button class="kpi ${dashState.status === s ? "active" : ""}" data-status="${s}"><span class="kpi-num st-${slug(s)}">${counts[s]}</span><span class="kpi-label">${s}</span></button>`
      ).join("")}
      <button class="kpi kpi-alert ${dashState.status === "__overdue" ? "active" : ""}" data-status="__overdue"><span class="kpi-num">${counts.overdue}</span><span class="kpi-label">My overdue</span></button>
      <button class="kpi kpi-stale ${dashState.status === "__stale" ? "active" : ""}" data-status="__stale" title="No contact in ${STALE_DAYS}+ days"><span class="kpi-num">${counts.stale}</span><span class="kpi-label">Going quiet</span></button>
    </div>

    <div class="filters">
      <div class="search-box">${I.search}<input id="search-input" type="text" placeholder="Search name, title, dealership, city, phone, email…" value="${escapeAttr(dashState.q)}" /></div>
      <select id="status-filter">
        <option value="">All Statuses</option>
        ${shownStatuses.map((s) => `<option ${dashState.status === s ? "selected" : ""}>${s}</option>`).join("")}
        <option value="__overdue" ${dashState.status === "__overdue" ? "selected" : ""}>My overdue follow-ups</option>
        <option value="__stale" ${dashState.status === "__stale" ? "selected" : ""}>Going quiet (${STALE_DAYS}+ days)</option>
      </select>
      <select id="concierge-filter">
        <option value="">All Concierges</option>
        ${CONCIERGES.map((c) => `<option ${dashState.concierge === c ? "selected" : ""}>${c}</option>`).join("")}
        <option value="__none" ${dashState.concierge === "__none" ? "selected" : ""}>Unassigned</option>
      </select>
    </div>

    <div class="table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            ${th("name", "Name")}
            ${th("dealership", "Dealership")}
            ${th("concierge", "Concierge")}
            ${th("status", "Status")}
            ${th("follow_up", "My Follow-Up")}
            ${th("last_contact", "Last Contact")}
            ${th("updated", "Updated")}
          </tr>
        </thead>
        <tbody id="meister-rows"></tbody>
      </table>
      <div id="empty-state" class="empty-state" style="display:none">No meisters match your filters.</div>
    </div>
  `;

  document.getElementById("new-meister-btn").addEventListener("click", () => navigate("#/meister/new"));
  document.getElementById("export-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await exportToExcel(currentProfile.id);
      toast("Export downloaded");
    } catch (err) {
      toast("Export failed: " + err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  const searchInput = document.getElementById("search-input");
  const statusFilter = document.getElementById("status-filter");
  const conciergeFilter = document.getElementById("concierge-filter");
  const draw = () => { drawMeisterRows(meisters); updateKpiCounts(); saveState("dash", dashState); };

  // Tiles count what the search and Concierge filter currently show. The status
  // tiles are the status filter, so each one shows how many you'd get by clicking it.
  function updateKpiCounts() {
    const q = dashState.q.toLowerCase().trim();
    const base = meisters.filter((m) =>
      (!q || [m.name, m.job_title, m.dealership, m.city, m.phone, m.email, m.concierge].some((f) => (f || "").toLowerCase().includes(q))) &&
      (!dashState.concierge || (dashState.concierge === "__none" ? !m.concierge : m.concierge === dashState.concierge)));
    const n = { "": base.length,
      __overdue: base.filter((m) => m.my_follow_up && followUpState(m.my_follow_up.due_at) === "overdue").length,
      __stale: base.filter(isStale).length };
    container.querySelectorAll(".kpi-strip .kpi").forEach((k) => {
      const st = k.dataset.status;
      const v = st in n ? n[st] : base.filter((m) => m.status === st).length;
      const num = k.querySelector(".kpi-num");
      if (num) num.textContent = v;
    });
    const filtered = !!(q || dashState.concierge);
    const totalLabel = container.querySelector('.kpi-strip .kpi[data-status=""] .kpi-label');
    if (totalLabel) totalLabel.textContent = filtered ? "Total · filtered" : "Total";
  }

  searchInput.addEventListener("input", () => { dashState.q = searchInput.value; draw(); });
  statusFilter.addEventListener("change", () => { dashState.status = statusFilter.value; syncKpis(); draw(); });
  conciergeFilter.addEventListener("change", () => { dashState.concierge = conciergeFilter.value; draw(); });
  container.querySelectorAll(".kpi, .today-more[data-status]").forEach((k) =>
    k.addEventListener("click", () => {
      dashState.status = k.dataset.status;
      statusFilter.value = dashState.status;
      syncKpis();
      draw();
      if (k.classList.contains("today-more")) document.querySelector(".table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
    })
  );
  container.querySelectorAll("th[data-sort]").forEach((h) =>
    h.addEventListener("click", () => {
      const key = h.dataset.sort;
      if (dashState.sort === key) dashState.dir = dashState.dir === "asc" ? "desc" : "asc";
      else {
        dashState.sort = key;
        dashState.dir = ["name", "dealership", "concierge", "status", "follow_up"].includes(key) ? "asc" : "desc";
      }
      container.querySelectorAll("th[data-sort]").forEach((x) => (x.innerHTML = thInner(x.dataset.sort, x.dataset.label)));
      draw();
    })
  );

  function syncKpis() {
    container.querySelectorAll(".kpi").forEach((k) => k.classList.toggle("active", k.dataset.status === dashState.status));
  }
  draw();
}

function th(key, label) {
  return `<th data-sort="${key}" data-label="${label}" class="sortable">${thInner(key, label)}</th>`;
}
function thInner(key, label) {
  const active = dashState.sort === key;
  return `<span>${label}</span><span class="sort-ic ${active ? "on" : ""}">${active ? (dashState.dir === "asc" ? I.up : I.down) : I.sort}</span>`;
}

function drawMeisterRows(meisters) {
  const q = dashState.q.toLowerCase().trim();
  const filtered = meisters.filter((m) => {
    const matchesQuery =
      !q ||
      [m.name, m.job_title, m.dealership, m.city, m.phone, m.email, m.concierge].some((f) => (f || "").toLowerCase().includes(q));
    const matchesStatus =
      !dashState.status ||
      (dashState.status === "__overdue"
        ? m.my_follow_up && followUpState(m.my_follow_up.due_at) === "overdue"
        : dashState.status === "__stale"
        ? isStale(m)
        : m.status === dashState.status);
    const matchesConcierge =
      !dashState.concierge || (dashState.concierge === "__none" ? !m.concierge : m.concierge === dashState.concierge);
    return matchesQuery && matchesStatus && matchesConcierge;
  });

  const dir = dashState.dir === "asc" ? 1 : -1;
  const keyFn = {
    name: (m) => (m.name || "").toLowerCase(),
    dealership: (m) => (m.dealership || "").toLowerCase(),
    concierge: (m) => (m.concierge || "").toLowerCase(),
    status: (m) => ALL_STATUSES.indexOf(m.status),
    follow_up: (m) => m.my_follow_up?.due_at || "",
    last_contact: (m) => m.last_contact || "",
    updated: (m) => m.updated_at || "",
  }[dashState.sort];
  filtered.sort((a, b) => {
    const ka = keyFn(a), kb = keyFn(b);
    if (ka === "" && kb !== "") return 1;
    if (kb === "" && ka !== "") return -1;
    return ka < kb ? -dir : ka > kb ? dir : 0;
  });

  const tbody = document.getElementById("meister-rows");
  const emptyState = document.getElementById("empty-state");
  emptyState.style.display = filtered.length ? "none" : "block";
  const unreadMeisters = new Set(myUnread.map((n) => n.meister_id));
  tbody.innerHTML = filtered
    .map(
      (m) => `
      <tr class="clickable-row" data-id="${m.id}">
        <td class="cell-name">
          <div>${unreadMeisters.has(m.id) ? `<span class="unread-dot" title="New activity"></span>` : ""}${escapeHtml(m.name)}</div>
          <div class="muted cell-sub">${escapeHtml(m.job_title || formatPhone(m.phone) || m.email || "")}</div>
        </td>
        <td>${escapeHtml(m.dealership || "—")}${m.city ? `<div class="muted cell-sub">${escapeHtml([m.city, m.state].filter(Boolean).join(", "))}</div>` : ""}</td>
        <td>${escapeHtml(m.concierge || "—")}</td>
        <td><span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span></td>
        <td>${m.my_follow_up ? followUpChip(m.my_follow_up.due_at) + `<div class="muted cell-sub">${escapeHtml(m.my_follow_up.title)}</div>` : `<span class="muted">—</span>`}</td>
        <td>${m.last_contact ? `<div>${isStale(m) ? `<span class="stale-dot" title="No contact in ${STALE_DAYS}+ days"></span>` : ""}${relativeTime(m.last_contact)}</div><div class="muted cell-sub">${m.interaction_count} logged</div>` : `<span class="muted">${isStale(m) ? `<span class="stale-dot" title="Never contacted"></span>` : ""}Never</span>`}</td>
        <td class="muted">${relativeTime(m.updated_at)}</td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".clickable-row").forEach((row) =>
    row.addEventListener("click", () => navigate(`#/meister/${row.dataset.id}`))
  );
}

// ============================================================
// ACTIVITY LOG (team-wide)
// ============================================================
async function renderActivity(route, seq) {
  let notes, doneFus, commentCounts;
  try {
    [notes, doneFus, commentCounts] = await Promise.all([listRecentActivity(300), listRecentDoneFollowUps(300), listCommentCounts()]);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load activity: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  // One feed: logged conversations + completed follow-ups, newest first.
  const activity = [
    ...notes.map((n) => ({ type: "note", time: n.occurred_at, person: n.created_by_name, method: n.method, direction: n.direction, meister_id: n.meister_id, meisterName: n.meisters?.name, note: n.note, id: n.id, category_id: n.category_id })),
    ...doneFus.map((f) => ({ type: "fu", time: f.done_at, person: f.user_name, method: "__fu", meister_id: f.meister_id, meisterName: f.meisters?.name, title: f.title, due_at: f.due_at, id: f.id })),
  ].sort((a, b) => (a.time < b.time ? 1 : -1));

  const people = [...new Set(activity.map((a) => a.person).filter(Boolean))].sort();

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Activity Log</h1><p class="muted">Every conversation the team has logged, most recent first.</p></div>
    </div>
    <div class="filters">
      <div class="search-box">${I.search}<input id="act-search" type="text" placeholder="Search notes or meister names…" value="${escapeAttr(actState.q)}" /></div>
      <select id="act-person">
        <option value="">Everyone</option>
        ${people.map((p) => `<option ${actState.person === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
      </select>
      <select id="act-direction">
        <option value="">Inbound + outbound</option>
        ${DIRECTIONS.map((d) => `<option ${actState.direction === d ? "selected" : ""}>${d}</option>`).join("")}
      </select>
      <select id="act-category">
        <option value="">All question types</option>
        ${categories.filter((c) => c.active).map((c) => `<option value="${c.id}" ${actState.category === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        <option value="__none" ${actState.category === "__none" ? "selected" : ""}>No type selected</option>
      </select>
    </div>
    <div class="filter-chips" id="act-chips" style="margin-bottom:16px">
      <button class="chip ${!actState.method ? "active" : ""}" data-method="">All</button>
      ${METHODS.map((m) => `<button class="chip ${actState.method === m ? "active" : ""}" data-method="${m}">${METHOD_ICON[m]} ${m}</button>`).join("")}
      <button class="chip ${actState.method === "__fu" ? "active" : ""}" data-method="__fu">${I.check} Follow-ups done</button>
    </div>
    <div id="act-feed"></div>
  `;

  const draw = () => {
    saveState("act", actState);
    const q = actState.q.toLowerCase().trim();
    const list = activity.filter(
      (a) =>
        (!actState.method || a.method === actState.method) &&
        (!actState.person || a.person === actState.person) &&
        (!actState.direction || a.direction === actState.direction) &&
        (!actState.category || (a.type === "note" && (actState.category === "__none" ? !a.category_id : a.category_id === actState.category))) &&
        (!q || (a.note || a.title || "").toLowerCase().includes(q) || (a.meisterName || "").toLowerCase().includes(q))
    );
    const feed = document.getElementById("act-feed");
    if (!list.length) {
      feed.innerHTML = `<div class="empty-state">${activity.length ? "Nothing matches those filters." : "No activity logged yet. Notes your team adds will show up here."}</div>`;
      return;
    }
    feed.innerHTML = groupBy(list, (a) => dayLabel(a.time))
      .map(
        ([label, items]) => `
        <div class="group-label">${escapeHtml(label)}</div>
        <div class="activity-feed">
          ${items
            .map((a) => {
              if (a.type === "fu") {
                return `
            <div class="activity-item">
              <span class="method-badge method-followup">${I.check} Follow-up</span>
              <div class="activity-body">
                <div class="activity-top">
                  <a href="#/meister/${a.meister_id}" class="activity-meister">${escapeHtml(a.meisterName || "Unknown Meister")}</a>
                  <span class="muted">completed by ${escapeHtml(a.person || "someone")}</span>
                  <span class="muted activity-time">${fmtTime(a.time)}</span>
                </div>
                <div class="activity-note">${escapeHtml(a.title)} <span class="muted">· was due ${fmtDateTime(a.due_at)}</span></div>
              </div>
            </div>`;
              }
              const n = commentCounts[a.id] || 0;
              const cat = catById(a.category_id);
              return `
            <div class="activity-item">
              <span class="method-badge method-${slug(a.method)}">${METHOD_ICON[a.method] || ""} ${escapeHtml(a.method)}</span>
              <div class="activity-body">
                <div class="activity-top">
                  <a href="#/meister/${a.meister_id}" class="activity-meister">${escapeHtml(a.meisterName || "Unknown Meister")}</a>
                  ${directionChip(a.direction)}
                  ${cat ? `<span class="cat-chip has static">${I.tag} ${escapeHtml(cat.name)}</span>` : ""}
                  <span class="muted">by ${escapeHtml(a.person || "someone")}</span>
                  ${n ? `<a href="#/meister/${a.meister_id}" class="comment-count">${I.reply} ${n} ${n === 1 ? "comment" : "comments"}</a>` : ""}
                  <span class="muted activity-time">${fmtTime(a.time)}</span>
                </div>
                <div class="activity-note">${escapeHtml(a.note)}</div>
              </div>
            </div>`;
            })
            .join("")}
        </div>`
      )
      .join("");
  };

  document.getElementById("act-search").addEventListener("input", (e) => { actState.q = e.target.value; draw(); });
  document.getElementById("act-person").addEventListener("change", (e) => { actState.person = e.target.value; draw(); });
  document.getElementById("act-direction").addEventListener("change", (e) => { actState.direction = e.target.value; draw(); });
  document.getElementById("act-category").addEventListener("change", (e) => { actState.category = e.target.value; draw(); });
  container.querySelectorAll("#act-chips .chip").forEach((c) =>
    c.addEventListener("click", () => {
      actState.method = c.dataset.method;
      container.querySelectorAll("#act-chips .chip").forEach((x) => x.classList.toggle("active", x === c));
      draw();
    })
  );
  draw();
}

// ============================================================
// FOLLOW-UPS PAGE (mine only)
// ============================================================
async function renderFollowUpsPage(route, seq) {
  let all;
  try {
    all = await listMyFollowUps(currentProfile.id);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load follow-ups: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const pending = all.filter((f) => !f.done_at);
  const done = all.filter((f) => f.done_at).sort((a, b) => (a.done_at < b.done_at ? 1 : -1)).slice(0, 50);
  const overdue = pending.filter((f) => followUpState(f.due_at) === "overdue");

  container.innerHTML = `
    <div class="page-header">
      <div><h1>My Follow-Ups</h1><p class="muted">Only the follow-ups you've set, across every Meister.${overdue.length ? ` <span class="fu-overdue">${overdue.length} overdue.</span>` : ""}</p></div>
      <div class="page-actions">
        <button id="toggle-done-btn" class="btn btn-ghost">${fuPageState.showDone ? "Hide completed" : `Show completed (${done.length})`}</button>
      </div>
    </div>

    ${
      pending.length
        ? groupBy(pending, (f) => fuGroupLabel(f.due_at))
            .map(
              ([label, items]) => `
          <div class="group-label ${label === "Overdue" ? "fu-overdue" : ""}">${escapeHtml(label)}</div>
          <div class="fu-list">${items.map((f) => (fuPageState.editingId === f.id ? fuFormHtml(f, f.meisters?.name) : fuRowHtml(f, f.meisters?.name, true))).join("")}</div>`
            )
            .join("")
        : `<div class="empty-state">Nothing pending. Set a follow-up when you log an activity on a Meister, or from their Activity tab.</div>`
    }

    ${
      fuPageState.showDone && done.length
        ? `<div class="group-label" style="margin-top:28px">Completed</div>
           <div class="fu-list">${done.map((f) => fuRowHtml(f, f.meisters?.name, true)).join("")}</div>`
        : ""
    }
  `;

  document.getElementById("toggle-done-btn").addEventListener("click", () => {
    fuPageState.showDone = !fuPageState.showDone;
    render();
  });
  wireFollowUpControls(container, {
    onEdit: (id) => { fuPageState.editingId = id; render(); },
    onCancel: () => { fuPageState.editingId = null; render(); },
    afterSave: () => { fuPageState.editingId = null; },
  });
}

function fuGroupLabel(iso) {
  const s = followUpState(iso);
  if (s === "overdue") return "Overdue";
  if (s === "today") return "Today";
  const d = new Date(iso);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  const week = new Date(); week.setDate(week.getDate() + 7);
  if (d < week) return "This week";
  return "Later";
}

// ---------- follow-up rows/forms (shared by Follow-Ups page and Meister page) ----------
function canManageFu(f) {
  return f.user_id === currentProfile.id || isAdmin();
}

function fuRowHtml(f, meisterName, showMeister) {
  const st = f.done_at ? "done" : followUpState(f.due_at);
  const mine = canManageFu(f);
  return `
    <div class="fu-row ${f.done_at ? "is-done" : ""}" data-id="${f.id}" data-due-at="${escapeAttr(f.due_at)}">
      ${mine ? `<button class="fu-check ${f.done_at ? "on" : ""}" data-fu-toggle="${f.id}" data-done="${f.done_at ? "1" : "0"}" title="${f.done_at ? "Mark not done" : "Mark done"}">${f.done_at ? I.check : ""}</button>` : `<span class="fu-check static"></span>`}
      <div class="fu-body">
        <div class="fu-title">${escapeHtml(f.title)}</div>
        <div class="fu-meta">
          <span class="fu-chip fu-${st}">${I.calendar} ${f.done_at ? "Done " + fmtDateTime(f.done_at) : fmtDateTime(f.due_at)}</span>
          ${showMeister && meisterName ? `<a href="#/meister/${f.meister_id}" class="fu-meister">${escapeHtml(meisterName)}</a>` : ""}
          ${!showMeister || f.user_id !== currentProfile.id ? `<span class="muted">${escapeHtml(f.user_name || "")}</span>` : ""}
        </div>
      </div>
      <div class="fu-actions">
        ${!f.done_at ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${escapeAttr(outlookLink(f, meisterName))}" title="Open a pre-filled Outlook event">${I.calendarPlus} Outlook</a>
        <a class="icon-btn" download="${escapeAttr(slug(f.title) || "follow-up")}.ics" href="${escapeAttr(icsLink(f, meisterName))}" title="Download .ics for desktop Outlook">${I.download}</a>` : ""}
        ${mine && !f.done_at ? `<span class="snooze-group" title="Snooze"><button class="btn btn-ghost btn-sm" data-fu-snooze="${f.id}" data-days="1">+1d</button><button class="btn btn-ghost btn-sm" data-fu-snooze="${f.id}" data-days="7">+1w</button></span>` : ""}
        ${mine ? `<button class="icon-btn" data-fu-edit="${f.id}" title="Edit">${I.edit}</button>
        <button class="icon-btn danger" data-fu-delete="${f.id}" title="Delete">${I.trash}</button>` : ""}
      </div>
    </div>`;
}

function fuFormHtml(existing, meisterName) {
  const p = existing ? `fue-${existing.id}-` : "fu-";
  const title = dv(`${p}title`, existing ? existing.title : "");
  const when = dv(`${p}when`, toLocalInput(existing ? existing.due_at : defaultFollowUpTime()));
  return `
    <form class="composer fu-form" data-prefix="${p}" data-edit-id="${existing ? existing.id : ""}">
      <div class="fu-form-grid">
        <input id="${p}title" data-draft placeholder="Follow-up title, e.g. Call about allocation" value="${escapeAttr(title)}" required />
        <input id="${p}when" data-draft type="datetime-local" value="${escapeAttr(when)}" required />
      </div>
      ${meisterName ? `<div class="muted" style="margin-top:6px">For ${escapeHtml(meisterName)}</div>` : ""}
      <div class="composer-actions">
        <button type="button" class="btn cancel-fu-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">${existing ? "Save changes" : "Set follow-up"}</button>
      </div>
    </form>`;
}

function wireFollowUpControls(container, { onEdit, onCancel, afterSave, meisterId }) {
  container.querySelectorAll("[data-fu-toggle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const wasDone = b.dataset.done === "1";
      try {
        await updateFollowUp(b.dataset.fuToggle, { done_at: wasDone ? null : new Date().toISOString() });
        toast(wasDone ? "Marked not done" : "Follow-up done");
        render();
      } catch (err) {
        toast("Couldn't update: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll("[data-fu-snooze]").forEach((b) =>
    b.addEventListener("click", async () => {
      const days = Number(b.dataset.days);
      const row = b.closest("[data-id]");
      try {
        // Push from today (not from an overdue date) so a snooze always lands in the future, keeping the original time of day.
        const cur = row?.dataset.dueAt ? new Date(row.dataset.dueAt) : new Date();
        const base = cur < new Date() ? new Date() : cur;
        const next = new Date(base); next.setDate(next.getDate() + days);
        next.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
        await updateFollowUp(b.dataset.fuSnooze, { due_at: next.toISOString() });
        toast(`Snoozed to ${fmtDateTime(next.toISOString())}`);
        render();
      } catch (err) {
        toast("Couldn't snooze: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll("[data-fu-edit]").forEach((b) => b.addEventListener("click", () => onEdit(b.dataset.fuEdit)));
  container.querySelectorAll("[data-fu-delete]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this follow-up?")) return;
      try {
        await deleteFollowUp(b.dataset.fuDelete);
        toast("Follow-up deleted");
        render();
      } catch (err) {
        toast("Couldn't delete: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll(".fu-form").forEach((form) => {
    const prefix = form.dataset.prefix;
    const editId = form.dataset.editId;
    form.querySelector(".cancel-fu-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      onCancel(editId);
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById(`${prefix}title`).value.trim();
      const due_at = fromLocalInput(document.getElementById(`${prefix}when`).value);
      if (!title || !due_at) return;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (editId) {
          await updateFollowUp(editId, { title, due_at });
          toast("Follow-up updated");
        } else {
          await addFollowUp({ meister_id: meisterId, title, due_at }, currentProfile.full_name, currentProfile.id);
          toast("Follow-up set");
        }
        clearDrafts(prefix);
        afterSave(editId);
        render();
      } catch (err) {
        toast("Couldn't save: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });
}

// ---------- calendar links ----------
function crmLink(meisterId) {
  return `${location.origin}${location.pathname}#/meister/${meisterId}`;
}
function outlookLink(f, meisterName) {
  const start = new Date(f.due_at);
  const end = new Date(start.getTime() + 30 * 60000);
  const u = new URL("https://outlook.office.com/calendar/0/deeplink/compose");
  u.searchParams.set("subject", `${f.title}${meisterName ? " — " + meisterName : ""}`);
  u.searchParams.set("startdt", start.toISOString());
  u.searchParams.set("enddt", end.toISOString());
  u.searchParams.set("body", `GR GT CRM follow-up${meisterName ? " for " + meisterName : ""}\n${crmLink(f.meister_id)}`);
  u.searchParams.set("path", "/calendar/action/compose");
  u.searchParams.set("rru", "addevent");
  return u.toString();
}
function icsLink(f, meisterName) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(f.due_at);
  const end = new Date(start.getTime() + 30 * 60000);
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GR GT Concierge CRM//EN",
    "BEGIN:VEVENT",
    `UID:${f.id}@gr-gt-crm`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(f.title + (meisterName ? " — " + meisterName : ""))}`,
    `DESCRIPTION:${esc("GR GT CRM follow-up" + (meisterName ? " for " + meisterName : "") + "\n" + crmLink(f.meister_id))}`,
    `URL:${crmLink(f.meister_id)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(f.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
}
function defaultFollowUpTime() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

// ============================================================
// QUESTION CATEGORIES (shared helpers)
// ============================================================
function wireCategorySelects(container) {
  container.querySelectorAll(".cat-select").forEach((sel) =>
    sel.addEventListener("change", async () => {
      const id = sel.dataset.note;
      const val = sel.value || null;
      sel.disabled = true;
      try {
        await setInteractionCategory(id, val);
        toast(val ? `Type set: ${catById(val)?.name || ""}` : "Type cleared");
        render();
      } catch (err) {
        toast("Couldn't update type: " + err.message, "error");
        sel.disabled = false;
      }
    })
  );
}

// ============================================================
// ANALYTICS DASHBOARD
// ============================================================
const METHOD_COLOR = { Phone: "#2d6cdf", Text: "#7a3de0", Email: "#e0263f", "In Person": "#1f9d5c", Other: "#55555d" };
const STATUS_COLOR = { New: "#9a9aa2", Contacted: "#f5a623", Engaged: "#f5764a", Sold: "#3ddc84", "Not Interested": "#6b6b73" };

function anaRange() {
  const now = new Date();
  const startOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  let from = null, to = null;
  switch (anaState.range) {
    case "7d": from = startOf(new Date(now - 6 * 86400000)); break;
    case "30d": from = startOf(new Date(now - 29 * 86400000)); break;
    case "90d": from = startOf(new Date(now - 89 * 86400000)); break;
    case "month": from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "lastmonth": from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "ytd": from = new Date(now.getFullYear(), 0, 1); break;
    case "custom":
      if (anaState.from) from = parseDateOnly(anaState.from);
      if (anaState.to) { to = parseDateOnly(anaState.to); to.setDate(to.getDate() + 1); }
      break;
  }
  return { from, to };
}

async function renderAnalyticsPage(route, seq) {
  let d;
  try {
    d = await fetchAnalyticsData();
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load analytics: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const { from, to } = anaRange();
  const inWindow = (iso) => { const t = new Date(iso); return (!from || t >= from) && (!to || t < to); };
  const concOf = (m) => (m?.concierge || "");
  const conciergeOk = (c) => !anaState.concierge || c === anaState.concierge;

  // Team map: who logged it → which concierge name (falls back to display name)
  const loggerName = (i) => {
    const p = d.team.find((t) => t.id === i.created_by);
    return p?.concierge || p?.full_name || i.created_by_name || "Unknown";
  };

  const ints = d.interactions.filter((i) => inWindow(i.occurred_at) && conciergeOk(concOf(i.meisters)));
  const meisters = d.meisters.filter((m) => conciergeOk(m.concierge));
  const guests = d.guests.filter((g) => g.purchase_date && inWindow(g.purchase_date + "T12:00:00") && conciergeOk(concOf(g.meisters)));
  const delivered = d.guests.filter((g) => g.delivery_date && inWindow(g.delivery_date + "T12:00:00") && conciergeOk(concOf(g.meisters)));
  const fus = d.followUps.filter((f) => conciergeOk(concOf(f.meisters)));
  const history = (d.statusHistory || []).filter((h) => h.from_status && inWindow(h.changed_at) && conciergeOk(concOf(h.meisters)));

  // ---- previous period (same length, immediately before) for comparison ----
  let prev = null;
  if (from && anaState.compare) {
    const end = to || new Date();
    const len = end - from;
    const pFrom = new Date(from.getTime() - len), pTo = from;
    const inPrev = (iso) => { const t = new Date(iso); return t >= pFrom && t < pTo; };
    const pInts = d.interactions.filter((i) => inPrev(i.occurred_at) && conciergeOk(concOf(i.meisters)));
    prev = {
      ints: pInts.length,
      contacted: new Set(pInts.map((i) => i.meister_id)).size,
      inbound: pInts.filter((i) => i.direction === "Inbound").length,
      sales: d.guests.filter((g) => g.purchase_date && inPrev(g.purchase_date + "T12:00:00") && conciergeOk(concOf(g.meisters))).length,
      delivered: d.guests.filter((g) => g.delivery_date && inPrev(g.delivery_date + "T12:00:00") && conciergeOk(concOf(g.meisters))).length,
      label: `${fmtDate(pFrom.toISOString())} – ${fmtDate(new Date(pTo - 1).toISOString())}`,
    };
  }
  const delta = (cur, before) => {
    if (!prev) return "";
    const diff = cur - before;
    const pct = before ? Math.round((diff / before) * 100) : null;
    const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    return `<span class="kpi-delta ${cls}" title="vs previous period (${escapeAttr(prev.label)})">${diff > 0 ? "▲" : diff < 0 ? "▼" : "•"} ${diff > 0 ? "+" : ""}${diff}${pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}</span>`;
  };

  // ---- KPIs ----
  const contactedIds = new Set(ints.map((i) => i.meister_id));
  const weekEnd = endOfWeek(new Date());
  const dueThisWeek = fus.filter((f) => new Date(f.due_at) <= weekEnd);
  const inbound = ints.filter((i) => i.direction === "Inbound");
  const outbound = ints.filter((i) => i.direction === "Outbound");
  const byDirection = [
    { key: "Inbound", label: "Inbound (they reached out)", value: inbound.length, color: "#3ddc84" },
    { key: "Outbound", label: "Outbound (we reached out)", value: outbound.length, color: "#2d6cdf" },
    { key: "__none", label: "Not recorded", value: ints.length - inbound.length - outbound.length, color: "#55555d" },
  ].filter((x) => x.value);

  // ---- heatmap: weekday x hour ----
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const i of ints) { const t = new Date(i.occurred_at); heat[t.getDay()][t.getHours()]++; }
  const heatMax = Math.max(1, ...heat.flat());

  // ---- time series ----
  const spanDays = from ? Math.max(1, Math.round(((to || new Date()) - from) / 86400000)) : dataSpanDays(ints.map((i) => i.occurred_at));
  const bucket = spanDays <= 31 ? "day" : spanDays <= 182 ? "week" : "month";
  const series = timeSeries(ints.map((i) => i.occurred_at), bucket, from, to);

  // ---- breakdowns ----
  const byMethod = METHODS.map((m) => ({ key: m, label: m, value: ints.filter((i) => i.method === m).length, color: METHOD_COLOR[m] })).filter((x) => x.value);
  const conciergeNames = [...new Set([...CONCIERGES, ...ints.map(loggerName)])];
  const byConcierge = conciergeNames.map((c) => {
    const mine = ints.filter((i) => loggerName(i) === c);
    return { key: c, label: c, value: mine.length, parts: METHODS.map((m) => ({ m, n: mine.filter((i) => i.method === m).length })) };
  }).filter((x) => x.value || CONCIERGES.includes(x.key));
  const byCat = categories.map((c) => ({ key: c.id, label: c.name, value: ints.filter((i) => i.category_id === c.id).length, active: c.active })).filter((x) => x.value || x.active).sort((a, b) => b.value - a.value);
  const untyped = ints.filter((i) => !i.category_id || !catById(i.category_id)).length;
  // ---- going quiet: days since each Meister's last conversation (all time, not just the range) ----
  const lastTalk = {};
  for (const i of d.interactions) if (!lastTalk[i.meister_id] || i.occurred_at > lastTalk[i.meister_id]) lastTalk[i.meister_id] = i.occurred_at;
  const daysSince = (m) => (lastTalk[m.id] ? Math.floor((Date.now() - new Date(lastTalk[m.id])) / 86400000) : null);
  const quiet = [
    { key: "q14", label: "14 to 29 days", color: "#f5a623", test: (n) => n != null && n >= 14 && n < 30 },
    { key: "q30", label: "30 to 59 days", color: "#f5764a", test: (n) => n != null && n >= 30 && n < 60 },
    { key: "q60", label: "60+ days", color: "#e0263f", test: (n) => n != null && n >= 60 },
    { key: "never", label: "Never contacted", color: "#6b6b73", test: (n) => n == null },
  ].map((b) => ({ ...b, items: meisters.filter((m) => b.test(daysSince(m))).map((m) => ({ ...m, days: daysSince(m), last: lastTalk[m.id] })).sort((x, y) => (y.days ?? 1e9) - (x.days ?? 1e9)) }))
   .filter((b) => b.key !== "never" || b.items.length);
  const recentlyTalked = meisters.filter((m) => { const n = daysSince(m); return n != null && n < 14; }).length;

  // ---- vehicles: all guests for these Meisters (not limited to the range) ----
  const allG = d.guests.filter((g) => conciergeOk(concOf(g.meisters)));
  const soldAll = allG.filter((g) => g.purchase_date);
  const deliveredAll = allG.filter((g) => g.delivery_date);
  const awaiting = soldAll.filter((g) => !g.delivery_date);
  // chart starts at the first sale or delivery: at least 6 months, at most 12
  const firstG = [...soldAll.map((g) => g.purchase_date), ...deliveredAll.map((g) => g.delivery_date)].sort()[0];
  const nowD = new Date();
  const monthsBack = firstG ? (nowD.getFullYear() - Number(firstG.slice(0, 4))) * 12 + nowD.getMonth() - (Number(firstG.slice(5, 7)) - 1) + 1 : 6;
  const nMonths = Math.max(6, Math.min(12, monthsBack));
  const salesSeries = monthlySeries(soldAll.map((g) => g.purchase_date + "T12:00:00"), nMonths);
  const deliverySeries = monthlySeries(deliveredAll.map((g) => g.delivery_date + "T12:00:00"), nMonths);
  const recentSales = soldAll.slice().sort((a, b) => (b.purchase_date || "").localeCompare(a.purchase_date || "")).slice(0, 3);
  const engaged = groupBy(ints, (i) => i.meister_id)
    .map(([id, items]) => ({ id, name: items[0].meisters?.name || "Unknown", dealership: items[0].meisters?.dealership, status: items[0].meisters?.status, n: items.length, last: items[0].occurred_at }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  // ---- follow-up counters ----
  const now = new Date();
  const buckets = [
    { key: "overdue", label: "Overdue", test: (t) => t < now },
    { key: "week", label: "This week", test: (t) => t >= now && t <= endOfWeek(now) },
    { key: "nextweek", label: "Next week", test: (t) => t > endOfWeek(now) && t <= endOfWeek(addDays(endOfWeek(now), 1)) },
    { key: "month", label: "This month", test: (t) => t >= now && t <= endOfMonth(now) },
    { key: "nextmonth", label: "Next month", test: (t) => t > endOfMonth(now) && t <= endOfMonth(addDays(endOfMonth(now), 1)) },
  ].map((b) => ({ ...b, items: fus.filter((f) => b.test(new Date(f.due_at))) }));

  const rangeLabel = { all: "All time", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", month: "This month", lastmonth: "Last month", ytd: "Year to date", custom: "Custom range" }[anaState.range];

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Analytics</h1><p class="muted">${escapeHtml(rangeLabel)}${anaState.concierge ? " · " + escapeHtml(anaState.concierge) + "'s Meisters" : ""}. Click any number, bar, or row to see what's behind it.</p></div>
      <div class="page-actions">
        <button id="ana-print-btn" class="btn btn-ghost" title="Print or save as PDF">${I.print} Print report</button>
        <button id="ana-export-btn" class="btn btn-ghost">${I.download} Export to Excel</button>
        ${isAdmin() ? `<a href="#/account" class="btn btn-ghost">${I.tag} Manage question types</a>` : ""}
      </div>
    </div>
    <div class="print-head">
      <div class="brand"><span class="brand-dot"></span><span>GR GT Concierge CRM</span></div>
      <h1>Analytics report</h1>
      <p>${escapeHtml(rangeLabel)}${from ? ` (${fmtDate(from.toISOString())} – ${fmtDate((to ? new Date(to - 1) : new Date()).toISOString())})` : ""}${anaState.concierge ? " · " + escapeHtml(anaState.concierge) + "'s Meisters" : ""} · generated ${fmtDateTime(new Date().toISOString())} by ${escapeHtml(currentProfile.full_name || "")}</p>
    </div>

    <div class="filters">
      <select id="ana-range">
        ${[["7d","Last 7 days"],["30d","Last 30 days"],["90d","Last 90 days"],["month","This month"],["lastmonth","Last month"],["ytd","Year to date"],["all","All time"],["custom","Custom range…"]]
          .map(([v, l]) => `<option value="${v}" ${anaState.range === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      ${anaState.range === "custom" ? `<input id="ana-from" type="date" value="${escapeAttr(anaState.from)}" /><input id="ana-to" type="date" value="${escapeAttr(anaState.to)}" />` : ""}
      <select id="ana-concierge">
        <option value="">All concierges</option>
        ${CONCIERGES.map((c) => `<option ${anaState.concierge === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
      ${from ? `<label class="pref-row inline"><input type="checkbox" id="ana-compare" ${anaState.compare ? "checked" : ""} /> Compare to previous period</label>` : ""}
    </div>

    <div class="kpi-strip kpi-strip-5">
      <button class="kpi drill" data-drill="ints"><span class="kpi-num">${ints.length}</span><span class="kpi-label">Conversations logged</span>${delta(ints.length, prev?.ints)}</button>
      <button class="kpi drill" data-drill="contacted"><span class="kpi-num">${contactedIds.size}</span><span class="kpi-label">Meisters contacted <span class="muted">of ${meisters.length}</span></span>${delta(contactedIds.size, prev?.contacted)}</button>
      <button class="kpi drill" data-drill="dir:Inbound"><span class="kpi-num st-sold">${inbound.length}</span><span class="kpi-label">Inbound <span class="muted">${ints.length ? Math.round((inbound.length / ints.length) * 100) + "% of logged" : ""}</span></span>${delta(inbound.length, prev?.inbound)}</button>
      <button class="kpi drill" data-drill="sales"><span class="kpi-num st-sold">${guests.length}</span><span class="kpi-label">Vehicles sold (guest orders)</span>${delta(guests.length, prev?.sales)}</button>
      <button class="kpi drill" data-drill="fu:week"><span class="kpi-num ${dueThisWeek.some((f) => new Date(f.due_at) < now) ? "st-not-interested" : ""}">${dueThisWeek.length}</span><span class="kpi-label">Follow-ups due by end of week</span></button>
    </div>
    ${prev ? `<p class="muted compare-note">Deltas compare to the previous ${escapeHtml(prev.label)}.</p>` : ""}

    <div class="ana-grid">
      <div class="card ana-span-8">
        <div class="card-head"><h3>${I.chart} Activity over time</h3><span class="muted">${bucket === "day" ? "Daily" : bucket === "week" ? "Weekly" : "Monthly"} · ${ints.length} total</span></div>
        ${ints.length ? barChartSvg(series, { drillPrefix: "bucket" }) : `<div class="empty-state">No activity in this range.</div>`}
      </div>
      <div class="card ana-span-4">
        <div class="card-head"><h3>Interactions by type</h3></div>
        ${byMethod.length ? donutSvg(byMethod, "method") : `<div class="empty-state">Nothing yet.</div>`}
      </div>

      <div class="card ana-span-4">
        <div class="card-head"><h3>${I.inbound} Inbound vs outbound</h3><span class="muted">who reached out</span></div>
        ${byDirection.length ? donutSvg(byDirection, "dir") : `<div class="empty-state">Nothing yet.</div>`}
      </div>

      <div class="card ana-span-8">
        <div class="card-head"><h3>${I.clock} When Meisters are talking to us</h3><span class="muted">conversations by weekday and hour</span></div>
        ${ints.length ? heatmapHtml(heat, heatMax) : `<div class="empty-state">No activity in this range.</div>`}
      </div>

      <div class="card ana-span-4">
        <div class="card-head"><h3>Activity by concierge</h3><span class="muted">logged by</span></div>
        <div class="stack-list">
          ${byConcierge.map((c) => `
            <button class="stack-row drill" data-drill="logger:${escapeAttr(c.key)}">
              <span class="stack-label">${escapeHtml(c.label)}</span>
              <span class="stack-track">${c.parts.filter((p) => p.n).map((p) => `<span class="stack-seg" style="width:${(p.n / Math.max(1, c.value)) * 100}%;background:${METHOD_COLOR[p.m]}" title="${p.m}: ${p.n}"></span>`).join("")}</span>
              <span class="bar-val">${c.value}</span>
            </button>`).join("") || `<div class="empty-state">Nothing yet.</div>`}
        </div>
        <div class="legend">${METHODS.map((m) => `<span class="legend-item"><span class="legend-dot" style="background:${METHOD_COLOR[m]}"></span>${m}</span>`).join("")}</div>
      </div>

      <div class="card ana-span-4">
        <div class="card-head"><h3>${I.tag} Question types</h3><span class="muted">${ints.length - untyped} typed</span></div>
        <div class="bar-chart">
          ${byCat.map((c) => `
            <button class="bar-row drill" data-drill="cat:${c.key}">
              <span class="bar-label">${escapeHtml(c.label)}${c.active ? "" : ` <span class="muted">(retired)</span>`}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${(c.value / Math.max(1, ...byCat.map((x) => x.value), untyped)) * 100}%"></span></span>
              <span class="bar-val">${c.value}</span>
            </button>`).join("")}
          <button class="bar-row bar-none drill" data-drill="cat:__none"><span class="bar-label">No type selected</span><span class="bar-track"><span class="bar-fill" style="width:${(untyped / Math.max(1, ...byCat.map((x) => x.value), untyped)) * 100}%"></span></span><span class="bar-val">${untyped}</span></button>
        </div>
      </div>

      <div class="card ana-span-4">
        <div class="card-head"><h3>${I.clock} Going quiet</h3><span class="muted">time since last conversation</span></div>
        <div class="bar-chart">
          ${quiet.map((b) => `
            <button class="bar-row drill" data-drill="quiet:${b.key}">
              <span class="bar-label">${escapeHtml(b.label)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${(b.items.length / Math.max(1, ...quiet.map((x) => x.items.length))) * 100}%;background:${b.color}"></span></span>
              <span class="bar-val">${b.items.length}</span>
            </button>`).join("")}
        </div>
        <p class="muted quiet-note">${recentlyTalked} of ${meisters.length} Meisters talked to in the last 2 weeks.</p>
      </div>

      <div class="card ana-span-7">
        <div class="card-head"><h3>${I.chart} Vehicles sold & delivered</h3><span class="muted">all time · guests</span></div>
        <div class="veh-kpis">
          <button class="veh-kpi drill" data-drill="gall:sold"><b class="st-sold">${soldAll.length}</b><span>Sold</span></button>
          <button class="veh-kpi drill" data-drill="gall:awaiting"><b>${awaiting.length}</b><span>In production</span></button>
          <button class="veh-kpi drill" data-drill="gall:delivered"><b>${deliveredAll.length}</b><span>Delivered</span></button>
        </div>
        ${lineChartSvg(salesSeries, { drillPrefix: "salesmonth", second: deliverySeries, secondPrefix: "delivmonth" })}
        <div class="legend"><span class="legend-item"><span class="legend-dot" style="background:#e0263f"></span>Sold per month</span><span class="legend-item"><span class="legend-dot" style="background:#3ddc84"></span>Delivered per month</span></div>
        ${recentSales.length ? `<div class="veh-recent"><div class="veh-recent-h">Latest orders</div>${recentSales.map((g) => `<a href="#/meister/${g.meister_id}" class="mini-row"><span>${escapeHtml(g.guest_name)}<span class="muted"> · ${escapeHtml(g.vehicle_purchased || "—")} · via ${escapeHtml(g.meisters?.name || "")}</span></span><span class="muted">${fmtDate(g.purchase_date)}${g.delivery_date ? " · delivered" : ""}</span></a>`).join("")}</div>` : ""}
      </div>

      <div class="card ana-span-5">
        <div class="card-head"><h3>Most engaged Meisters</h3><span class="muted">by conversations in range</span></div>
        <div class="rank-list">
          ${engaged.map((m, idx) => `
            <button class="rank-row drill" data-drill="meister:${m.id}">
              <span class="rank-num">${idx + 1}</span>
              <span class="rank-body"><span class="rank-name">${escapeHtml(m.name)}</span><span class="muted">${escapeHtml(m.dealership || "")} · last ${relativeTime(m.last)}</span></span>
              <span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status || "")}</span>
              <span class="bar-val">${m.n}</span>
            </button>`).join("") || `<div class="empty-state">No conversations in this range.</div>`}
        </div>
      </div>

      <div class="card ana-span-12">
        <div class="card-head"><h3>${I.bell} Upcoming follow-ups</h3><span class="muted">team-wide, pending</span></div>
        <div class="fu-counters">
          ${buckets.map((b) => `
            <button class="fu-counter drill ${b.key === "overdue" && b.items.length ? "alert" : ""}" data-drill="fu:${b.key}">
              <span class="kpi-num">${b.items.length}</span>
              <span class="kpi-label">${b.label}</span>
              <span class="fu-counter-sub muted">${CONCIERGES.map((c) => `${c} ${b.items.filter((f) => f.user_name && f.user_name.toLowerCase().startsWith(c.toLowerCase())).length}`).join(" · ")}</span>
            </button>`).join("")}
        </div>
      </div>
    </div>
  `;

  // ---- wiring ----
  document.getElementById("ana-range").addEventListener("change", (e) => { anaState.range = e.target.value; anaState.drill = null; render(); });
  document.getElementById("ana-from")?.addEventListener("change", (e) => { anaState.from = e.target.value; render(); });
  document.getElementById("ana-to")?.addEventListener("change", (e) => { anaState.to = e.target.value; render(); });
  document.getElementById("ana-concierge").addEventListener("change", (e) => { anaState.concierge = e.target.value; anaState.drill = null; render(); });
  document.getElementById("ana-compare")?.addEventListener("change", (e) => { anaState.compare = e.target.checked; render(); });
  document.getElementById("ana-print-btn").addEventListener("click", () => { anaState.drill = null; document.getElementById("drawer-root")?.replaceChildren(); window.print(); });
  saveState("ana", { ...anaState, drill: null });
  document.getElementById("ana-export-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await exportToExcel(currentProfile.id); toast("Export downloaded"); }
    catch (err) { toast("Export failed: " + err.message, "error"); }
    finally { btn.disabled = false; }
  });
  container.querySelectorAll(".drill").forEach((el) =>
    el.addEventListener("click", () => { anaState.drill = el.dataset.drill; renderDrawer(); })
  );

  // ---- drawer (drill-down) ----
  const allGuests = d.guests.filter((g) => conciergeOk(concOf(g.meisters)));
  const ctx = { quiet, soldAll, deliveredAll, awaiting, ints, meisters, guests, allGuests, delivered, fus, series, salesSeries, deliverySeries, buckets, loggerName, byCat, history, heat };
  function renderDrawer() {
    let root = document.getElementById("drawer-root");
    if (!root) { root = document.createElement("div"); root.id = "drawer-root"; document.body.appendChild(root); }
    if (!anaState.drill) { root.innerHTML = ""; return; }
    const { title, sub, html, csv } = drillContent(anaState.drill, ctx);
    root.innerHTML = `
      <div class="drawer-backdrop"></div>
      <aside class="drawer">
        <div class="drawer-head">
          <div><h2>${title}</h2>${sub ? `<div class="muted">${sub}</div>` : ""}</div>
          <div class="page-actions">
            ${csv ? `<button id="drawer-csv" class="btn btn-ghost btn-sm">${I.download} CSV</button>` : ""}
            <button id="drawer-close" class="icon-btn" title="Close">${I.x}</button>
          </div>
        </div>
        <div class="drawer-body">${html}</div>
      </aside>`;
    const close = () => { anaState.drill = null; root.innerHTML = ""; };
    root.querySelector(".drawer-backdrop").addEventListener("click", close);
    root.querySelector("#drawer-close").addEventListener("click", close);
    root.querySelector("#drawer-csv")?.addEventListener("click", () => downloadCsv(csv.name, csv.rows));
    root.querySelectorAll(".drawer a[href^='#/']").forEach((a) => a.addEventListener("click", close));
    wireCategorySelects(root);
    wireFollowUpControls(root, { onEdit: () => {}, onCancel: () => {}, afterSave: () => {} });
  }
  renderDrawer();
}

// Builds the content for a drill-down key like "cat:<id>", "fu:week", "bucket:3"
function drillContent(key, ctx) {
  const [kind, arg] = key.split(/:(.*)/s);
  const intsList = (rows, title, sub) => ({
    title, sub: sub || `${rows.length} ${rows.length === 1 ? "conversation" : "conversations"}`,
    html: rows.length ? `<div class="notes-list">${rows.map(drillNoteHtml).join("")}</div>` : `<div class="empty-state">Nothing here.</div>`,
    csv: { name: slug(title) + ".csv", rows: rows.map((r) => ({ Meister: r.meisters?.name || "", Method: r.method, Direction: r.direction || "", "Question Type": catById(r.category_id)?.name || "", "Date/Time": fmtDateTime(r.occurred_at), "Logged By": r.created_by_name || "", Note: r.note })) },
  });
  const meisterList = (rows, title) => ({
    title, sub: `${rows.length} ${rows.length === 1 ? "Meister" : "Meisters"}`,
    html: rows.length ? `<div class="mini-list">${rows.map((m) => `<a href="#/meister/${m.id}" class="mini-row"><span>${escapeHtml(m.name)}<span class="muted"> · ${escapeHtml(m.dealership || "")}</span></span><span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status || "")}</span></a>`).join("")}</div>` : `<div class="empty-state">Nothing here.</div>`,
    csv: { name: slug(title) + ".csv", rows: rows.map((m) => ({ Name: m.name, Dealership: m.dealership || "", Status: m.status, Concierge: m.concierge || "" })) },
  });
  const fuList = (rows, title) => ({
    title, sub: `${rows.length} pending`,
    html: rows.length ? `<div class="fu-list">${rows.map((f) => fuRowHtml(f, f.meisters?.name, true)).join("")}</div>` : `<div class="empty-state">Nothing here.</div>`,
    csv: { name: slug(title) + ".csv", rows: rows.map((f) => ({ Title: f.title, Meister: f.meisters?.name || "", Due: fmtDateTime(f.due_at), Owner: f.user_name || "" })) },
  });

  switch (kind) {
    case "ints": return intsList(ctx.ints, "All conversations in range");
    case "contacted": return meisterList(ctx.meisters.filter((m) => ctx.ints.some((i) => i.meister_id === m.id)), "Meisters contacted in range");
    case "sales": {
      const rows = ctx.guests;
      return {
        title: "Vehicles sold (guest purchases)", sub: `${rows.length} in range`,
        html: rows.length ? `<div class="mini-list">${rows.map((g) => `<a href="#/meister/${g.meister_id}" class="mini-row"><span>${escapeHtml(g.guest_name)}<span class="muted"> · ${escapeHtml(g.vehicle_purchased || "—")} · via ${escapeHtml(g.meisters?.name || "")}</span></span><span class="muted">${fmtDate(g.purchase_date)}</span></a>`).join("")}</div>` : `<div class="empty-state">No purchases in this range.</div>`,
        csv: { name: "vehicles-sold.csv", rows: rows.map((g) => ({ Guest: g.guest_name, Vehicle: g.vehicle_purchased || "", "Purchase Date": g.purchase_date, Meister: g.meisters?.name || "", Notes: g.notes || "" })) },
      };
    }
    case "salesmonth": {
      const pt = ctx.salesSeries[Number(arg)];
      const rows = pt ? ctxGuestsInMonth(ctx, pt) : [];
      return {
        title: `Vehicles sold — ${pt ? pt.label : ""}`, sub: `${rows.length} purchases`,
        html: rows.length ? `<div class="mini-list">${rows.map((g) => `<a href="#/meister/${g.meister_id}" class="mini-row"><span>${escapeHtml(g.guest_name)}<span class="muted"> · ${escapeHtml(g.vehicle_purchased || "—")} · via ${escapeHtml(g.meisters?.name || "")}</span></span><span class="muted">${fmtDate(g.purchase_date)}</span></a>`).join("")}</div>` : `<div class="empty-state">No purchases that month.</div>`,
        csv: { name: "vehicles-sold-month.csv", rows: rows.map((g) => ({ Guest: g.guest_name, Vehicle: g.vehicle_purchased || "", "Purchase Date": g.purchase_date, Meister: g.meisters?.name || "" })) },
      };
    }
    case "bucket": {
      const pt = ctx.series[Number(arg)];
      const rows = pt ? ctx.ints.filter((i) => { const t = new Date(i.occurred_at); return t >= pt.start && t < pt.end; }) : [];
      return intsList(rows, `Activity — ${pt ? pt.label : ""}`);
    }
    case "method": return intsList(ctx.ints.filter((i) => i.method === arg), `${arg} interactions`);
    case "dir": return intsList(ctx.ints.filter((i) => (arg === "__none" ? !i.direction : i.direction === arg)), arg === "__none" ? "Direction not recorded" : `${arg} conversations`);
    case "heat": {
      const [dIdx, hIdx] = arg.split(":").map(Number);
      const rows = ctx.ints.filter((i) => { const t = new Date(i.occurred_at); return t.getDay() === dIdx && t.getHours() === hIdx; });
      return intsList(rows, `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dIdx]}s around ${hourLabel(hIdx)}`);
    }
    case "delivmonth": {
      const pt = ctx.deliverySeries[Number(arg)];
      const rows = pt ? ctx.allGuests.filter((g) => g.delivery_date && (() => { const t = new Date(g.delivery_date + "T12:00:00"); return t >= pt.start && t < pt.end; })()) : [];
      return {
        title: `Delivered — ${pt ? pt.label : ""}`, sub: `${rows.length} deliveries`,
        html: rows.length ? `<div class="mini-list">${rows.map((g) => `<a href="#/meister/${g.meister_id}" class="mini-row"><span>${escapeHtml(g.guest_name)}<span class="muted"> · ${escapeHtml(g.vehicle_purchased || "—")} · via ${escapeHtml(g.meisters?.name || "")}</span></span><span class="muted">${fmtMonth(g.delivery_date)}</span></a>`).join("")}</div>` : `<div class="empty-state">No deliveries that month.</div>`,
        csv: { name: "delivered-month.csv", rows: rows.map((g) => ({ Guest: g.guest_name, Vehicle: g.vehicle_purchased || "", "Delivery Date": g.delivery_date, Meister: g.meisters?.name || "" })) },
      };
    }
    case "quiet": {
      const b = ctx.quiet.find((x) => x.key === arg);
      const rows = b ? b.items : [];
      return {
        title: `Going quiet — ${b ? b.label : ""}`, sub: `${rows.length} ${rows.length === 1 ? "Meister" : "Meisters"}`,
        html: rows.length ? `<div class="mini-list">${rows.map((m) => `<a href="#/meister/${m.id}" class="mini-row"><span>${escapeHtml(m.name)}<span class="muted"> · ${escapeHtml(m.dealership || "")}${m.concierge ? " · " + escapeHtml(m.concierge) : ""}</span></span><span class="muted">${m.last ? `last ${fmtDate(m.last)} (${m.days} days)` : "never"}</span></a>`).join("")}</div>` : `<div class="empty-state">Nobody here.</div>`,
        csv: { name: "going-quiet.csv", rows: rows.map((m) => ({ Name: m.name, Dealership: m.dealership || "", Concierge: m.concierge || "", "Last Conversation": m.last ? fmtDate(m.last) : "Never", "Days Since": m.days ?? "" })) },
      };
    }
    case "gall": {
      const rows = arg === "delivered" ? ctx.deliveredAll : arg === "awaiting" ? ctx.awaiting : ctx.soldAll;
      const title = arg === "delivered" ? "Delivered (all time)" : arg === "awaiting" ? "In production (sold, not yet delivered)" : "Vehicles sold (all time)";
      return {
        title, sub: `${rows.length} ${rows.length === 1 ? "guest" : "guests"}`,
        html: rows.length ? `<div class="mini-list">${rows.map((g) => `<a href="#/meister/${g.meister_id}" class="mini-row"><span>${escapeHtml(g.guest_name)}<span class="muted"> · ${escapeHtml(g.vehicle_purchased || "—")} · via ${escapeHtml(g.meisters?.name || "")}</span></span><span class="muted">${g.purchase_date ? fmtDate(g.purchase_date) : ""}${g.delivery_date ? " → " + fmtMonth(g.delivery_date) : ""}</span></a>`).join("")}</div>` : `<div class="empty-state">Nothing here.</div>`,
        csv: { name: slug(title) + ".csv", rows: rows.map((g) => ({ Guest: g.guest_name, Vehicle: g.vehicle_purchased || "", "Purchase Date": g.purchase_date || "", "Delivery Date": g.delivery_date || "", Meister: g.meisters?.name || "" })) },
      };
    }
    case "logger": return intsList(ctx.ints.filter((i) => ctx.loggerName(i) === arg), `Logged by ${arg}`);
    case "status": return meisterList(ctx.meisters.filter((m) => m.status === arg), `Meisters — ${arg}`);
    case "meister": {
      const rows = ctx.ints.filter((i) => i.meister_id === arg);
      const m = rows[0]?.meisters;
      return { ...intsList(rows, m?.name || "Meister"), sub: `${rows.length} conversations in range · <a href="#/meister/${arg}">open profile</a>` };
    }
    case "cat": {
      const isNone = arg === "__none";
      const rows = ctx.ints.filter((i) => (isNone ? !i.category_id || !catById(i.category_id) : i.category_id === arg));
      const name = isNone ? "No type selected" : catById(arg)?.name || "Question type";
      return {
        title: name, sub: `${rows.length} ${rows.length === 1 ? "conversation" : "conversations"}`,
        html: insightDetailHtml(name, rows, isNone),
        csv: { name: slug(name) + ".csv", rows: rows.map((r) => ({ Meister: r.meisters?.name || "", Method: r.method, "Date/Time": fmtDateTime(r.occurred_at), "Logged By": r.created_by_name || "", Note: r.note })) },
      };
    }
    case "fu": {
      const b = ctx.buckets.find((x) => x.key === arg);
      return fuList(b ? b.items : [], `Follow-ups — ${b ? b.label : ""}`);
    }
  }
  return { title: "Details", html: `<div class="empty-state">Nothing here.</div>` };
}

function ctxGuestsInMonth(ctx, pt) {
  return ctx.allGuests.filter((g) => g.purchase_date && (() => { const t = new Date(g.purchase_date + "T12:00:00"); return t >= pt.start && t < pt.end; })());
}

function drillNoteHtml(r) {
  return `
    <div class="note-card">
      <div class="note-top">
        <span class="method-badge method-${slug(r.method)}">${METHOD_ICON[r.method] || ""} ${escapeHtml(r.method)}</span>
        ${directionChip(r.direction)}
        ${categorySelectHtml(r)}
        <a href="#/meister/${r.meister_id}" class="activity-meister">${escapeHtml(r.meisters?.name || "Unknown")}</a>
        <span class="muted">${escapeHtml(r.created_by_name || "someone")} &middot; ${fmtDateTime(r.occurred_at)}</span>
      </div>
      <div class="note-text">${escapeHtml(r.note)}</div>
    </div>`;
}

// ---- series builders ----
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function endOfWeek(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); x.setDate(x.getDate() + (6 - x.getDay())); return x; }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function dataSpanDays(isos) {
  if (!isos.length) return 30;
  const min = Math.min(...isos.map((s) => new Date(s).getTime()));
  return Math.max(7, Math.round((Date.now() - min) / 86400000) + 1);
}
function timeSeries(isos, bucket, from, to) {
  const end = to || new Date(Date.now() + 1);
  let start = from;
  if (!start) { start = isos.length ? new Date(Math.min(...isos.map((s) => new Date(s).getTime()))) : addDays(new Date(), -29); }
  start = new Date(start); start.setHours(0, 0, 0, 0);
  if (bucket === "week") start.setDate(start.getDate() - start.getDay());
  if (bucket === "month") start.setDate(1);
  const pts = [];
  let cur = new Date(start);
  let guard = 0;
  while (cur < end && guard++ < 400) {
    const next = new Date(cur);
    if (bucket === "day") next.setDate(next.getDate() + 1);
    else if (bucket === "week") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    const label = bucket === "month" ? cur.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : cur.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
    pts.push({ start: cur, end: next, label, value: 0 });
    cur = next;
  }
  for (const s of isos) {
    const t = new Date(s);
    const p = pts.find((x) => t >= x.start && t < x.end);
    if (p) p.value++;
  }
  return pts;
}
function monthlySeries(isos, months) {
  const pts = [];
  const now = new Date();
  for (let k = months - 1; k >= 0; k--) {
    const s = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - k + 1, 1);
    pts.push({ start: s, end: e, label: s.toLocaleDateString(undefined, { month: "short", year: k >= 12 - now.getMonth() ? "2-digit" : undefined }), value: 0 });
  }
  for (const iso of isos) {
    const t = new Date(iso);
    const p = pts.find((x) => t >= x.start && t < x.end);
    if (p) p.value++;
  }
  return pts;
}

function hourLabel(h) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
}
function heatmapHtml(heat, max) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const shown = hours.filter((h) => h >= 6 && h <= 21); // working hours; anything outside is folded into the edges
  const val = (dIdx, h) => (h === 6 ? heat[dIdx].slice(0, 7).reduce((a, b) => a + b, 0) : h === 21 ? heat[dIdx].slice(21).reduce((a, b) => a + b, 0) : heat[dIdx][h]);
  const order = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  return `
    <div class="heatmap" style="grid-template-columns: 44px repeat(${shown.length}, 1fr)">
      <div></div>${shown.map((h) => `<div class="heat-h">${h % 3 === 0 ? hourLabel(h) : ""}</div>`).join("")}
      ${order.map((dIdx) => `<div class="heat-d">${days[dIdx]}</div>${shown.map((h) => { const v = val(dIdx, h); return `<button class="heat-cell drill" data-drill="heat:${dIdx}:${h}" style="--a:${v ? 0.15 + 0.85 * (v / max) : 0}" title="${days[dIdx]} ${hourLabel(h)}${h === 6 ? " and earlier" : h === 21 ? " and later" : ""}: ${v}">${v || ""}</button>`; }).join("")}`).join("")}
    </div>`;
}

// ---- SVG charts (theme-native, no library) ----
function barChartSvg(pts, { drillPrefix } = {}) {
  const W = 800, H = 260, padL = 34, padR = 10, padT = 18, padB = 34;
  const max = Math.max(1, ...pts.map((p) => p.value));
  const n = pts.length;
  const cw = (W - padL - padR) / n;
  const bw = Math.max(2, Math.min(28, cw * 0.62));
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = niceTicks(max, 4);
  const labelEvery = Math.ceil(n / 12);
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Activity over time">
      ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${t}</text>`).join("")}
      ${pts.map((p, i) => {
        const x = padL + i * cw + (cw - bw) / 2;
        return `<g class="bar-g ${drillPrefix ? "drill" : ""}" ${drillPrefix ? `data-drill="${drillPrefix}:${i}"` : ""}>
          <rect x="${padL + i * cw}" y="${padT}" width="${cw}" height="${H - padT - padB}" class="hit"/>
          <rect x="${x}" y="${y(p.value)}" width="${bw}" height="${Math.max(0, H - padB - y(p.value))}" rx="2" class="bar"/>
          ${p.value ? `<text x="${x + bw / 2}" y="${y(p.value) - 5}" class="val" text-anchor="middle">${p.value}</text>` : ""}
          ${i % labelEvery === 0 ? `<text x="${padL + i * cw + cw / 2}" y="${H - padB + 16}" class="tick" text-anchor="middle">${escapeHtml(p.label)}</text>` : ""}
          <title>${escapeHtml(p.label)}: ${p.value}</title>
        </g>`;
      }).join("")}
    </svg>`;
}

function lineChartSvg(pts, { drillPrefix, second = null, secondPrefix = null } = {}) {
  const W = 800, H = 240, padL = 34, padR = 16, padT = 18, padB = 34;
  const max = Math.max(1, ...pts.map((p) => p.value), ...(second || []).map((p) => p.value));
  const n = pts.length;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1);
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = niceTicks(max, 4);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${path} L${x(n - 1)},${H - padB} L${x(0)},${H - padB} Z`;
  const path2 = second ? second.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ") : "";
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">
      <defs><linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e0263f" stop-opacity="0.35"/><stop offset="1" stop-color="#e0263f" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${t}</text>`).join("")}
      <path d="${area}" fill="url(#areaGrad)"/>
      <path d="${path}" class="line"/>
      ${second ? `<path d="${path2}" class="line line2"/>` : ""}
      ${pts.map((p, i) => `<g class="pt-g ${drillPrefix ? "drill" : ""}" ${drillPrefix ? `data-drill="${drillPrefix}:${i}"` : ""}>
        <rect x="${x(i) - (W - padL - padR) / Math.max(1, n - 1) / 2}" y="${padT}" width="${(W - padL - padR) / Math.max(1, n - 1)}" height="${H - padT - padB}" class="hit"/>
        <circle cx="${x(i)}" cy="${y(p.value)}" r="4" class="dot"/>
        ${p.value ? `<text x="${x(i)}" y="${y(p.value) - 9}" class="val" text-anchor="middle">${p.value}</text>` : ""}
        <text x="${x(i)}" y="${H - padB + 16}" class="tick" text-anchor="middle">${escapeHtml(p.label)}</text>
        <title>${escapeHtml(p.label)}: ${p.value}</title>
      </g>`).join("")}
      ${second ? second.map((p, i) => `<g class="pt-g pt-g2 ${secondPrefix ? "drill" : ""}" ${secondPrefix ? `data-drill="${secondPrefix}:${i}"` : ""}><circle cx="${x(i)}" cy="${y(p.value)}" r="6" class="dot dot2"/>${p.value ? `<text x="${x(i)}" y="${y(p.value) + 18}" class="val val2" text-anchor="middle">${p.value}</text>` : ""}<title>Delivered ${escapeHtml(p.label)}: ${p.value}</title></g>`).join("") : ""}
    </svg>`;
}

function donutSvg(parts, drillPrefix) {
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;
  const R = 60, r = 38, cx = 80, cy = 80;
  let a0 = -Math.PI / 2;
  const segs = parts.map((p) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const P = (ang, rad) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const d = p.value === total
      ? `M${cx},${cy - R} A${R},${R} 0 1 1 ${cx - 0.01},${cy - R} L${cx - 0.01},${cy - r} A${r},${r} 0 1 0 ${cx},${cy - r} Z`
      : `M${P(a0, R)} A${R},${R} 0 ${large} 1 ${P(a1, R)} L${P(a1, r)} A${r},${r} 0 ${large} 0 ${P(a0, r)} Z`;
    const s = `<path d="${d}" fill="${p.color}" class="seg drill" data-drill="${drillPrefix}:${escapeAttr(p.key)}"><title>${escapeHtml(p.label)}: ${p.value} (${Math.round((p.value / total) * 100)}%)</title></path>`;
    a0 = a1;
    return s;
  });
  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 160 160" class="donut" role="img" aria-label="Interactions by type">
        ${segs.join("")}
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-num">${total}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-lbl">total</text>
      </svg>
      <div class="legend legend-col">
        ${parts.map((p) => `<button class="legend-item drill" data-drill="${drillPrefix}:${escapeAttr(p.key)}"><span class="legend-dot" style="background:${p.color}"></span>${escapeHtml(p.label)}<span class="muted"> · ${p.value} (${Math.round((p.value / total) * 100)}%)</span></button>`).join("")}
      </div>
    </div>`;
}

function niceTicks(max, count) {
  const raw = Math.max(1, max / count); // counts: never sub-integer ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < max) out.push(Math.ceil(max / step) * step);
  return out;
}

function downloadCsv(name, rows) {
  if (!rows.length) return toast("Nothing to export", "error");
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + csv);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

function insightDetailHtml(name, rows, isUncategorized) {
  if (!rows.length) return `<div class="empty-state">No entries for <strong>${escapeHtml(name)}</strong> in this range.</div>`;

  const byMeister = groupBy(rows, (r) => r.meister_id).map(([id, items]) => ({ id, name: items[0].meisters?.name || "Unknown", dealership: items[0].meisters?.dealership, n: items.length })).sort((a, b) => b.n - a.n);
  const byPerson = groupBy(rows, (r) => r.created_by_name || "someone").map(([p, items]) => ({ p, n: items.length })).sort((a, b) => b.n - a.n);
  const byMethod = groupBy(rows, (r) => r.method).map(([m, items]) => ({ m, n: items.length })).sort((a, b) => b.n - a.n);

  // weekly trend, last 8 weeks
  const weeks = [];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay() - 7 * 7);
  for (let w = 0; w < 8; w++) {
    const s = new Date(start); s.setDate(s.getDate() + w * 7);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    weeks.push({ s, n: rows.filter((r) => { const t = new Date(r.occurred_at); return t >= s && t < e; }).length });
  }
  const wmax = Math.max(1, ...weeks.map((w) => w.n));

  return `
    <div class="ins-detail-head">
      <h3>${I.tag} ${escapeHtml(name)}</h3>
      <span class="muted">${rows.length} ${rows.length === 1 ? "entry" : "entries"}</span>
    </div>
    ${isUncategorized ? `<p class="muted">These were logged without a question type. Set one below to include them in the report.</p>` : ""}

    <div class="ins-grid">
      <div>
        <div class="group-label" style="margin-top:0">Who's asking</div>
        <div class="mini-list">${byMeister.slice(0, 8).map((m) => `<a href="#/meister/${m.id}" class="mini-row"><span>${escapeHtml(m.name)}${m.dealership ? `<span class="muted"> · ${escapeHtml(m.dealership)}</span>` : ""}</span><strong>${m.n}</strong></a>`).join("")}${byMeister.length > 8 ? `<div class="muted">+${byMeister.length - 8} more</div>` : ""}</div>
      </div>
      <div>
        <div class="group-label" style="margin-top:0">Logged by</div>
        <div class="mini-list">${byPerson.map((p) => `<div class="mini-row"><span>${escapeHtml(p.p)}</span><strong>${p.n}</strong></div>`).join("")}</div>
        <div class="group-label">By method</div>
        <div class="mini-list">${byMethod.map((x) => `<div class="mini-row"><span class="method-badge method-${slug(x.m)}">${METHOD_ICON[x.m] || ""} ${escapeHtml(x.m)}</span><strong>${x.n}</strong></div>`).join("")}</div>
      </div>
    </div>

    <div class="group-label">Last 8 weeks</div>
    <div class="spark">${weeks.map((w) => `<div class="spark-col" title="Week of ${fmtDate(w.s.toISOString())}: ${w.n}"><div class="spark-bar" style="height:${(w.n / wmax) * 100}%"></div><span class="spark-lbl">${w.s.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span></div>`).join("")}</div>

    <div class="group-label">Notes</div>
    <div class="notes-list">
      ${rows
        .map(
          (r) => `
        <div class="note-card">
          <div class="note-top">
            <span class="method-badge method-${slug(r.method)}">${METHOD_ICON[r.method] || ""} ${escapeHtml(r.method)}</span>
            ${categorySelectHtml(r)}
            <a href="#/meister/${r.meister_id}" class="activity-meister">${escapeHtml(r.meisters?.name || "Unknown")}</a>
            <span class="muted">${escapeHtml(r.created_by_name || "someone")} &middot; ${fmtDateTime(r.occurred_at)}</span>
          </div>
          <div class="note-text">${escapeHtml(r.note)}</div>
        </div>`
        )
        .join("")}
    </div>`;
}

// ============================================================
// NOTIFICATIONS PAGE
// ============================================================
async function renderNotificationsPage(route, seq) {
  let items;
  try {
    items = await listNotifications(currentProfile.id, 150);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load notifications: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const unread = items.filter((n) => !n.read_at);
  const linked = !!currentProfile.concierge;

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Notifications</h1>
        <p class="muted">${
          linked
            ? `Activity by teammates on Meisters assigned to <strong>${escapeHtml(currentProfile.concierge)}</strong>, plus any comment that @mentions you. ${unread.length ? unread.length + " unread." : "You're caught up."}`
            : `Your login isn't linked to a Concierge name yet, so only @mentions reach you here. Your admin can link it (see README).`
        }</p>
      </div>
      <div class="page-actions">
        ${unread.length ? `<button id="mark-all-btn" class="btn btn-ghost">${I.check} Mark all read</button>` : ""}
        <a href="#/account" class="btn btn-ghost">Preferences</a>
      </div>
    </div>
    ${
      items.length
        ? groupBy(items, (n) => dayLabel(n.created_at))
            .map(
              ([label, group]) => `
          <div class="group-label">${escapeHtml(label)}</div>
          <div class="notif-list">
            ${group
              .map(
                (n) => `
              <a href="#/meister/${n.meister_id}" class="notif ${n.read_at ? "" : "unread"}" data-id="${n.id}">
                <span class="notif-ic ${n.kind === "mention" ? "mention" : ""}">${n.kind === "comment" ? I.reply : n.kind === "mention" ? "@" : I.note}</span>
                <span class="notif-body">
                  <span class="notif-msg">${escapeHtml(n.message)}</span>
                  <span class="muted">${escapeHtml(n.meisters?.name || "")} · ${fmtTime(n.created_at)}</span>
                </span>
                ${n.read_at ? "" : `<span class="unread-dot"></span>`}
              </a>`
              )
              .join("")}
          </div>`
            )
            .join("")
        : `<div class="empty-state">Nothing yet. When a teammate comments on or logs activity for one of your Meisters, or @mentions you, it shows up here.</div>`
    }
  `;

  document.getElementById("mark-all-btn")?.addEventListener("click", async () => {
    try {
      await markAllNotificationsRead(currentProfile.id);
      render();
    } catch (err) {
      toast("Couldn't update: " + err.message, "error");
    }
  });
  container.querySelectorAll(".notif.unread").forEach((a) =>
    a.addEventListener("click", () => {
      // fire-and-forget; navigation proceeds via the href
      markNotificationRead(a.dataset.id).catch(() => {});
    })
  );
}

// ============================================================
// ACCOUNT
// ============================================================
async function renderAccount(route, seq) {
  let trashed = [];
  try { team = await listTeam(); } catch { /* non-fatal */ }
  if (isAdmin()) { try { trashed = await listTrashedMeisters(); } catch { /* non-fatal */ } }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const lastExport = team.map((t) => t.last_export_at).filter(Boolean).sort().pop() || null;
  const exportAgeDays = lastExport ? Math.floor((Date.now() - new Date(lastExport).getTime()) / 86400000) : null;

  container.innerHTML = `
    <div class="page-header"><div><h1>Account</h1><p class="muted">Signed in as ${escapeHtml(currentProfile.email || "")}</p></div></div>
    <div class="account-grid">
      <form id="name-form" class="form-card">
        <h3>${I.person} Display name</h3>
        <p class="muted">This is the name stamped on every note and record you log.</p>
        <div class="form-field"><label>Name</label><input id="acct-name" data-draft value="${escapeAttr(dv("acct-name", currentProfile.full_name))}" required /></div>
        <button class="btn btn-primary" type="submit">Save name</button>
      </form>

      <form id="pw-form" class="form-card">
        <h3>${I.lock} Change password</h3>
        <p class="muted">Takes effect immediately, no email involved.</p>
        <div class="form-field"><label>New password</label><input id="acct-pw" type="password" minlength="8" autocomplete="new-password" required /></div>
        <div class="form-field"><label>Confirm new password</label><input id="acct-pw2" type="password" minlength="8" autocomplete="new-password" required /></div>
        <button class="btn btn-primary" type="submit">Update password</button>
      </form>

      <form id="notif-form" class="form-card">
        <h3>${I.bell} Notifications</h3>
        <p class="muted">${
          currentProfile.concierge
            ? `You're linked to Concierge <strong>${escapeHtml(currentProfile.concierge)}</strong>. You'll be notified when a teammate acts on a Meister assigned to ${escapeHtml(currentProfile.concierge)}.`
            : `Your login isn't linked to a Concierge name yet, so notifications won't route to you. Your admin can link it (see README).`
        }</p>
        <label class="pref-row"><input type="checkbox" id="pref-comments" ${currentProfile.notify_comments ? "checked" : ""} /> Someone comments on an activity</label>
        <label class="pref-row"><input type="checkbox" id="pref-activity" ${currentProfile.notify_activity ? "checked" : ""} /> Someone logs a call, text, email, or note</label>
        <p class="muted" style="margin:10px 0 12px">Email reminders aren't available yet; notifications show in the app (bell icon and a red dot on the Meister list).</p>
        <button class="btn btn-primary" type="submit">Save preferences</button>
      </form>

      ${isAdmin() ? categoryManagerHtml() : ""}

      ${isAdmin() ? `<div class="form-card">
        <h3>${I.download} Backups</h3>
        <p class="muted">The Excel export is your offline copy of everything. ${lastExport ? `Last export by anyone on the team: <strong>${fmtDateTime(lastExport)}</strong>${exportAgeDays >= 14 ? ` <span class="fu-overdue">(${exportAgeDays} days ago, worth running one)</span>` : ""}.` : `<span class="fu-overdue">No export has been run yet.</span>`} If a nightly automated backup is set up (see README), it runs on its own; this is the manual one.</p>
        <button id="acct-export-btn" class="btn btn-primary">${I.download} Export to Excel now</button>
      </div>

      <div class="form-card" id="import-card">
        <h3>${I.download} Import CRM export</h3>
        <p class="muted">One time move of the old CRM into this database. Choose the Excel file the old CRM exported (GR-GT-CRM-Export-….xlsx). It's read on this computer and sent straight to the database. Names in "Logged By", "Owner" and similar columns are matched to current logins; anything unmatched is kept as a name.</p>
        <input type="file" id="import-file" accept=".xlsx" />
        <div id="import-preview"></div>
      </div>

      <div class="form-card trash-card">
        <h3>${I.trash} Trash <span class="muted">(${trashed.length})</span></h3>
        <p class="muted">Meisters you've removed. Restore puts everything back exactly as it was. Delete forever removes the Meister and all their history for good.</p>
        ${trashed.length ? `<div class="mini-list">${trashed.map((m) => `
          <div class="mini-row trash-row">
            <span>${escapeHtml(m.name)}<span class="muted"> · ${escapeHtml(m.dealership || "")} · removed ${relativeTime(m.deleted_at)}${m.deleted_by_name ? " by " + escapeHtml(m.deleted_by_name) : ""}</span></span>
            <span class="fu-actions">
              <button class="btn btn-ghost btn-sm" data-restore="${m.id}">${I.restore} Restore</button>
              <button class="icon-btn danger" data-purge="${m.id}" title="Delete forever">${I.trash}</button>
            </span>
          </div>`).join("")}</div>` : `<div class="muted">Trash is empty.</div>`}
      </div>` : ""}

      <div class="form-card">
        <h3>${I.users} Team</h3>
        <p class="muted">${currentProfile.is_admin ? "You're an admin: you can delete meisters, notes, comments, and guests. Everyone else can add and edit. Forgotten passwords are reset from the Supabase dashboard (Authentication → Users → … → Reset password), since email links don't get through the company filter." : "Only admins can delete records. Forgot your password? Ask your admin to reset it."}</p>
        <div class="team-list">
          ${team.map((t) => `<div class="team-row"><span class="user-avatar">${initials(t.full_name)}</span>${escapeHtml(t.full_name)}${t.id === currentProfile.id ? `<span class="muted"> (you)</span>` : ""}</div>`).join("") || `<div class="muted">No team members found.</div>`}
        </div>
      </div>
    </div>
  `;

  document.getElementById("name-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("acct-name").value.trim();
    if (!name) return;
    try {
      await setDisplayName(name);
      currentProfile.full_name = name;
      clearDrafts("acct-");
      toast("Display name updated");
      render();
    } catch (err) {
      toast("Couldn't update name: " + err.message, "error");
    }
  });

  if (isAdmin()) wireCategoryManager(container);

  if (isAdmin()) wireImport(container, team, () => render(), toast);

  document.getElementById("acct-export-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await exportToExcel(currentProfile.id); toast("Export downloaded"); render(); }
    catch (err) { toast("Export failed: " + err.message, "error"); btn.disabled = false; }
  });
  container.querySelectorAll("[data-restore]").forEach((b) =>
    b.addEventListener("click", async () => {
      try { await restoreMeister(b.dataset.restore); toast("Restored"); render(); }
      catch (err) { toast("Couldn't restore: " + err.message, "error"); }
    })
  );
  container.querySelectorAll("[data-purge]").forEach((b) =>
    b.addEventListener("click", async () => {
      const m = trashed.find((x) => x.id === b.dataset.purge);
      if (!confirm(`Delete ${m?.name || "this Meister"} forever? Every conversation, comment, follow-up, and guest goes with them. This cannot be undone.`)) return;
      try { await purgeMeister(b.dataset.purge); toast("Deleted forever"); render(); }
      catch (err) { toast("Couldn't delete: " + err.message, "error"); }
    })
  );

  document.getElementById("notif-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const prefs = {
      notify_comments: document.getElementById("pref-comments").checked,
      notify_activity: document.getElementById("pref-activity").checked,
    };
    try {
      await setNotificationPrefs(prefs);
      Object.assign(currentProfile, prefs);
      toast("Preferences saved");
    } catch (err) {
      toast("Couldn't save preferences: " + err.message, "error");
    }
  });

  document.getElementById("pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = document.getElementById("acct-pw").value;
    const pw2 = document.getElementById("acct-pw2").value;
    if (pw !== pw2) return toast("Passwords don't match", "error");
    try {
      await changePassword(pw);
      e.target.reset();
      toast("Password updated");
    } catch (err) {
      toast("Couldn't update password: " + err.message, "error");
    }
  });
}

// ---------- admin: question category manager ----------
function categoryManagerHtml() {
  return `
    <div class="form-card cat-manager">
      <h3>${I.tag} Question types</h3>
      <p class="muted">The dropdown on the log box. Retire a type to hide it from the dropdown without losing history; remove only if it's never been used.</p>
      <div class="cat-list">
        ${categories
          .map((c) =>
            catMgrState.editingId === c.id
              ? `<form class="cat-row cat-edit-form" data-id="${c.id}">
                  <input id="cat-edit-${c.id}" data-draft value="${escapeAttr(dv(`cat-edit-${c.id}`, c.name))}" required />
                  <button type="submit" class="btn btn-primary btn-sm">Save</button>
                  <button type="button" class="btn btn-sm cat-cancel-btn">Cancel</button>
                </form>`
              : `<div class="cat-row ${c.active ? "" : "retired"}" data-id="${c.id}">
                  <span class="cat-name">${escapeHtml(c.name)}${c.active ? "" : ` <span class="muted">(retired)</span>`}</span>
                  <span class="fu-actions">
                    <button class="icon-btn" data-cat-edit="${c.id}" title="Rename">${I.edit}</button>
                    <button class="btn btn-ghost btn-sm" data-cat-toggle="${c.id}" data-active="${c.active ? "1" : "0"}">${c.active ? "Retire" : "Restore"}</button>
                    <button class="icon-btn danger" data-cat-delete="${c.id}" title="Remove">${I.trash}</button>
                  </span>
                </div>`
          )
          .join("") || `<div class="muted">No types yet.</div>`}
      </div>
      <form id="cat-add-form" class="cat-row" style="margin-top:12px">
        <input id="cat-new" data-draft placeholder="New question type" value="${escapeAttr(dv("cat-new", ""))}" required />
        <button type="submit" class="btn btn-primary btn-sm">${I.plus} Add</button>
      </form>
    </div>`;
}

function wireCategoryManager(container) {
  document.getElementById("cat-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("cat-new").value.trim();
    if (!name) return;
    try {
      await addCategory(name);
      clearDrafts("cat-new");
      toast(`Added "${name}"`);
      render();
    } catch (err) {
      toast(/duplicate|unique/i.test(err.message) ? `"${name}" already exists` : "Couldn't add: " + err.message, "error");
    }
  });
  container.querySelectorAll("[data-cat-edit]").forEach((b) =>
    b.addEventListener("click", () => { catMgrState.editingId = b.dataset.catEdit; render(); })
  );
  container.querySelectorAll(".cat-cancel-btn").forEach((b) =>
    b.addEventListener("click", () => { clearDrafts("cat-edit-"); catMgrState.editingId = null; render(); })
  );
  container.querySelectorAll(".cat-edit-form").forEach((f) =>
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = f.dataset.id;
      const name = document.getElementById(`cat-edit-${id}`).value.trim();
      if (!name) return;
      try {
        await updateCategory(id, { name });
        clearDrafts("cat-edit-");
        catMgrState.editingId = null;
        toast("Renamed");
        render();
      } catch (err) {
        toast(/duplicate|unique/i.test(err.message) ? `"${name}" already exists` : "Couldn't rename: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll("[data-cat-toggle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const active = b.dataset.active !== "1";
      try {
        await updateCategory(b.dataset.catToggle, { active });
        toast(active ? "Restored" : "Retired");
        render();
      } catch (err) {
        toast("Couldn't update: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll("[data-cat-delete]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.catDelete;
      const c = catById(id);
      try {
        const uses = await countCategoryUses(id);
        if (uses > 0) {
          toast(`"${c?.name}" is on ${uses} logged ${uses === 1 ? "entry" : "entries"}. Retire it instead so the history stays intact.`, "error");
          return;
        }
        if (!confirm(`Remove "${c?.name}"? It has never been used.`)) return;
        await deleteCategory(id);
        toast("Removed");
        render();
      } catch (err) {
        toast("Couldn't remove: " + err.message, "error");
      }
    })
  );
}

// ============================================================
// DEALERSHIPS  (rollup of every Meister per store)
// ============================================================
async function renderDealershipsPage(route, seq) {
  let meisters, rollups;
  try {
    [meisters, rollups] = await Promise.all([listMeisters(), listMeisterRollups(currentProfile.id)]);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load dealerships: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;
  meisters.forEach((m) => Object.assign(m, rollups[m.id] || { last_contact: null, interaction_count: 0, guest_count: 0 }));

  const groups = groupBy(meisters, (m) => (m.dealership || "").trim().toLowerCase() || "__none").map(([key, items]) => {
    const name = key === "__none" ? "No dealership set" : items[0].dealership.trim();
    const last = items.map((m) => m.last_contact).filter(Boolean).sort().pop() || null;
    const conc = [...new Set(items.map((m) => m.concierge).filter(Boolean))];
    return {
      key, name, items, none: key === "__none",
      city: [...new Set(items.map((m) => [m.city, m.state].filter(Boolean).join(", ")).filter(Boolean))][0] || "",
      website: items.map((m) => m.dealership_website).find(Boolean) || "",
      conversations: items.reduce((a, m) => a + (m.interaction_count || 0), 0),
      guests: items.reduce((a, m) => a + (m.guest_count || 0), 0),
      sold: items.filter((m) => m.status === "Sold").length,
      last, conc,
    };
  });

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Dealerships</h1><p class="muted">${groups.filter((g) => !g.none).length} stores · ${meisters.length} Meisters. Click a store to see everyone there.</p></div>
    </div>
    <div class="filters">
      <div class="search-box">${I.search}<input id="dealer-search" type="text" placeholder="Search dealership or city…" value="${escapeAttr(dealerState.q)}" /></div>
      <select id="dealer-sort">
        ${[["meisters", "Most Meisters"], ["conversations", "Most conversations"], ["recent", "Most recent contact"], ["name", "A to Z"]].map(([v, l]) => `<option value="${v}" ${dealerState.sort === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>
    <div id="dealer-list" class="dealer-grid"></div>
  `;

  const draw = () => {
    const q = dealerState.q.toLowerCase().trim();
    const list = groups.filter((g) => !q || g.name.toLowerCase().includes(q) || g.city.toLowerCase().includes(q) || g.items.some((m) => m.name.toLowerCase().includes(q)));
    const sorters = {
      meisters: (a, b) => b.items.length - a.items.length,
      conversations: (a, b) => b.conversations - a.conversations,
      recent: (a, b) => ((b.last || "") < (a.last || "") ? -1 : 1),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    list.sort((a, b) => (a.none ? 1 : b.none ? -1 : sorters[dealerState.sort](a, b)));
    document.getElementById("dealer-list").innerHTML = list.length
      ? list.map((g) => `
        <div class="card dealer-card ${g.none ? "none" : ""}">
          <div class="dealer-head">
            <div>
              <div class="dealer-name">${I.building} ${escapeHtml(g.name)}</div>
              <div class="muted">${escapeHtml(g.city)}${g.website ? ` · <a href="${escapeAttr(withProtocol(g.website))}" target="_blank" rel="noopener">website ${I.link}</a>` : ""}</div>
            </div>
            <div class="dealer-stats">
              <span><strong>${g.items.length}</strong> Meister${g.items.length === 1 ? "" : "s"}</span>
              <span><strong>${g.conversations}</strong> conversations</span>
              <span><strong>${g.guests}</strong> guests</span>
              ${g.sold ? `<span class="st-sold"><strong>${g.sold}</strong> sold</span>` : ""}
            </div>
          </div>
          <div class="dealer-meta muted">${g.last ? "Last contact " + relativeTime(g.last) : "No contact yet"}${g.conc.length ? " · " + g.conc.join(", ") : ""}</div>
          <div class="mini-list">
            ${g.items.sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<a href="#/meister/${m.id}" class="mini-row"><span>${escapeHtml(m.name)}${m.job_title ? `<span class="muted"> · ${escapeHtml(m.job_title)}</span>` : ""}</span><span class="mini-right"><span class="muted">${m.last_contact ? relativeTime(m.last_contact) : "never"}</span><span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span></span></a>`).join("")}
          </div>
        </div>`).join("")
      : `<div class="empty-state">No dealerships match.</div>`;
  };
  document.getElementById("dealer-search").addEventListener("input", (e) => { dealerState.q = e.target.value; draw(); });
  document.getElementById("dealer-sort").addEventListener("change", (e) => { dealerState.sort = e.target.value; draw(); });
  draw();
}

// ============================================================
// IMPORT  (bulk create Meisters from Excel / CSV)
// ============================================================
const IMPORT_FIELDS = [
  ["name", "Name *"], ["job_title", "Job Title"], ["dealership", "Dealership"], ["dealership_website", "Dealership Website"],
  ["phone", "Phone"], ["email", "Email"], ["city", "City"], ["state", "State"], ["zip", "Zip"],
  ["status", "Status"], ["concierge", "Concierge"], ["allocation_count", "Allocation"], ["pma", "PMA"], ["profile_summary", "Profile Summary"],
];
const IMPORT_ALIASES = {
  name: ["name", "meister", "full name", "contact", "contact name", "meister name"],
  job_title: ["job title", "title", "role", "position"],
  dealership: ["dealership", "dealer", "store", "dealer name", "dealership name"],
  dealership_website: ["website", "dealership website", "url", "web"],
  phone: ["phone", "phone number", "cell", "mobile", "tel"],
  email: ["email", "e-mail", "email address"],
  city: ["city"], state: ["state", "st"], zip: ["zip", "zip code", "postal", "postal code"],
  status: ["status", "stage"], concierge: ["concierge", "owner", "assigned", "assigned to"],
  allocation_count: ["allocation", "allocations", "allocation count"], pma: ["pma"],
  profile_summary: ["summary", "notes", "profile summary", "comments"],
};

async function renderImportPage(route, seq) {
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;
  const st = importState;

  container.innerHTML = `
    <div class="page-header">
      <div><a href="#/dashboard" class="back-link">${I.back}All Meisters</a><h1>Import Meisters</h1><p class="muted">Load a dealer list from Excel or CSV. Nothing is created until you click Import on the preview.</p></div>
    </div>
    ${st.done ? `<div class="card import-done">
        <h3>${I.check} Imported ${st.done.created} Meister${st.done.created === 1 ? "" : "s"}</h3>
        ${st.done.skipped ? `<p class="muted">${st.done.skipped} row${st.done.skipped === 1 ? " was" : "s were"} skipped (no name, or a likely duplicate you left unchecked).</p>` : ""}
        <div class="page-actions" style="justify-content:flex-start"><a href="#/dashboard" class="btn btn-primary">Go to Meisters</a><button id="import-again" class="btn btn-ghost">Import another file</button></div>
      </div>` : ""}
    ${!st.done && !st.rows.length ? `
      <div class="card import-drop" id="import-drop">
        <input type="file" id="import-file" accept=".xlsx,.xls,.csv" hidden />
        <div class="import-drop-inner">
          ${I.upload}
          <h3>Drop a file here or <button type="button" id="import-browse" class="link-btn">browse</button></h3>
          <p class="muted">.xlsx, .xls, or .csv with one row per Meister. The first row should be column headings (Name, Dealership, Phone, Email, City, State, Zip, Job Title, Status, Concierge…). Columns are matched by name and you can fix the mapping before anything is created.</p>
        </div>
      </div>
      <div class="card" style="margin-top:14px"><h3>Tips</h3>
        <ul class="muted tips">
          <li>Only <strong>Name</strong> is required. Everything else can be filled in later.</li>
          <li>Status must be one of ${STATUSES.join(", ")} (anything else becomes New). Concierge must be ${CONCIERGES.join(" or ")}.</li>
          <li>Rows that look like an existing Meister (same phone, email, or name at the same dealership) are flagged so you can leave them out.</li>
          <li>Phone numbers are formatted automatically. State is uppercased.</li>
        </ul>
      </div>` : ""}
    ${!st.done && st.rows.length ? importPreviewHtml() : ""}
  `;

  document.getElementById("import-again")?.addEventListener("click", () => { Object.assign(st, { rows: [], headers: [], map: {}, fileName: "", done: null }); render(); });
  const fileInput = document.getElementById("import-file");
  document.getElementById("import-browse")?.addEventListener("click", () => fileInput.click());
  fileInput?.addEventListener("change", () => fileInput.files[0] && loadImportFile(fileInput.files[0]));
  const drop = document.getElementById("import-drop");
  if (drop) {
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && loadImportFile(e.dataTransfer.files[0]));
  }
  if (st.rows.length && !st.done) wireImportPreview(container);
}

async function loadImportFile(file) {
  const XLSX = window.XLSX;
  if (!XLSX) return toast("The spreadsheet library didn't load. Check your connection and refresh.", "error");
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    const headerIdx = rows.findIndex((r) => r.some((c) => String(c).trim()));
    if (headerIdx < 0) return toast("That file looks empty.", "error");
    const headers = rows[headerIdx].map((h) => String(h).trim());
    const body = rows.slice(headerIdx + 1).filter((r) => r.some((c) => String(c).trim()));
    if (!body.length) return toast("No data rows found under the headings.", "error");
    const map = {};
    for (const [field] of IMPORT_FIELDS) {
      const idx = headers.findIndex((h) => IMPORT_ALIASES[field].includes(h.toLowerCase()));
      if (idx >= 0) map[field] = idx;
    }
    if (map.name === undefined) map.name = 0;
    const existing = await listMeisters().catch(() => []);
    const norm = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
    const digits = (v) => String(v || "").replace(/\D/g, "");
    const seen = new Set();
    Object.assign(importState, {
      fileName: file.name, headers, map, done: null,
      rows: body.map((r, i) => {
        const get = (f) => (map[f] === undefined ? "" : String(r[map[f]] ?? "").trim());
        const name = get("name"), dealership = get("dealership"), phone = get("phone"), email = get("email");
        const key = norm(name) + "|" + norm(dealership);
        const dupOf = existing.find((m) => (phone && digits(phone).length >= 10 && digits(m.phone) === digits(phone)) || (email && norm(m.email) && norm(m.email) === norm(email)) || (name && norm(m.name) === norm(name) && norm(m.dealership) === norm(dealership)));
        const dupInFile = seen.has(key);
        seen.add(key);
        return { i, raw: r, include: !!name && !dupOf && !dupInFile, dupOf: dupOf ? dupOf.name : dupInFile ? "(earlier row in this file)" : "" };
      }),
    });
    render();
  } catch (err) {
    toast("Couldn't read that file: " + err.message, "error");
  }
}

function importRowToFields(r) {
  const { map } = importState;
  const get = (f) => (map[f] === undefined ? "" : String(r.raw[map[f]] ?? "").trim());
  const status = STATUSES.find((s) => s.toLowerCase() === get("status").toLowerCase()) || "New";
  const conciergeRaw = get("concierge").toLowerCase();
  const concierge = CONCIERGES.find((c) => conciergeRaw.startsWith(c.toLowerCase())) || null;
  const alloc = get("allocation_count");
  return {
    name: get("name"), job_title: get("job_title"), dealership: get("dealership"), dealership_website: get("dealership_website"),
    phone: formatPhone(get("phone")), email: get("email"), city: get("city"), state: get("state").toUpperCase().slice(0, 2), zip: get("zip"),
    status, concierge, allocation_count: alloc && !isNaN(Number(alloc)) ? Math.round(Number(alloc)) : null, pma: get("pma"), profile_summary: get("profile_summary"),
  };
}

function importPreviewHtml() {
  const st = importState;
  const included = st.rows.filter((r) => r.include).length;
  const flagged = st.rows.filter((r) => r.dupOf).length;
  const preview = st.rows.slice(0, 8);
  return `
    <div class="card">
      <div class="card-head"><h3>${I.upload} ${escapeHtml(st.fileName)}</h3><span class="muted">${st.rows.length} rows · ${included} will be created${flagged ? ` · ${flagged} flagged as possible duplicates` : ""}</span></div>
      <div class="group-label" style="margin-top:4px">Column mapping</div>
      <div class="map-grid">
        ${IMPORT_FIELDS.map(([f, label]) => `
          <label class="map-row"><span>${label}</span>
            <select data-map="${f}">
              <option value="">— skip —</option>
              ${st.headers.map((h, i) => `<option value="${i}" ${st.map[f] === i ? "selected" : ""}>${escapeHtml(h || "(column " + (i + 1) + ")")}</option>`).join("")}
            </select>
          </label>`).join("")}
      </div>

      <div class="group-label">Preview <span class="muted">(first ${preview.length} of ${st.rows.length})</span></div>
      <div class="table-wrap">
        <table class="crm-table import-table">
          <thead><tr><th></th><th>Name</th><th>Dealership</th><th>Phone</th><th>Email</th><th>City</th><th>Status</th><th>Concierge</th><th>Flag</th></tr></thead>
          <tbody>
            ${preview.map((r) => { const f = importRowToFields(r); return `<tr class="${r.include ? "" : "excluded"}">
              <td><input type="checkbox" data-row="${r.i}" ${r.include ? "checked" : ""} ${f.name ? "" : "disabled"} /></td>
              <td>${escapeHtml(f.name) || `<span class="muted">(no name)</span>`}${f.job_title ? `<div class="muted cell-sub">${escapeHtml(f.job_title)}</div>` : ""}</td>
              <td>${escapeHtml(f.dealership || "—")}</td><td>${escapeHtml(f.phone || "—")}</td><td>${escapeHtml(f.email || "—")}</td>
              <td>${escapeHtml([f.city, f.state].filter(Boolean).join(", ") || "—")}</td>
              <td><span class="status-pill status-${slug(f.status)}">${f.status}</span></td><td>${escapeHtml(f.concierge || "—")}</td>
              <td>${r.dupOf ? `<span class="fu-chip fu-overdue" title="Looks like ${escapeAttr(r.dupOf)}">${I.alert} dup: ${escapeHtml(r.dupOf)}</span>` : ""}</td>
            </tr>`; }).join("")}
          </tbody>
        </table>
      </div>
      ${st.rows.length > preview.length ? `<p class="muted" style="margin:8px 0 0">${st.rows.length - preview.length} more rows follow the same mapping. ${flagged ? "Flagged duplicates are unchecked by default; " : ""}use the buttons below to include or exclude all.</p>` : ""}
      <div class="composer-actions" style="justify-content:space-between;margin-top:14px">
        <div class="page-actions">
          <button id="import-cancel" class="btn">Cancel</button>
          <button id="import-all" class="btn btn-ghost btn-sm">Include all</button>
          <button id="import-nodupes" class="btn btn-ghost btn-sm">Exclude duplicates</button>
        </div>
        <button id="import-go" class="btn btn-primary" ${included ? "" : "disabled"}>${I.plus} Import ${included} Meister${included === 1 ? "" : "s"}</button>
      </div>
    </div>`;
}

function wireImportPreview(container) {
  const st = importState;
  container.querySelectorAll("[data-map]").forEach((sel) =>
    sel.addEventListener("change", () => {
      if (sel.value === "") delete st.map[sel.dataset.map]; else st.map[sel.dataset.map] = Number(sel.value);
      st.rows.forEach((r) => { if (!importRowToFields(r).name) r.include = false; });
      render();
    })
  );
  container.querySelectorAll("[data-row]").forEach((cb) => cb.addEventListener("change", () => { st.rows[Number(cb.dataset.row)].include = cb.checked; render(); }));
  document.getElementById("import-cancel").addEventListener("click", () => { Object.assign(st, { rows: [], headers: [], map: {}, fileName: "", done: null }); render(); });
  document.getElementById("import-all").addEventListener("click", () => { st.rows.forEach((r) => (r.include = !!importRowToFields(r).name)); render(); });
  document.getElementById("import-nodupes").addEventListener("click", () => { st.rows.forEach((r) => (r.include = !!importRowToFields(r).name && !r.dupOf)); render(); });
  document.getElementById("import-go").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const rows = st.rows.filter((r) => r.include).map(importRowToFields).filter((f) => f.name);
    if (!rows.length) return;
    if (!confirm(`Create ${rows.length} Meister${rows.length === 1 ? "" : "s"} now?`)) return;
    btn.disabled = true; btn.textContent = "Importing…";
    try {
      const created = await importMeisters(rows, currentProfile.full_name, currentProfile.id);
      st.done = { created: created.length, skipped: st.rows.length - created.length };
      st.rows = [];
      toast(`${created.length} Meisters imported`);
      render();
    } catch (err) {
      toast("Import failed: " + err.message + ". Nothing after the failing batch was created.", "error");
      btn.disabled = false; btn.innerHTML = `${I.plus} Import`;
    }
  });
}

// ============================================================
// GLOBAL SEARCH  (Ctrl+K)
// ============================================================
let searchTimer = null;
function openSearch() {
  searchState.open = true;
  searchState.active = 0;
  drawSearch();
  const input = document.getElementById("gs-input");
  if (input) { input.focus(); input.select(); }
}
function closeSearch() {
  searchState.open = false;
  const root = document.getElementById("search-root");
  if (root) root.innerHTML = "";
}
function drawSearch() {
  let root = document.getElementById("search-root");
  if (!root) { root = document.createElement("div"); root.id = "search-root"; document.body.appendChild(root); }
  if (!searchState.open) { root.innerHTML = ""; return; }
  const r = searchState.results;
  const items = r ? [...r.meisters.map((m) => ({ kind: "meister", m })), ...r.notes.map((n) => ({ kind: "note", n }))] : [];
  root.innerHTML = `
    <div class="gs-backdrop"></div>
    <div class="gs-box" role="dialog" aria-label="Search">
      <div class="gs-input-wrap">${I.search}<input id="gs-input" type="text" placeholder="Search Meisters, dealerships, and everything ever logged…" value="${escapeAttr(searchState.q)}" autocomplete="off" /><span class="search-kbd">Esc</span></div>
      <div class="gs-results">
        ${!searchState.q.trim() ? `<div class="gs-hint muted">Type a name, dealership, phone, city, or any word from a logged conversation.</div>` :
          !r ? `<div class="gs-hint muted">Searching…</div>` :
          !items.length ? `<div class="gs-hint muted">Nothing found for "${escapeHtml(searchState.q)}".</div>` : `
          ${r.meisters.length ? `<div class="gs-group">Meisters</div>` : ""}
          ${r.meisters.map((m, i) => `<a href="#/meister/${m.id}" class="gs-row ${i === searchState.active ? "active" : ""}" data-i="${i}">
              <span class="user-avatar">${initials(m.name)}</span>
              <span class="gs-body"><span class="gs-title">${escapeHtml(m.name)}</span><span class="muted">${escapeHtml([m.job_title, m.dealership, [m.city, m.state].filter(Boolean).join(", ")].filter(Boolean).join(" · "))}</span></span>
              <span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span>
            </a>`).join("")}
          ${r.notes.length ? `<div class="gs-group">Logged conversations</div>` : ""}
          ${r.notes.map((n, j) => { const i = r.meisters.length + j; return `<a href="#/meister/${n.meister_id}" class="gs-row ${i === searchState.active ? "active" : ""}" data-i="${i}">
              <span class="method-badge method-${slug(n.method)}">${METHOD_ICON[n.method] || ""}</span>
              <span class="gs-body"><span class="gs-title">${escapeHtml(n.meisters?.name || "")} <span class="muted">· ${escapeHtml(n.created_by_name || "")} · ${fmtDate(n.occurred_at)}</span></span><span class="gs-snippet">${highlightTerm(n.note, searchState.q)}</span></span>
            </a>`; }).join("")}`}
      </div>
    </div>`;
  root.querySelector(".gs-backdrop").addEventListener("click", closeSearch);
  root.querySelectorAll(".gs-row").forEach((a) => a.addEventListener("click", closeSearch));
  const input = root.querySelector("#gs-input");
  input.addEventListener("input", () => {
    searchState.q = input.value;
    searchState.results = null;
    searchState.active = 0;
    clearTimeout(searchTimer);
    if (!searchState.q.trim()) return drawSearchResults();
    searchTimer = setTimeout(async () => {
      const q = searchState.q;
      try {
        const res = await searchEverything(q);
        if (searchState.q === q) { searchState.results = res; drawSearchResults(); }
      } catch (err) {
        toast("Search failed: " + err.message, "error");
      }
    }, 220);
    drawSearchResults();
  });
  input.addEventListener("keydown", (e) => {
    const rows = root.querySelectorAll(".gs-row");
    if (e.key === "ArrowDown") { e.preventDefault(); searchState.active = Math.min(rows.length - 1, searchState.active + 1); drawSearchResults(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); searchState.active = Math.max(0, searchState.active - 1); drawSearchResults(); }
    else if (e.key === "Enter") { const row = root.querySelectorAll(".gs-row")[searchState.active]; if (row) { closeSearch(); navigate(row.getAttribute("href")); } }
  });
}
// Re-render only the results list so the input keeps focus and caret.
function drawSearchResults() {
  const root = document.getElementById("search-root");
  if (!root || !searchState.open) return;
  const input = root.querySelector("#gs-input");
  const pos = input ? input.selectionStart : 0;
  const q = searchState.q;
  drawSearch();
  const ni = document.getElementById("gs-input");
  if (ni) { ni.value = q; ni.focus(); ni.setSelectionRange(pos, pos); }
  root.querySelector(".gs-row.active")?.scrollIntoView({ block: "nearest" });
}
function highlightTerm(text, term) {
  const t = String(text || "");
  const idx = t.toLowerCase().indexOf(term.toLowerCase().trim());
  const start = Math.max(0, idx - 60);
  const snippet = (start > 0 ? "…" : "") + t.slice(start, start + 160) + (start + 160 < t.length ? "…" : "");
  const safe = escapeHtml(snippet);
  if (idx < 0 || !term.trim()) return safe;
  const esc = escapeHtml(term.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(esc, "ig"), (m) => `<mark>${m}</mark>`);
}

// ============================================================
// MEISTER PAGE (view / new)
// ============================================================
async function renderMeister(route, seq) {
  const isNew = route.mode === "new";
  let meister = null, interactions = [], guests = [], followUps = [], comments = [], history = [], dealerships = [];

  try {
    if (!isNew) {
      [meister, interactions, guests, followUps, history, dealerships] = await Promise.all([
        getMeister(route.id),
        listInteractions(route.id),
        listGuests(route.id),
        listFollowUpsForMeister(route.id),
        listStatusHistory(route.id).catch(() => []),
        listDealerships().catch(() => []),
      ]);
      comments = await listCommentsForInteractions(interactions.map((i) => i.id));
    } else {
      dealerships = await listDealerships().catch(() => []);
    }
  } catch {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Could not load this meister. They may have been removed.</div>`));
    return;
  }
  if (meister && meister.deleted_at) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">${escapeHtml(meister.name)} is in the Trash${meister.deleted_by_name ? ` (removed by ${escapeHtml(meister.deleted_by_name)})` : ""}.${isAdmin() ? ` <a href="#/account">Restore it from the Account page.</a>` : " Ask an admin to restore it."}</div>`));
    return;
  }
  if (!isNew) {
    // Opening the Meister clears its unread notifications for you.
    if (myUnread.some((n) => n.meister_id === route.id)) {
      markMeisterNotificationsRead(currentProfile.id, route.id).catch(() => {});
      myUnread = myUnread.filter((n) => n.meister_id !== route.id);
    }
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const defaultConcierge = CONCIERGES.find((c) => (currentProfile?.full_name || "").toLowerCase().startsWith(c.toLowerCase())) || "";
  const conciergeVal = dv("f-concierge", meister ? meister.concierge || "" : defaultConcierge);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <a href="#/dashboard" class="back-link">${I.back}All Meisters</a>
        <h1>${isNew ? "New Meister" : escapeHtml(meister.name)}</h1>
      </div>
      ${!isNew && isAdmin() ? `<button id="delete-btn" class="btn btn-danger">${I.trash} Move to Trash</button>` : ""}
    </div>

    <div class="${isNew ? "" : "meister-layout"}">
      ${!isNew ? renderProfileSidebar(meister, followUps, guests) : ""}
      <div>
        <div class="tabs" id="tabs">
          ${!isNew ? `<button class="tab-btn ${uiState.activeTab === "activity" ? "active" : ""}" data-tab="activity">Activity <span class="tab-count">${interactions.length}</span></button>` : ""}
          ${!isNew ? `<button class="tab-btn ${uiState.activeTab === "guests" ? "active" : ""}" data-tab="guests">Guests <span class="tab-count">${guests.length}</span></button>` : ""}
          <button class="tab-btn ${uiState.activeTab === "profile" ? "active" : ""}" data-tab="profile">${isNew ? "Profile" : "Edit Profile"}</button>
        </div>

        <div id="tab-profile" class="tab-panel" style="${uiState.activeTab === "profile" ? "" : "display:none"}">
          <form id="profile-form" class="form-card" novalidate>
            <div class="form-grid">
              <div class="form-field"><label>Name *</label><input id="f-name" data-draft required value="${escapeAttr(dv("f-name", meister?.name))}" /></div>
              <div class="form-field"><label>Job Title</label><input id="f-job-title" data-draft placeholder="e.g. General Manager" value="${escapeAttr(dv("f-job-title", meister?.job_title))}" /></div>
              <div class="form-field"><label>Status</label>
                <select id="f-status" data-draft>${(STATUSES.includes(meister?.status || "New") ? STATUSES : [...STATUSES, meister.status]).map((s) => `<option ${dv("f-status", meister?.status || "New") === s ? "selected" : ""}>${s}</option>`).join("")}</select>
              </div>
              <div class="form-field"><label>Concierge</label>
                <select id="f-concierge" data-draft>
                  <option value="" ${conciergeVal === "" ? "selected" : ""}>Unassigned</option>
                  ${CONCIERGES.map((c) => `<option ${conciergeVal === c ? "selected" : ""}>${c}</option>`).join("")}
                </select>
              </div>
              <div class="form-field"><label>Phone</label><input id="f-phone" data-draft type="tel" placeholder="(xxx) xxx-xxxx" value="${escapeAttr(dv("f-phone", formatPhone(meister?.phone)))}" /></div>
              <div class="form-field"><label>Email</label><input id="f-email" data-draft type="email" value="${escapeAttr(dv("f-email", meister?.email))}" /></div>
              <div class="form-field"><label>Dealership</label><input id="f-dealership" data-draft list="dealership-list" autocomplete="off" placeholder="Start typing to match an existing store" value="${escapeAttr(dv("f-dealership", meister?.dealership))}" />
                <datalist id="dealership-list">${dealerships.map((d) => `<option value="${escapeAttr(d)}"></option>`).join("")}</datalist></div>
              <div class="form-field"><label>Dealership Website</label><input id="f-dealership-website" data-draft placeholder="https://…" value="${escapeAttr(dv("f-dealership-website", meister?.dealership_website))}" /></div>
              <div class="form-field"><label>City</label><input id="f-city" data-draft value="${escapeAttr(dv("f-city", meister?.city))}" /></div>
              <div class="form-field form-field-split">
                <div><label>State</label><input id="f-state" data-draft maxlength="2" style="text-transform:uppercase" value="${escapeAttr(dv("f-state", meister?.state))}" /></div>
                <div><label>Zip</label><input id="f-zip" data-draft inputmode="numeric" value="${escapeAttr(dv("f-zip", meister?.zip))}" /></div>
              </div>
            </div>
            <div class="form-field"><label>Profile Summary</label>
              <textarea id="f-summary" data-draft rows="4" placeholder="Who they are, interest level, what matters to them…">${escapeHtml(dv("f-summary", meister?.profile_summary))}</textarea>
            </div>
            <div class="group-label" style="margin-top:6px">Key facts</div>
            <div class="form-grid form-grid-3">
              <div class="form-field"><label>Allocation count</label><input id="f-allocation" data-draft type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 2" value="${escapeAttr(dv("f-allocation", meister?.allocation_count ?? ""))}" /></div>
              <div class="form-field"><label>PMA</label><input id="f-pma" data-draft placeholder="Primary market area" value="${escapeAttr(dv("f-pma", meister?.pma))}" /></div>
              <div class="form-field"><label>Next Guest Delivery</label>${(() => { const nd = nextGuestDelivery(guests); return `<div class="readonly-field">${nd ? `<b>${escapeHtml(fmtMonth(nd.delivery_date))}</b> <span class="muted">· ${escapeHtml(nd.guest_name)}</span>` : `<span class="muted">None scheduled</span>`}</div><div class="muted field-note">From the Guests tab</div>`; })()}</div>
            </div>
            ${isNew ? "" : `<div class="form-meta muted">Created by ${escapeHtml(meister.created_by_name || "—")} on ${fmtDate(meister.created_at)} &middot; Last updated by ${escapeHtml(meister.updated_by_name || "—")} ${relativeTime(meister.updated_at)}</div>`}
            <div class="composer-actions" style="justify-content:flex-start">
              <button type="submit" class="btn btn-primary">${isNew ? "Create Meister" : "Save Changes"}</button>
              ${isNew ? `<a href="#/dashboard" class="btn">Cancel</a>` : ""}
            </div>
          </form>
        </div>

        ${!isNew ? renderActivityTab(meister, interactions, followUps, comments, history, guests) : ""}
        ${!isNew ? renderGuestsTab(guests) : ""}
      </div>
    </div>
  `;

  wireTabs();
  wirePhoneInput(document.getElementById("f-phone"));

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const g = (id) => document.getElementById(id).value.trim();
    const fields = {
      name: g("f-name"),
      job_title: g("f-job-title"),
      status: g("f-status"),
      concierge: g("f-concierge") || null,
      phone: formatPhone(g("f-phone")),
      email: g("f-email"),
      dealership: g("f-dealership"),
      dealership_website: g("f-dealership-website"),
      city: g("f-city"),
      state: g("f-state").toUpperCase(),
      zip: g("f-zip"),
      profile_summary: g("f-summary"),
      allocation_count: g("f-allocation") === "" ? null : Number(g("f-allocation")),
      pma: g("f-pma"),
    };
    if (!showFieldErrors(validateMeisterFields(fields))) return;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      if (isNew) {
        const dupes = await findDuplicateMeisters(fields).catch(() => []);
        if (dupes.length) {
          const list = dupes.slice(0, 3).map((d) => `${d.name}${d.dealership ? " (" + d.dealership + ")" : ""}`).join(", ");
          if (!confirm(`This looks like it might already exist: ${list}. Create ${fields.name} anyway?`)) { btn.disabled = false; return; }
        }
        const created = await createMeister(fields, currentProfile.full_name, currentProfile.id);
        clearDrafts("f-");
        toast(`${created.name} added`);
        navigate(`#/meister/${created.id}`);
      } else {
        await updateMeister(meister.id, fields, currentProfile.full_name, meister.updated_at);
        clearDrafts("f-");
        toast("Profile saved");
        render();
      }
    } catch (err) {
      if (err.code === "CONFLICT") {
        if (confirm("Someone else saved this profile while you were editing. Reload to see their version? (Your unsaved changes will be lost.)")) { clearDrafts("f-"); render(); }
        else btn.disabled = false;
        return;
      }
      toast("Could not save: " + err.message, "error");
      btn.disabled = false;
    }
  });

  if (!isNew) {
    document.getElementById("delete-btn")?.addEventListener("click", async () => {
      if (!confirm(`Move ${meister.name} to the Trash? They disappear from every list and report, but an admin can restore them from the Account page.`)) return;
      try {
        await deleteMeister(meister.id, currentProfile.full_name);
        toast(`${meister.name} moved to Trash`);
        navigate("#/dashboard");
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    });
    wireQuickActions();
    wireActivityTab(container, meister);
    wireGuestsTab(meister);

    if (uiState.focusId) {
      const el = document.getElementById(uiState.focusId);
      uiState.focusId = null;
      if (el) {
        el.focus();
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }
}

// ---------- sidebar ----------
function renderProfileSidebar(m, followUps, guests = []) {
  const nextDel = nextGuestDelivery(guests);
  const cityLine = [m.city, [m.state, m.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const role = [m.job_title, m.dealership].filter(Boolean).join(" · ");
  const mine = followUps.filter((f) => f.user_id === currentProfile.id && !f.done_at).sort((a, b) => (a.due_at < b.due_at ? -1 : 1))[0];
  return `
    <div class="card profile-sidebar">
      <div class="avatar">${initials(m.name)}</div>
      <div class="mname">${escapeHtml(m.name)}</div>
      ${role ? `<div class="mrole">${escapeHtml(role)}</div>` : ""}
      <div class="pill-row">
        <span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span>
        ${m.concierge ? `<span class="concierge-pill">${I.person} ${escapeHtml(m.concierge)}</span>` : ""}
      </div>

      <div class="quick-actions">
        ${QUICK_ACTIONS.map((a) => `<button type="button" class="qa-btn" data-method="${a.method}"><span class="qa-icon">${a.icon}</span>${a.label}</button>`).join("")}
      </div>
      <p class="muted qa-hint">Logs the conversation here. Doesn't dial, text, or send email.</p>

      ${mine ? `<div class="field"><label>My next follow-up</label><div class="fu-${followUpState(mine.due_at)}">${I.calendar} ${fmtDateTime(mine.due_at)}</div><div class="muted" style="font-size:12px">${escapeHtml(mine.title)}</div></div>` : ""}
      ${m.phone ? `<div class="field"><label>Phone</label><div>${escapeHtml(formatPhone(m.phone))}</div></div>` : ""}
      ${m.email ? `<div class="field"><label>Email</label><div>${escapeHtml(m.email)}</div></div>` : ""}
      ${m.dealership_website ? `<div class="field"><label>Dealership Website</label><div><a href="${escapeAttr(withProtocol(m.dealership_website))}" target="_blank" rel="noopener">${escapeHtml(m.dealership_website.replace(/^https?:\/\//i, ""))} ${I.link}</a></div></div>` : ""}
      ${cityLine ? `<div class="field"><label>Location</label><div>${escapeHtml(cityLine)}</div></div>` : ""}
      ${m.allocation_count !== null && m.allocation_count !== undefined || m.pma || nextDel ? `<div class="key-facts">
        <div class="key-facts-lbl">${I.zap} Key facts</div>
        ${m.allocation_count !== null && m.allocation_count !== undefined ? `<div class="kf"><span class="kf-k">Allocation</span><span class="kf-v">${m.allocation_count}</span></div>` : ""}
        ${m.pma ? `<div class="kf"><span class="kf-k">PMA</span><span class="kf-v">${escapeHtml(m.pma)}</span></div>` : ""}
        ${nextDel ? `<div class="kf"><span class="kf-k">Next guest delivery</span><span class="kf-v">${escapeHtml(fmtMonth(nextDel.delivery_date))} <span class="muted">· ${escapeHtml(nextDel.guest_name)}</span></span></div>` : ""}
      </div>` : ""}
      ${m.profile_summary ? `<div class="field"><label>Profile Summary</label><div class="summary-text">${escapeHtml(m.profile_summary)}</div></div>` : ""}
    </div>
  `;
}

function wireQuickActions() {
  document.querySelectorAll(".qa-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      uiState.activeTab = "activity";
      uiState.composerOpen = true;
      uiState.composerMethod = btn.dataset.method;
      uiState.focusId = "c-note";
      render();
    })
  );
}

// ---------- activity tab ----------
function renderActivityTab(meister, interactions, followUps, comments, history = [], guests = []) {
  const pendingFus = followUps.filter((f) => !f.done_at);
  const doneFus = followUps.filter((f) => f.done_at);
  const fusByNote = {};
  for (const f of followUps) if (f.interaction_id) (fusByNote[f.interaction_id] ||= []).push(f);
  const commentsByNote = {};
  for (const c of comments) (commentsByNote[c.interaction_id] ||= []).push(c);

  // One timeline: logged conversations, completed follow-ups, status changes, and guests, newest first.
  const changes = history.filter((h) => h.from_status); // skip the "created as New" row; creation shows in the profile meta
  const feed = [
    ...interactions.map((i) => ({ type: "note", time: i.occurred_at, method: i.method, data: i })),
    ...doneFus.map((f) => ({ type: "fu", time: f.done_at, method: "__fu", data: f })),
    ...changes.map((h) => ({ type: "status", time: h.changed_at, method: "__sys", data: h })),
    ...guests.map((g) => ({ type: "guest", time: g.created_at, method: "__sys", data: g })),
  ].sort((a, b) => (a.time < b.time ? 1 : -1));
  const filtered = uiState.methodFilter ? feed.filter((x) => x.method === uiState.methodFilter) : feed;

  return `
    <div id="tab-activity" class="tab-panel" style="${uiState.activeTab === "activity" ? "" : "display:none"}">
      <div class="toolbar">
        <div class="filter-chips" id="method-chips">
          <button type="button" class="chip ${!uiState.methodFilter ? "active" : ""}" data-method="">All <span class="chip-n">${feed.length}</span></button>
          ${METHODS.map((m) => {
            const n = interactions.filter((i) => i.method === m).length;
            return `<button type="button" class="chip ${uiState.methodFilter === m ? "active" : ""}" data-method="${m}">${METHOD_ICON[m]} ${m} <span class="chip-n">${n}</span></button>`;
          }).join("")}
          <button type="button" class="chip ${uiState.methodFilter === "__fu" ? "active" : ""}" data-method="__fu">${I.check} Done <span class="chip-n">${doneFus.length}</span></button>
          <button type="button" class="chip ${uiState.methodFilter === "__sys" ? "active" : ""}" data-method="__sys">${I.flag} Changes <span class="chip-n">${changes.length + guests.length}</span></button>
        </div>
        <div class="page-actions">
          <button type="button" id="open-fu-btn" class="btn btn-ghost">${I.bell} Follow-up</button>
          <button type="button" id="toggle-composer-btn" class="btn btn-primary">${I.plus} Log Activity</button>
        </div>
      </div>

      ${uiState.fuFormOpen && !uiState.editingFuId ? fuFormHtml(null, meister.name) : ""}
      ${uiState.composerOpen ? composerHtml() : ""}

      ${
        pendingFus.length
          ? `<div class="fu-panel">
              <div class="group-label" style="margin-top:0">Pending follow-ups</div>
              <div class="fu-list">${pendingFus.map((f) => (uiState.editingFuId === f.id ? fuFormHtml(f, meister.name) : fuRowHtml(f, meister.name, false))).join("")}</div>
            </div>`
          : ""
      }

      ${
        filtered.length
          ? groupBy(filtered, (x) => monthLabel(x.time))
              .map(
                ([label, items]) => `
            <div class="group-label">${escapeHtml(label)}</div>
            <div class="notes-list">
              ${items.map((x) => x.type === "fu" ? fuDoneCardHtml(x.data) : x.type === "status" ? statusCardHtml(x.data) : x.type === "guest" ? guestCardHtml(x.data) : noteCardHtml(x.data, fusByNote[x.data.id] || [], commentsByNote[x.data.id] || [])).join("")}
            </div>`
              )
              .join("")
          : `<div class="empty-state">${feed.length ? "Nothing in this filter yet." : "No conversations logged yet. Use Call / Text / Email / Note on the left to add one."}</div>`
      }
    </div>
  `;
}

function statusCardHtml(h) {
  return `
    <div class="note-card sys-card">
      <div class="note-top">
        <span class="method-badge method-status">${I.flag} Status</span>
        <span class="sys-text">${h.from_status ? `<span class="status-pill status-${slug(h.from_status)}">${escapeHtml(h.from_status)}</span> <span class="muted">→</span> ` : ""}<span class="status-pill status-${slug(h.to_status)}">${escapeHtml(h.to_status)}</span></span>
        <span class="muted">${escapeHtml(h.changed_by_name || "someone")} &middot; ${fmtDateTime(h.changed_at)}</span>
      </div>
    </div>`;
}

function guestCardHtml(g) {
  return `
    <div class="note-card sys-card">
      <div class="note-top">
        <span class="method-badge method-guest">${I.car} Guest</span>
        <span class="sys-text">${escapeHtml(g.guest_name)}${g.vehicle_purchased ? ` <span class="muted">· ${escapeHtml(g.vehicle_purchased)}</span>` : ""} <span class="guest-pill gs-${slug(g.guest_status || "Allocated")}">${escapeHtml(g.guest_status || "Allocated")}</span></span>
        <span class="muted">${escapeHtml(g.created_by_name || "someone")} &middot; ${fmtDateTime(g.created_at)}</span>
      </div>
      ${g.notes ? `<div class="note-text muted">${escapeHtml(g.notes)}</div>` : ""}
    </div>`;
}

function fuDoneCardHtml(f) {
  const mine = canManageFu(f);
  return `
    <div class="note-card fu-done-card" data-fu-id="${f.id}">
      <div class="note-top">
        <span class="method-badge method-followup">${I.check} Follow-up</span>
        <span class="muted">${escapeHtml(f.user_name || "someone")} &middot; completed ${fmtDateTime(f.done_at)}</span>
        <span class="note-actions">
          ${mine ? `<button class="icon-btn" data-fu-toggle="${f.id}" data-done="1" title="Mark not done">${I.circle}</button>
          <button class="icon-btn danger" data-fu-delete="${f.id}" title="Delete">${I.trash}</button>` : ""}
        </span>
      </div>
      <div class="note-text">${escapeHtml(f.title)} <span class="muted">· was due ${fmtDateTime(f.due_at)}</span></div>
    </div>`;
}

// Category chip that is also a dropdown: pick a type, or change a wrong one.
function categorySelectHtml(i) {
  const cur = catById(i.category_id);
  const opts = activeCategories().slice();
  if (cur && !cur.active) opts.push(cur); // keep a retired type visible on old entries
  return `
    <span class="cat-chip ${cur ? "has" : ""}">
      ${I.tag}
      <select class="cat-select" data-note="${i.id}" title="Question type">
        <option value="" ${!cur ? "selected" : ""}>${cur ? "No type" : "+ Question type"}</option>
        ${opts.map((c) => `<option value="${c.id}" ${cur?.id === c.id ? "selected" : ""}>${escapeHtml(c.name)}${c.active ? "" : " (retired)"}</option>`).join("")}
      </select>
    </span>`;
}

function noteCardHtml(i, fus, cmts) {
  return `
    <div class="note-card" data-note-id="${i.id}">
      <div class="note-top">
        <span class="method-badge method-${slug(i.method)}">${METHOD_ICON[i.method] || ""} ${escapeHtml(i.method)}</span>
        ${directionChip(i.direction)}
        ${categorySelectHtml(i)}
        <span class="muted">${escapeHtml(i.created_by_name || "someone")} &middot; ${fmtDateTime(i.occurred_at)}${i.edited_by_name ? ` &middot; <span title="${escapeAttr(`Details changed by ${i.edited_by_name}${i.edited_at ? " on " + fmtDateTime(i.edited_at) : ""}`)}">edited</span>` : ""}</span>
        <span class="note-actions">
          <button class="icon-btn edit-int-btn" data-id="${i.id}" title="Fix method, direction or date">${I.edit}</button>
          ${isAdmin() ? `<button class="icon-btn danger delete-note-btn" data-id="${i.id}" title="Delete">${I.trash}</button>` : ""}
        </span>
      </div>
      ${uiState.editingIntId === i.id ? `
      <form class="int-fix" data-id="${i.id}">
        <select name="method">${METHODS.map((m) => `<option ${i.method === m ? "selected" : ""}>${m}</option>`).join("")}</select>
        <select name="direction"><option value="">Direction not set</option>${DIRECTIONS.map((d) => `<option value="${d}" ${i.direction === d ? "selected" : ""}>${d === "Inbound" ? "Inbound (they contacted us)" : "Outbound (we contacted them)"}</option>`).join("")}</select>
        <input name="when" type="datetime-local" value="${escapeAttr(toLocalInput(i.occurred_at))}" required />
        <button type="button" class="btn int-fix-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
        <span class="muted int-fix-note">The note itself can't be changed. Add a comment to clarify it.</span>
      </form>` : ""}
      <div class="note-text">${escapeHtml(i.note)}</div>
      ${
        fus.length
          ? `<div class="note-fus">${fus
              .map((f) => {
                const st = f.done_at ? "done" : followUpState(f.due_at);
                return `<span class="fu-chip fu-${st}" title="${escapeAttr(f.user_name || "")}">${f.done_at ? I.check : I.calendar} ${escapeHtml(f.title)} · ${f.done_at ? "done" : fmtDateTime(f.due_at)}</span>`;
              })
              .join("")}</div>`
          : ""
      }
      <div class="comments">
        ${cmts.map((c) => (uiState.editingCommentId === c.id ? commentFormHtml(i.id, c) : commentHtml(c))).join("")}
        ${
          uiState.replyingTo === i.id
            ? commentFormHtml(i.id, null)
            : `<button type="button" class="reply-btn" data-reply="${i.id}">${I.reply} ${cmts.length ? "Reply" : "Comment"}</button>`
        }
      </div>
    </div>`;
}

// @mention autocomplete inside comment boxes. Inserting "@Full Name" is what the
// database looks for when deciding who to notify.
function wireMentions(container) {
  container.querySelectorAll(".comment-form textarea").forEach((ta) => {
    const pop = ta.parentElement.querySelector(".mention-pop");
    if (!pop) return;
    let matches = [], active = 0, tokenStart = -1;
    const close = () => { pop.hidden = true; matches = []; };
    const draw = () => {
      if (!matches.length) return close();
      pop.hidden = false;
      pop.innerHTML = matches.map((t, i) => `<button type="button" class="mention-opt ${i === active ? "active" : ""}" data-i="${i}"><span class="user-avatar">${initials(t.full_name)}</span>${escapeHtml(t.full_name)}</button>`).join("");
      pop.querySelectorAll(".mention-opt").forEach((b) => b.addEventListener("mousedown", (e) => { e.preventDefault(); pick(Number(b.dataset.i)); }));
    };
    const pick = (i) => {
      const t = matches[i]; if (!t) return;
      const before = ta.value.slice(0, tokenStart), after = ta.value.slice(ta.selectionStart);
      ta.value = `${before}@${t.full_name} ${after}`;
      const pos = before.length + t.full_name.length + 2;
      ta.setSelectionRange(pos, pos);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      close();
    };
    ta.addEventListener("input", () => {
      const upTo = ta.value.slice(0, ta.selectionStart);
      const m = upTo.match(/(^|\s)@([\w .'-]*)$/);
      if (!m) return close();
      tokenStart = upTo.length - m[2].length - 1;
      const q = m[2].toLowerCase();
      matches = team.filter((t) => t.id !== currentProfile.id && t.full_name.toLowerCase().includes(q)).slice(0, 6);
      active = 0; draw();
    });
    ta.addEventListener("keydown", (e) => {
      if (pop.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % matches.length; draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; draw(); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(active); }
      else if (e.key === "Escape") close();
    });
    ta.addEventListener("blur", () => setTimeout(close, 120));
  });
}

function highlightMentions(html) {
  // html is already escaped; wrap @Full Name tokens that match a teammate
  let out = html;
  for (const t of team) {
    const esc = escapeHtml("@" + t.full_name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(esc, "g"), `<span class="mention">${escapeHtml("@" + t.full_name)}</span>`);
  }
  return out;
}

function commentHtml(c) {
  const own = c.created_by === currentProfile.id;
  return `
    <div class="comment">
      <span class="user-avatar">${initials(c.created_by_name)}</span>
      <div class="comment-body">
        <div class="comment-meta"><strong>${escapeHtml(c.created_by_name || "someone")}</strong> <span class="muted">${fmtDateTime(c.created_at)}${c.edited_at ? " · <em>edited</em>" : ""}</span>
          <span class="note-actions">
            ${own || isAdmin() ? `<button class="icon-btn edit-comment-btn" data-id="${c.id}" title="Edit">${I.edit}</button>` : ""}
            ${isAdmin() ? `<button class="icon-btn danger delete-comment-btn" data-id="${c.id}" title="Delete">${I.trash}</button>` : ""}
          </span>
        </div>
        <div class="comment-text">${highlightMentions(escapeHtml(c.body))}</div>
      </div>
    </div>`;
}

function commentFormHtml(noteId, existing) {
  const p = existing ? `cme-${existing.id}-` : `cm-${noteId}-`;
  return `
    <form class="comment-form" data-prefix="${p}" data-note-id="${noteId}" data-edit-id="${existing ? existing.id : ""}">
      <span class="user-avatar">${initials(currentProfile.full_name)}</span>
      <div class="comment-body">
        <textarea id="${p}body" data-draft rows="2" required placeholder="Add a comment… type @ to mention a teammate">${escapeHtml(dv(`${p}body`, existing ? existing.body : ""))}</textarea>
        <div class="mention-pop" hidden></div>
        <div class="composer-actions" style="margin-top:8px">
          <button type="button" class="btn btn-sm cancel-comment-btn">Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">${existing ? "Save" : "Post"}</button>
        </div>
      </div>
    </form>`;
}

function composerHtml() {
  const p = "c-";
  const method = dv(`${p}method`, uiState.composerMethod);
  const when = dv(`${p}when`, toLocalInput(new Date().toISOString()));
  const note = dv(`${p}note`, "");
  const withFu = uiState.composerWithFollowUp;
  const direction = dv(`${p}direction`, uiState.composerDirection);
  return `
    <form class="composer" data-prefix="${p}">
      <div class="composer-top">
        <select id="${p}method" data-draft>${METHODS.map((m) => `<option ${method === m ? "selected" : ""}>${m}</option>`).join("")}</select>
        <select id="${p}direction" data-draft title="Who reached out">${DIRECTIONS.map((d) => `<option value="${d}" ${direction === d ? "selected" : ""}>${d === "Inbound" ? "Inbound (they contacted us)" : "Outbound (we contacted them)"}</option>`).join("")}</select>
        <input id="${p}when" data-draft type="datetime-local" value="${escapeAttr(when)}" required />
        <select id="${p}category" data-draft title="Question type (optional)">
          <option value="" ${!dv(`${p}category`, "") ? "selected" : ""}>Question type (optional)</option>
          ${activeCategories().map((c) => `<option value="${c.id}" ${dv(`${p}category`, "") === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>
      <textarea id="${p}note" data-draft rows="3" required placeholder="What did you talk about? Any follow-up needed?">${escapeHtml(note)}</textarea>
      <label class="fu-toggle"><input type="checkbox" id="c-fu-on" ${withFu ? "checked" : ""} /> ${I.bell} Set a follow-up reminder</label>
      ${
        withFu
          ? `<div class="fu-form-grid" style="margin-top:8px">
              <input id="c-fu-title" data-draft placeholder="Follow-up title" value="${escapeAttr(dv("c-fu-title", ""))}" />
              <input id="c-fu-when" data-draft type="datetime-local" value="${escapeAttr(dv("c-fu-when", toLocalInput(defaultFollowUpTime())))}" />
            </div>`
          : ""
      }
      <p class="muted composer-note">Logged entries can't be edited afterward. Add anything extra as a comment. <span class="kbd-hint">Ctrl+Enter logs it.</span></p>
      <div class="composer-actions">
        <button type="button" class="btn cancel-composer-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Log it</button>
      </div>
    </form>`;
}

function wireActivityTab(container, meister) {
  document.querySelectorAll("#method-chips .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      uiState.methodFilter = chip.dataset.method;
      render();
    })
  );

  document.getElementById("toggle-composer-btn")?.addEventListener("click", () => {
    uiState.composerOpen = true;
    uiState.focusId = "c-note";
    render();
  });
  document.getElementById("open-fu-btn")?.addEventListener("click", () => {
    uiState.fuFormOpen = true;
    uiState.editingFuId = null;
    uiState.focusId = "fu-title";
    render();
  });

  // follow-up toggle inside the composer
  document.getElementById("c-fu-on")?.addEventListener("change", (e) => {
    uiState.composerWithFollowUp = e.target.checked;
    uiState.focusId = e.target.checked ? "c-fu-title" : "c-note";
    render();
  });

  // Ctrl+Enter / Cmd+Enter submits whichever form the cursor is in.
  container.querySelectorAll(".composer textarea, .comment-form textarea").forEach((ta) =>
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); ta.closest("form")?.requestSubmit(); }
    })
  );
  wireMentions(container);

  document.querySelectorAll(".composer:not(.fu-form)").forEach((form) => {
    const prefix = form.dataset.prefix;

    form.querySelector(".cancel-composer-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      clearDrafts("c-fu-");
      uiState.composerOpen = false;
      uiState.composerWithFollowUp = false;
      render();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        method: document.getElementById(`${prefix}method`).value,
        direction: document.getElementById(`${prefix}direction`).value || null,
        occurred_at: fromLocalInput(document.getElementById(`${prefix}when`).value),
        note: document.getElementById(`${prefix}note`).value.trim(),
        category_id: document.getElementById(`${prefix}category`).value || null,
      };
      if (!payload.note || !payload.occurred_at) return;

      let fu = null;
      if (uiState.composerWithFollowUp) {
        const title = document.getElementById("c-fu-title")?.value.trim();
        const due_at = fromLocalInput(document.getElementById("c-fu-when")?.value);
        if (!title || !due_at) return toast("Give the follow-up a title and a time, or untick it.", "error");
        fu = { title, due_at };
      }

      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const created = await addInteraction(meister.id, payload, currentProfile.full_name, currentProfile.id);
        if (fu) await addFollowUp({ meister_id: meister.id, interaction_id: created.id, ...fu }, currentProfile.full_name, currentProfile.id);
        uiState.composerOpen = false;
        uiState.composerWithFollowUp = false;
        toast(`${payload.method === "Other" ? "Note" : payload.method} logged${fu ? " + follow-up set" : ""}`);
        clearDrafts(prefix);
        clearDrafts("c-fu-");
        render();
      } catch (err) {
        toast("Could not save: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });

  wireCategorySelects(container);

  document.querySelectorAll(".edit-int-btn").forEach((btn) =>
    btn.addEventListener("click", () => { uiState.editingIntId = uiState.editingIntId === btn.dataset.id ? null : btn.dataset.id; render(); })
  );
  document.querySelectorAll(".int-fix").forEach((form) => {
    form.querySelector(".int-fix-cancel").addEventListener("click", () => { uiState.editingIntId = null; render(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        const when = new Date(form.when.value);
        if (isNaN(when)) throw new Error("Pick a valid date and time");
        await setInteractionDetails(form.dataset.id, form.method.value, form.direction.value || null, when.toISOString());
        uiState.editingIntId = null;
        toast("Entry updated");
        render();
      } catch (err) {
        toast("Could not save: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll(".delete-note-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this logged entry and its comments? This cannot be undone.")) return;
      try {
        await deleteInteraction(btn.dataset.id);
        toast("Note deleted");
        render();
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    })
  );

  // comments
  document.querySelectorAll(".reply-btn").forEach((b) =>
    b.addEventListener("click", () => {
      uiState.replyingTo = b.dataset.reply;
      uiState.editingCommentId = null;
      uiState.focusId = `cm-${b.dataset.reply}-body`;
      render();
    })
  );
  document.querySelectorAll(".edit-comment-btn").forEach((b) =>
    b.addEventListener("click", () => {
      uiState.editingCommentId = b.dataset.id;
      uiState.replyingTo = null;
      uiState.focusId = `cme-${b.dataset.id}-body`;
      render();
    })
  );
  document.querySelectorAll(".delete-comment-btn").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this comment?")) return;
      try {
        await deleteComment(b.dataset.id);
        toast("Comment deleted");
        render();
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    })
  );
  document.querySelectorAll(".comment-form").forEach((form) => {
    const prefix = form.dataset.prefix;
    const editId = form.dataset.editId;
    const noteId = form.dataset.noteId;
    form.querySelector(".cancel-comment-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      if (editId) uiState.editingCommentId = null;
      else uiState.replyingTo = null;
      render();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = document.getElementById(`${prefix}body`).value.trim();
      if (!body) return;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (editId) {
          await updateComment(editId, body);
          uiState.editingCommentId = null;
          toast("Comment updated");
        } else {
          await addComment(noteId, body, currentProfile.full_name, currentProfile.id);
          uiState.replyingTo = null;
          toast("Comment posted");
        }
        clearDrafts(prefix);
        render();
      } catch (err) {
        toast("Could not save: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });

  // follow-ups on this meister
  wireFollowUpControls(container, {
    meisterId: meister.id,
    onEdit: (id) => { uiState.editingFuId = id; uiState.fuFormOpen = false; uiState.focusId = `fue-${id}-title`; render(); },
    onCancel: (editId) => { if (editId) uiState.editingFuId = null; else uiState.fuFormOpen = false; render(); },
    afterSave: (editId) => { if (editId) uiState.editingFuId = null; else uiState.fuFormOpen = false; },
  });
}

// ---------- guests tab ----------
function renderGuestsTab(guests) {
  return `
    <div id="tab-guests" class="tab-panel" style="${uiState.activeTab === "guests" ? "" : "display:none"}">
      <div class="toolbar">
        <p class="muted" style="margin:0">Guests this Meister has referred or sold a vehicle to.</p>
        <button type="button" id="add-guest-btn" class="btn btn-primary">${I.plus} Add Guest</button>
      </div>

      ${uiState.guestFormOpen && !uiState.editingGuestId ? guestFormHtml(null) : ""}

      <div class="table-wrap">
        <table class="crm-table">
          <thead><tr><th>Guest</th><th>Vehicle</th><th>Status</th><th>Purchase Date</th><th>Delivery</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            ${
              guests.length
                ? guests
                    .map((g) =>
                      uiState.editingGuestId === g.id
                        ? `<tr><td colspan="7" class="td-form">${guestFormHtml(g)}</td></tr>`
                        : `<tr>
                        <td class="cell-name">${escapeHtml(g.guest_name)}<div class="muted cell-sub">added by ${escapeHtml(g.created_by_name || "—")}</div></td>
                        <td>${escapeHtml(g.vehicle_purchased || "—")}</td>
                        <td><span class="guest-pill gs-${slug(g.guest_status || "Allocated")}">${escapeHtml(g.guest_status || "Allocated")}</span></td>
                        <td>${g.purchase_date ? fmtDate(g.purchase_date) : "—"}</td>
                        <td>${g.delivery_date ? fmtMonth(g.delivery_date) : "—"}</td>
                        <td>${escapeHtml(g.notes || "—")}</td>
                        <td class="td-actions">
                          <button class="icon-btn edit-guest-btn" data-id="${g.id}" title="Edit">${I.edit}</button>
                          ${isAdmin() ? `<button class="icon-btn danger delete-guest-btn" data-id="${g.id}" title="Delete">${I.trash}</button>` : ""}
                        </td>
                      </tr>`
                    )
                    .join("")
                : `<tr><td colspan="7"><div class="empty-state">No guests logged yet.</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function guestFormHtml(existing) {
  const p = existing ? `ge-${existing.id}-` : "g-";
  return `
    <form class="form-card guest-form" data-edit-id="${existing ? existing.id : ""}" data-prefix="${p}">
      <div class="form-grid">
        <div class="form-field"><label>Guest Name *</label><input id="${p}name" data-draft required value="${escapeAttr(dv(`${p}name`, existing?.guest_name))}" /></div>
        <div class="form-field"><label>Vehicle Purchased</label><input id="${p}vehicle" data-draft placeholder="e.g. GR GT" value="${escapeAttr(dv(`${p}vehicle`, existing?.vehicle_purchased))}" /></div>
        <div class="form-field"><label>Status</label>
          <select id="${p}status" data-draft>${GUEST_STATUSES.map((st) => `<option ${dv(`${p}status`, existing?.guest_status || "Allocated") === st ? "selected" : ""}>${st}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Purchase / Order Date</label><input id="${p}date" data-draft type="date" value="${escapeAttr(dv(`${p}date`, existing?.purchase_date))}" /></div>
        <div class="form-field"><label>Delivery Month</label>${(() => {
          const cur = String(existing?.delivery_date || "");
          const mm = dv(`${p}dmonth`, cur.slice(5, 7)), yy = dv(`${p}dyear`, cur.slice(0, 4));
          const y0 = new Date().getFullYear() - 1;
          const years = [...new Set([...Array.from({ length: 5 }, (_, i) => String(y0 + i)), ...(yy ? [yy] : [])])].sort();
          return `<div class="form-field-split month-pick"><select id="${p}dmonth" data-draft><option value="">Month</option>${["01","02","03","04","05","06","07","08","09","10","11","12"].map((v, i) => `<option value="${v}" ${mm === v ? "selected" : ""}>${new Date(2000, i, 1).toLocaleDateString("en-US", { month: "short" })}</option>`).join("")}</select><select id="${p}dyear" data-draft><option value="">Year</option>${years.map((v) => `<option ${yy === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>`;
        })()}</div>
        <div class="form-field"><label>Notes</label><input id="${p}notes" data-draft value="${escapeAttr(dv(`${p}notes`, existing?.notes))}" /></div>
      </div>
      <div class="composer-actions">
        <button type="button" class="btn cancel-guest-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">${existing ? "Save changes" : "Add Guest"}</button>
      </div>
    </form>`;
}

function wireGuestsTab(meister) {
  document.getElementById("add-guest-btn")?.addEventListener("click", () => {
    uiState.guestFormOpen = true;
    uiState.editingGuestId = null;
    uiState.focusId = "g-name";
    render();
  });

  document.querySelectorAll(".guest-form").forEach((form) => {
    const prefix = form.dataset.prefix;
    const editId = form.dataset.editId;
    form.querySelector(".cancel-guest-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      if (editId) uiState.editingGuestId = null;
      else uiState.guestFormOpen = false;
      render();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const g = (s) => document.getElementById(`${prefix}${s}`).value.trim();
      const fields = { guest_name: g("name"), vehicle_purchased: g("vehicle"), guest_status: g("status") || "Allocated", purchase_date: g("date") || null, delivery_date: g("dmonth") && g("dyear") ? `${g("dyear")}-${g("dmonth")}-01` : null, notes: g("notes") };
      if (fields.guest_status === "Delivered" && !fields.delivery_date) fields.delivery_date = fields.purchase_date || new Date().toISOString().slice(0, 10);
      if (!fields.guest_name) return;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (editId) {
          await updateGuest(editId, fields);
          uiState.editingGuestId = null;
          toast("Guest updated");
        } else {
          await addGuest(meister.id, fields, currentProfile.full_name, currentProfile.id);
          uiState.guestFormOpen = false;
          toast("Guest added");
        }
        clearDrafts(prefix);
        render();
      } catch (err) {
        toast("Could not save guest: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll(".edit-guest-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      uiState.editingGuestId = btn.dataset.id;
      uiState.guestFormOpen = false;
      render();
    })
  );
  document.querySelectorAll(".delete-guest-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this guest record? This cannot be undone.")) return;
      try {
        await deleteGuest(btn.dataset.id);
        toast("Guest deleted");
        render();
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    })
  );
}

function wireTabs() {
  document.querySelectorAll("#tabs .tab-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      uiState.activeTab = btn.dataset.tab;
      render();
    })
  );
}

function wirePhoneInput(input) {
  if (!input) return;
  input.addEventListener("input", () => {
    const atEnd = input.selectionEnd === input.value.length;
    input.value = formatPhone(input.value);
    if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
}

function directionChip(direction) {
  if (!direction) return "";
  const inb = direction === "Inbound";
  return `<span class="dir-chip ${inb ? "in" : "out"}" title="${inb ? "They reached out to us" : "We reached out to them"}">${inb ? I.inbound : I.outbound} ${escapeHtml(direction)}</span>`;
}

// ---- field validation (profile form) ----
function validateMeisterFields(f) {
  const errors = {};
  if (!f.name) errors["f-name"] = "Name is required";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errors["f-email"] = "Doesn't look like an email address";
  if (f.phone && f.phone.replace(/\D/g, "").length !== 10) errors["f-phone"] = "Phone needs 10 digits";
  if (f.zip && !/^\d{5}(-\d{4})?$/.test(f.zip)) errors["f-zip"] = "Zip should be 5 digits";
  if (f.state && !/^[A-Z]{2}$/.test(f.state)) errors["f-state"] = "Use the 2 letter state code";
  if (f.dealership_website && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(f.dealership_website)) errors["f-dealership-website"] = "Doesn't look like a web address";
  if (f.allocation_count !== null && f.allocation_count !== undefined && (!Number.isInteger(f.allocation_count) || f.allocation_count < 0)) errors["f-allocation"] = "Whole number, 0 or more";
  return errors;
}
function showFieldErrors(errors) {
  document.querySelectorAll(".field-error").forEach((e) => e.remove());
  document.querySelectorAll(".invalid").forEach((e) => e.classList.remove("invalid"));
  let first = null;
  for (const [id, msg] of Object.entries(errors)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.add("invalid");
    const m = document.createElement("div");
    m.className = "field-error";
    m.textContent = msg;
    el.insertAdjacentElement("afterend", m);
    first ||= el;
  }
  if (first) { first.focus(); first.scrollIntoView({ block: "center", behavior: "smooth" }); }
  return !first;
}

// ============================================================
// UTIL
// ============================================================
function isAdmin() {
  return !!currentProfile?.is_admin;
}

function toast(msg, kind = "ok") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.innerHTML = `${kind === "error" ? I.alert : I.check}<span>${escapeHtml(msg)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, kind === "error" ? 5000 : 2500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(str) {
  return escapeHtml(str || "");
}
function slug(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function initials(name) {
  return (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => (w[0] || "").toUpperCase())
    .join("");
}
function formatPhone(value) {
  if (!value) return "";
  const d = String(value).replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
function withProtocol(url) {
  if (!url) return "#";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function groupBy(list, keyFn) {
  const out = [];
  const idx = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!idx.has(k)) {
      idx.set(k, out.length);
      out.push([k, []]);
    }
    out[idx.get(k)][1].push(item);
  }
  return out;
}

// ---- dates ----
function pad(n) { return String(n).padStart(2, "0"); }
function toLocalInput(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}
function parseDateOnly(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00") : new Date(v);
}
// guest delivery dates are only known to the month: show "Mar 2027"
function fmtMonth(v) {
  if (!v) return "";
  const [y, m] = String(v).slice(0, 7).split("-").map(Number);
  if (!y || !m) return "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
// the soonest upcoming delivery among this Meister's guests (not yet delivered, this month or later)
function nextGuestDelivery(guests) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  return (guests || [])
    .filter((g) => g.delivery_date && g.guest_status !== "Delivered" && String(g.delivery_date).slice(0, 7) >= thisMonth)
    .sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date)))[0] || null;
}
function fmtDate(v) {
  if (!v) return "";
  return parseDateOnly(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" })}, ${fmtTime(iso)}`;
}
function monthLabel(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
// Works for both date-only strings (legacy) and full timestamps.
function followUpState(v) {
  if (!v) return null;
  const now = new Date();
  const d = parseDateOnly(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d < today) return "overdue";
    if (d.getTime() === today.getTime()) return "today";
    return "upcoming";
  }
  if (d < now) return "overdue";
  if (d.toDateString() === now.toDateString()) return "today";
  return "upcoming";
}
function followUpChip(v) {
  const s = followUpState(v);
  if (!s) return `<span class="muted">—</span>`;
  const label = s === "overdue" ? "Overdue" : s === "today" ? `Today ${fmtTime(v)}` : fmtDateTime(v);
  return `<span class="fu-chip fu-${s}">${I.calendar} ${label}</span>${s === "overdue" ? `<div class="muted cell-sub">${fmtDateTime(v)}</div>` : ""}`;
}
function relativeTime(iso) {
  if (!iso) return "—";
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const m = Math.round(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(iso);
}
