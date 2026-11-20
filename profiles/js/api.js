import { supabase } from "./supabase-client.js?v=202611201724";

// ---------- auth ----------
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
export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session));
}
// Team list with CRM access, for the admin "Team access" box.
export async function listTeamAccess() {
  const { data, error } = await supabase.from("profiles").select("*").order("full_name");
  if (error) throw error;
  return data || [];
}
export async function setUserAccess(userId, level) {
  const { error } = await supabase.rpc("set_user_access", { p_user: userId, p_level: level });
  if (error) throw new Error(/set_user_access/.test(error.message) ? "Run crm-access.sql in Supabase first." : error.message);
}
// Creates a login through the admin-users Edge Function (needs the service key, so it can't run in the browser).
export async function createUserLogin({ full_name, email, password, level }) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { full_name, email, password, level } });
  if (error) {
    let msg = "";
    try { msg = (await error.context.json()).error; } catch {}
    if (!msg && /Failed to send|not found|404/i.test(error.message || "")) msg = "The admin-users function isn't set up in Supabase yet.";
    throw new Error(msg || error.message || "Couldn't create the login");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export async function getCurrentProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (error) return { id: session.user.id, full_name: session.user.email, email: session.user.email, is_admin: false, job_title: "" };
  return data;
}
export async function setDisplayName(name) {
  const { error } = await supabase.rpc("set_display_name", { new_name: name });
  if (error) throw error;
}
export async function setJobTitle(title) {
  const { error } = await supabase.rpc("set_job_title", { new_title: title });
  if (error) throw error;
}
export async function changePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// ---------- applicants ----------
export async function listApplicants() {
  const { data, error } = await supabase
    .from("applicants")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function getApplicant(id) {
  const { data, error } = await supabase.from("applicants").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}
export async function createApplicant(fields, profile) {
  const { data, error } = await supabase
    .from("applicants")
    .insert({ ...fields, created_by: profile.id, created_by_name: profile.full_name, updated_by: profile.id, updated_by_name: profile.full_name })
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function updateApplicant(id, fields, profile, expectedUpdatedAt) {
  // refuse to overwrite a teammate's newer save
  if (expectedUpdatedAt) {
    const { data: cur } = await supabase.from("applicants").select("updated_at, updated_by_name").eq("id", id).single();
    if (cur && new Date(cur.updated_at).getTime() > new Date(expectedUpdatedAt).getTime() + 500) {
      const err = new Error(`${cur.updated_by_name || "A teammate"} saved this profile while you were editing.`);
      err.code = "CONFLICT";
      throw err;
    }
  }
  const { data, error } = await supabase
    .from("applicants")
    .update({ ...fields, updated_by: profile.id, updated_by_name: profile.full_name })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function trashApplicant(id) {
  const { error } = await supabase.from("applicants").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function listTrash() {
  const { data, error } = await supabase.from("applicants").select("id, name, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function restoreApplicant(id) {
  const { error } = await supabase.from("applicants").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}
export async function deleteApplicantForever(id) {
  const { error } = await supabase.from("applicants").delete().eq("id", id);
  if (error) throw error;
}

export function subscribeApplicants(cb, onStatus) {
  const ch = supabase
    .channel("applicants-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, (p) => cb(p))
    .subscribe((status) => onStatus && onStatus(status));
  return () => supabase.removeChannel(ch);
}

// ---------- who has which profile open (live, nothing stored) ----------
let presenceCh = null;
let presenceMeta = { name: "", applicant: null };
export function joinPresence(profile, onSync) {
  if (presenceCh) return;
  presenceMeta.name = profile.full_name;
  presenceCh = supabase.channel("who-is-editing", { config: { presence: { key: profile.id } } });
  presenceCh
    .on("presence", { event: "sync" }, () => onSync(presenceCh.presenceState()))
    .subscribe(async (status) => { if (status === "SUBSCRIBED") await presenceCh.track({ ...presenceMeta }); });
}
export function setEditing(applicantId) {
  if (presenceMeta.applicant === applicantId) return;
  presenceMeta.applicant = applicantId;
  if (presenceCh) presenceCh.track({ ...presenceMeta }).catch(() => {});
}
export function leavePresence() {
  if (presenceCh) { supabase.removeChannel(presenceCh); presenceCh = null; }
  presenceMeta.applicant = null;
}

// ---------- team ----------
export async function listTeam() {
  const { data, error } = await supabase.from("profiles").select("id, full_name, job_title").order("full_name");
  if (error) return [];
  return data;
}

// ---------- change history ----------
export async function listChanges(applicantId) {
  const { data, error } = await supabase
    .from("applicant_changes")
    .select("*")
    .eq("applicant_id", applicantId)
    .order("changed_at", { ascending: false });
  if (error) return [];
  return data;
}
export async function addChange(applicantId, changes, profile) {
  if (!changes || !changes.length) return null;
  const { data, error } = await supabase.from("applicant_changes").insert({
    applicant_id: applicantId,
    changed_by: profile.id,
    changed_by_name: profile.full_name,
    changes,
  }).select("id").single();
  if (error) { console.warn("History not recorded:", error.message); return null; }
  return data.id;
}
// one editing session = one history entry, kept up to date as autosave runs
export async function updateChange(id, changes) {
  const { error } = await supabase.from("applicant_changes").update({ changes, changed_at: new Date().toISOString() }).eq("id", id);
  if (error) console.warn("History not updated:", error.message);
  return !error;
}

// ---------- backups ----------
export async function markExported() {
  const { error } = await supabase.rpc("mark_exported");
  if (error) console.warn("Export not recorded:", error.message);
}
export async function lastExportAt() {
  const { data, error } = await supabase
    .from("profiles")
    .select("last_export_at, full_name")
    .not("last_export_at", "is", null)
    .order("last_export_at", { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0];
}

// ---------- inquiries (guests who reach out to us directly, not through a dealer) ----------
const NO_INQ = "The Inquiries list needs its database update. Run the INQUIRIES block of sql/schema.sql in Supabase first.";
const inqErr = (error) => (/inquiries/.test(error.message || "") && /exist|schema cache|relation/i.test(error.message || "") ? new Error(NO_INQ) : error);
export async function listInquiries() {
  const { data, error } = await supabase.from("inquiries").select("*").order("received_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw inqErr(error);
  return data;
}
export async function getInquiry(id) {
  const { data, error } = await supabase.from("inquiries").select("*").eq("id", id).single();
  if (error) throw inqErr(error);
  return data;
}
export async function createInquiry(fields, profile) {
  const { data, error } = await supabase.from("inquiries")
    .insert({ ...fields, created_by: profile.id, created_by_name: profile.full_name, updated_by_name: profile.full_name })
    .select().single();
  if (error) throw inqErr(error);
  return data;
}
export async function updateInquiry(id, fields, profile) {
  const { data, error } = await supabase.from("inquiries").update({ ...fields, updated_by_name: profile.full_name }).eq("id", id).select().single();
  if (error) throw inqErr(error);
  return data;
}
export async function deleteInquiry(id) {
  const { error } = await supabase.from("inquiries").delete().eq("id", id);
  if (error) throw inqErr(error);
}
// Participating dealerships (from the Concierge CRM) with a ZIP, for "closest dealer".
export async function listDealerLocations() {
  const r = await supabase.rpc("dealer_locations");
  if (!r.error) return (r.data || []).map((d) => ({ dealership: d.dealership, zip: String(d.zip), city: d.city || "", state: d.state || "" }));
  const { data, error } = await supabase.from("meisters").select("*").is("deleted_at", null);
  if (error) return [];
  const seen = new Map();
  for (const m of data) {
    if (m.departed_at || !m.dealership || !m.zip) continue;
    const key = m.dealership.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, { dealership: m.dealership.trim(), zip: String(m.zip), city: m.city || "", state: m.state || "" });
  }
  return [...seen.values()];
}

// ---------- inquiry notes log, attachments, team alerts ----------
export async function listInquiryNotes(inquiryId = null) {
  let q = supabase.from("inquiry_notes").select("*").order("created_at", { ascending: false });
  if (inquiryId) q = q.eq("inquiry_id", inquiryId);
  const { data, error } = await q;
  if (error) return [];
  return data;
}
export async function addInquiryNote(inquiryId, body, profile) {
  const { data, error } = await supabase.from("inquiry_notes")
    .insert({ inquiry_id: inquiryId, body, author_id: profile.id, author_name: profile.full_name }).select().single();
  if (error) throw inqErr(error);
  return data;
}
export async function deleteInquiryNote(id) {
  const { error } = await supabase.from("inquiry_notes").delete().eq("id", id);
  if (error) throw error;
}
const BUCKET = "inquiry-files";
export async function listInquiryFiles(inquiryId) {
  const { data, error } = await supabase.from("inquiry_files").select("*").eq("inquiry_id", inquiryId).order("created_at", { ascending: false });
  if (error) return [];
  return data;
}
export async function uploadInquiryFile(inquiryId, file, profile) {
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `${inquiryId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from("inquiry_files").insert({
    inquiry_id: inquiryId, path, file_name: file.name, size_bytes: file.size, content_type: file.type || null, uploaded_by: profile.id, uploaded_by_name: profile.full_name,
  }).select().single();
  if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error; }
  return data;
}
export async function inquiryFileUrl(f, download = true) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 120, download ? { download: f.file_name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
export async function deleteInquiryFile(f) {
  const { error } = await supabase.from("inquiry_files").delete().eq("id", f.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([f.path]);
}
export async function getInquirySeen(userId) {
  const { data, error } = await supabase.from("inquiry_seen").select("seen_at").eq("user_id", userId).maybeSingle();
  if (error) return { missing: true };
  return { seen_at: data?.seen_at || null };
}
export async function markInquiriesSeen(userId) {
  await supabase.from("inquiry_seen").upsert({ user_id: userId, seen_at: new Date().toISOString() });
}
