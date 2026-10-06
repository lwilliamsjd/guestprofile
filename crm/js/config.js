// Shared with the Profiles tool (same database, same logins).
// Keep these identical to ../../profiles/js/config.js
// Supabase dashboard -> Project Settings -> API
//   Project URL      -> SUPABASE_URL
//   anon public key  -> SUPABASE_ANON_KEY
// These are safe to publish in a public GitHub repo — access is
// controlled by Row Level Security + requiring a login, not by
// hiding this key.

export const SUPABASE_URL = "https://bauelctcokdanunxahpn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_aqQRez4_nOCN5HpUzMkgsA_mSYy7QTM";

export const APP_NAME = "Meister Tracker";
