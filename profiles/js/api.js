import { supabase } from "./supabase-client.js?v=202610081636";

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
export async function getCurrentProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_admin, job_title")
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
