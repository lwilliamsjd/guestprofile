import { supabase } from "./supabase-client.js?v=202610081622";

// ---------- auth / account ----------
export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_admin, concierge, notify_comments, notify_activity, last_export_at")
    .eq("id", session.user.id)
    .single();
  if (error) {
    return { id: session.user.id, full_name: session.user.email, email: session.user.email, is_admin: false, concierge: null, notify_comments: true, notify_activity: true, last_export_at: null };
  }
  return data;
}

export async function setNotificationPrefs({ notify_comments, notify_activity }) {
  const { error } = await supabase.rpc("set_notification_prefs", { p_comments: notify_comments, p_activity: notify_activity });
  if (error) throw error;
}

// ---------- notifications ----------
export async function listNotifications(userId, limit = 100) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*, meisters(name, deleted_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.filter((n) => !n.meisters || !n.meisters.deleted_at);
}

export async function listUnreadNotifications(userId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, meister_id")
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) return [];
  return data;
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function markMeisterNotificationsRead(userId, meisterId) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("meister_id", meisterId)
    .is("read_at", null);
  if (error) throw error;
}

export async function listTeam() {
  const { data, error } = await supabase.from("profiles").select("id, full_name, concierge, last_export_at").order("full_name");
  if (error) throw error;
  return data;
}

// ---------- analytics (everything the dashboard needs) ----------
export async function fetchAnalyticsData() {
  const live = (q) => q.is("meisters.deleted_at", null);
  const [ints, meisters, guests, fus, team, cats, hist] = await Promise.all([
    live(supabase
      .from("interactions")
      .select("id, meister_id, method, direction, note, category_id, occurred_at, created_by, created_by_name, meisters!inner(name, concierge, dealership, status, deleted_at)"))
      .order("occurred_at", { ascending: false }),
    supabase.from("meisters").select("id, name, dealership, job_title, status, concierge, created_at, updated_at").is("deleted_at", null).order("name"),
    live(supabase.from("guests").select("*, meisters!inner(name, concierge, deleted_at)")).order("purchase_date", { ascending: false, nullsFirst: false }),
    live(supabase.from("follow_ups").select("*, meisters!inner(name, concierge, deleted_at)")).is("done_at", null).order("due_at", { ascending: true }),
    supabase.from("profiles").select("id, full_name, concierge"),
    supabase.from("question_categories").select("*").order("sort_order"),
    live(supabase.from("status_history").select("*, meisters!inner(name, concierge, dealership, deleted_at)")).order("changed_at", { ascending: false }),
  ]);
  for (const r of [ints, meisters, guests, fus, team, cats, hist]) if (r.error) throw r.error;
  return { interactions: ints.data, meisters: meisters.data, guests: guests.data, followUps: fus.data, team: team.data, categories: cats.data, statusHistory: hist.data };
}

export async function setDisplayName(newName) {
  const { error } = await supabase.rpc("set_display_name", { new_name: newName });
  if (error) throw error;
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ---------- meisters ----------
export async function listMeisters() {
  const { data, error } = await supabase.from("meisters").select("*").is("deleted_at", null).order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listTrashedMeisters() {
  const { data, error } = await supabase.from("meisters").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Distinct dealership names already in use (for the autocomplete + rollup page).
export async function listDealerships() {
  const { data, error } = await supabase.from("meisters").select("dealership").is("deleted_at", null).not("dealership", "is", null);
  if (error) throw error;
  const seen = new Map();
  for (const r of data) {
    const d = (r.dealership || "").trim();
    if (d) seen.set(d.toLowerCase(), seen.get(d.toLowerCase()) || d);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// Possible duplicates of a Meister about to be created (same phone, email, or name at the same dealership).
export async function findDuplicateMeisters({ name, dealership, phone, email }, excludeId = null) {
  const { data, error } = await supabase.from("meisters").select("id, name, dealership, phone, email").is("deleted_at", null);
  if (error) throw error;
  const norm = (v) => (v || "").toLowerCase().replace(/\s+/g, " ").trim();
  const digits = (v) => (v || "").replace(/\D/g, "");
  return data.filter((m) => {
    if (excludeId && m.id === excludeId) return false;
    if (phone && digits(phone).length >= 10 && digits(m.phone) === digits(phone)) return true;
    if (email && norm(m.email) && norm(m.email) === norm(email)) return true;
    if (name && norm(m.name) === norm(name) && norm(m.dealership) === norm(dealership)) return true;
    return false;
  });
}

// Global search: Meisters by any profile field, plus logged notes by text.
export async function searchEverything(q, limit = 15) {
  const term = q.replace(/[,()%]/g, " ").trim();
  if (!term) return { meisters: [], notes: [] };
  const like = `%${term}%`;
  const [ms, ns] = await Promise.all([
    supabase
      .from("meisters")
      .select("id, name, dealership, job_title, city, state, phone, email, status, concierge")
      .is("deleted_at", null)
      .or(`name.ilike.${like},dealership.ilike.${like},job_title.ilike.${like},city.ilike.${like},email.ilike.${like},phone.ilike.${like},profile_summary.ilike.${like}`)
      .limit(limit),
    supabase
      .from("interactions")
      .select("id, meister_id, method, note, occurred_at, created_by_name, meisters!inner(name, deleted_at)")
      .is("meisters.deleted_at", null)
      .ilike("note", like)
      .order("occurred_at", { ascending: false })
      .limit(limit),
  ]);
  if (ms.error) throw ms.error;
  if (ns.error) throw ns.error;
  return { meisters: ms.data, notes: ns.data };
}

// Bulk create from the Import page. Inserts in batches; returns the created rows.
export async function importMeisters(rows, authorName, authorId) {
  const created = [];
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((r) => ({ ...r, created_by: authorId, created_by_name: authorName, updated_by_name: authorName }));
    const { data, error } = await supabase.from("meisters").insert(batch).select();
    if (error) throw error;
    created.push(...data);
  }
  return created;
}

export async function listStatusHistory(meisterId) {
  const { data, error } = await supabase.from("status_history").select("*").eq("meister_id", meisterId).order("changed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function markExported() {
  const { error } = await supabase.rpc("mark_exported");
  if (error) throw error;
}

// Lightweight per-meister rollups for the dashboard (last contact, counts,
// and the signed-in user's own next pending follow-up).
export async function listMeisterRollups(userId) {
  const [ints, gs, fus] = await Promise.all([
    supabase.from("interactions").select("meister_id, occurred_at"),
    supabase.from("guests").select("meister_id"),
    supabase.from("follow_ups").select("id, meister_id, title, due_at").eq("user_id", userId).is("done_at", null),
  ]);
  if (ints.error) throw ints.error;
  if (gs.error) throw gs.error;
  if (fus.error) throw fus.error;

  const blank = () => ({ last_contact: null, interaction_count: 0, guest_count: 0, my_follow_up: null });
  const rollup = {};
  for (const i of ints.data) {
    const r = (rollup[i.meister_id] ||= blank());
    r.interaction_count += 1;
    if (!r.last_contact || i.occurred_at > r.last_contact) r.last_contact = i.occurred_at;
  }
  for (const g of gs.data) (rollup[g.meister_id] ||= blank()).guest_count += 1;
  for (const f of fus.data) {
    const r = (rollup[f.meister_id] ||= blank());
    if (!r.my_follow_up || f.due_at < r.my_follow_up.due_at) r.my_follow_up = f;
  }
  return rollup;
}

// ---------- follow-ups ----------
export async function listFollowUpsForMeister(meisterId) {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*")
    .eq("meister_id", meisterId)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listMyFollowUps(userId) {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*, meisters!inner(name, deleted_at)")
    .is("meisters.deleted_at", null)
    .eq("user_id", userId)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listRecentDoneFollowUps(limit = 300) {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*, meisters!inner(name, concierge, deleted_at)")
    .is("meisters.deleted_at", null)
    .not("done_at", "is", null)
    .order("done_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function countMyDueFollowUps(userId) {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const { count, error } = await supabase
    .from("follow_ups")
    .select("id, meisters!inner(deleted_at)", { count: "exact", head: true })
    .is("meisters.deleted_at", null)
    .eq("user_id", userId)
    .is("done_at", null)
    .lte("due_at", endOfToday.toISOString());
  if (error) return 0;
  return count || 0;
}

export async function addFollowUp({ meister_id, interaction_id = null, title, due_at }, userName, userId) {
  const { data, error } = await supabase
    .from("follow_ups")
    .insert([{ meister_id, interaction_id, title, due_at, user_id: userId, user_name: userName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFollowUp(id, fields) {
  const { data, error } = await supabase.from("follow_ups").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFollowUp(id) {
  const { error } = await supabase.from("follow_ups").delete().eq("id", id);
  if (error) throw error;
}

// ---------- comments ----------
export async function listCommentsForInteractions(interactionIds) {
  if (!interactionIds.length) return [];
  const { data, error } = await supabase
    .from("interaction_comments")
    .select("*")
    .in("interaction_id", interactionIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listCommentCounts() {
  const { data, error } = await supabase.from("interaction_comments").select("interaction_id");
  if (error) throw error;
  const counts = {};
  for (const c of data) counts[c.interaction_id] = (counts[c.interaction_id] || 0) + 1;
  return counts;
}

export async function addComment(interactionId, body, authorName, authorId) {
  const { data, error } = await supabase
    .from("interaction_comments")
    .insert([{ interaction_id: interactionId, body, created_by: authorId, created_by_name: authorName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateComment(id, body) {
  const { data, error } = await supabase
    .from("interaction_comments")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from("interaction_comments").delete().eq("id", id);
  if (error) throw error;
}

export async function getMeister(id) {
  const { data, error } = await supabase.from("meisters").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createMeister(fields, authorName, authorId) {
  const { data, error } = await supabase
    .from("meisters")
    .insert([{ ...fields, created_by: authorId, created_by_name: authorName, updated_by_name: authorName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// expectedUpdatedAt: pass the updated_at you loaded; if someone saved in between,
// the update matches nothing and a CONFLICT error is thrown instead of overwriting.
export async function updateMeister(id, fields, authorName, expectedUpdatedAt = null) {
  let q = supabase.from("meisters").update({ ...fields, updated_by_name: authorName }).eq("id", id);
  if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await q.select();
  if (error) throw error;
  if (!data || !data.length) {
    const err = new Error("This profile was changed by someone else while you were editing.");
    err.code = "CONFLICT";
    throw err;
  }
  return data[0];
}

// Soft delete: the Meister moves to the Trash (Account page) and can be restored.
export async function deleteMeister(id, byName) {
  const { data, error } = await supabase
    .from("meisters")
    .update({ deleted_at: new Date().toISOString(), deleted_by_name: byName || null })
    .eq("id", id)
    .select();
  if (error) throw error;
  if (!data || !data.length) throw new Error("Could not delete (not found or no permission)");
}

export async function restoreMeister(id) {
  const { data, error } = await supabase.from("meisters").update({ deleted_at: null, deleted_by_name: null }).eq("id", id).select();
  if (error) throw error;
  if (!data || !data.length) throw new Error("Could not restore");
}

// Permanent delete (admin only, from the Trash). Everything under the Meister goes with it.
export async function purgeMeister(id) {
  const { error } = await supabase.from("meisters").delete().eq("id", id);
  if (error) throw error;
}

// ---------- question categories ----------
export async function listCategories() {
  const { data, error } = await supabase.from("question_categories").select("*").order("sort_order").order("name");
  if (error) throw error;
  return data;
}

export async function addCategory(name) {
  const { data, error } = await supabase.from("question_categories").insert([{ name }]).select().single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id, fields) {
  const { data, error } = await supabase.from("question_categories").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from("question_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function countCategoryUses(id) {
  const { count, error } = await supabase.from("interactions").select("id", { count: "exact", head: true }).eq("category_id", id);
  if (error) throw error;
  return count || 0;
}

export async function setInteractionCategory(interactionId, categoryId) {
  const { error } = await supabase.rpc("set_interaction_category", { p_id: interactionId, p_category_id: categoryId });
  if (error) throw error;
}

// Everything needed for the Insights page in one go.
export async function listInteractionsForInsights() {
  const { data, error } = await supabase
    .from("interactions")
    .select("id, meister_id, method, note, category_id, occurred_at, created_by_name, meisters(name, concierge, dealership)")
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- interactions ----------
export async function listInteractions(meisterId) {
  const { data, error } = await supabase
    .from("interactions")
    .select("*")
    .eq("meister_id", meisterId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addInteraction(meisterId, { method, note, occurred_at, category_id = null, direction = null }, authorName, authorId) {
  const { data, error } = await supabase
    .from("interactions")
    .insert([{ meister_id: meisterId, method, note, occurred_at, category_id, direction, created_by: authorId, created_by_name: authorName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInteraction(id) {
  const { error } = await supabase.from("interactions").delete().eq("id", id);
  if (error) throw error;
}

// ---------- guests ----------
export async function listGuests(meisterId) {
  const { data, error } = await supabase
    .from("guests")
    .select("*")
    .eq("meister_id", meisterId)
    .order("purchase_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function addGuest(meisterId, fields, authorName, authorId) {
  const { data, error } = await supabase
    .from("guests")
    .insert([{ meister_id: meisterId, ...fields, created_by: authorId, created_by_name: authorName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGuest(id, fields) {
  const { data, error } = await supabase.from("guests").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGuest(id) {
  const { error } = await supabase.from("guests").delete().eq("id", id);
  if (error) throw error;
}

// ---------- activity feed (recent across everything) ----------
export async function listRecentActivity(limit = 300) {
  const { data, error } = await supabase
    .from("interactions")
    .select("*, meisters!inner(name, concierge, deleted_at)")
    .is("meisters.deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ---------- realtime ----------
export function subscribeToChanges(onChange, onStatus) {
  const channel = supabase
    .channel("crm-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "meisters" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "interactions" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "follow_ups" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "interaction_comments" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "question_categories" }, onChange)
    .subscribe((status) => onStatus && onStatus(status));
  return () => supabase.removeChannel(channel);
}

// Fires on sign-in / sign-out / token refresh so the app can react to a dropped session.
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data.subscription.unsubscribe();
}

// ---------- export helper ----------
export async function fetchAllForExport() {
  const live = (q) => q.is("meisters.deleted_at", null);
  const [meisters, interactions, guests, followUps, comments, categories, history] = await Promise.all([
    supabase.from("meisters").select("*").is("deleted_at", null).order("name"),
    live(supabase.from("interactions").select("*, meisters!inner(name, deleted_at)")).order("occurred_at", { ascending: false }),
    live(supabase.from("guests").select("*, meisters!inner(name, deleted_at)")).order("purchase_date", { ascending: false, nullsFirst: false }),
    live(supabase.from("follow_ups").select("*, meisters!inner(name, deleted_at)")).order("due_at", { ascending: true }),
    supabase.from("interaction_comments").select("*").order("created_at", { ascending: true }),
    supabase.from("question_categories").select("*").order("sort_order"),
    live(supabase.from("status_history").select("*, meisters!inner(name, deleted_at)")).order("changed_at", { ascending: false }),
  ]);
  for (const r of [meisters, interactions, guests, followUps, comments, categories, history]) if (r.error) throw r.error;
  return { meisters: meisters.data, interactions: interactions.data, guests: guests.data, followUps: followUps.data, comments: comments.data, categories: categories.data, statusHistory: history.data };
}

// ---------- one time import of the old CRM's Excel export ----------
export async function importCrmExport(payload, allowExisting = false) {
  const { data, error } = await supabase.rpc("import_crm_export", { p: payload, p_allow_existing: allowExisting });
  if (error) throw error;
  return data;
}
