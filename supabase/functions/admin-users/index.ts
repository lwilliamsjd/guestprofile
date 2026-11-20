// Supabase Edge Function: admin-users
// Lets a signed in admin create a login and pick its access level,
// from Applicant Profiles → Account → Team and access.
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function →
// Via Editor, name it admin-users, paste this file, Deploy.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) return json({ error: "Please sign in again." }, 401);
    const { data: me } = await admin.from("profiles").select("is_admin").eq("id", who.user.id).single();
    if (!me?.is_admin) return json({ error: "Only admins can add users." }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const password = String(body.password || "");
    const level = String(body.level || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email." }, 400);
    if (!fullName) return json({ error: "Enter their name." }, 400);
    if (password.length < 8) return json({ error: "The temporary password needs 8 or more characters." }, 400);
    if (!["admin", "full", "profiles"].includes(level)) return json({ error: "Pick an access level." }, 400);

    const { data: made, error: makeErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (makeErr) {
      const msg = /already|registered|exists/i.test(makeErr.message) ? "A login with that email already exists." : makeErr.message;
      return json({ error: msg }, 400);
    }
    const id = made.user.id;
    // The on_auth_user_created trigger makes the profiles row; set its name and access.
    const patch = { full_name: fullName, email, is_admin: level === "admin", crm_access: level !== "profiles" };
    let { error: upErr } = await admin.from("profiles").update(patch).eq("id", id);
    if (upErr) ({ error: upErr } = await admin.from("profiles").upsert({ id, ...patch }));
    if (upErr) return json({ error: "Login created, but setting its access failed: " + upErr.message, id }, 500);
    return json({ id });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
