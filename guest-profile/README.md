# GR GT Applicant Profiles

Internal tool for the concierge team's applicant interviews. Fill in the form while you're on the phone, save, then open **Outputs** to get:

1. **Text Summary**: plain text ready to paste into the other internal tool. Full (sectioned) or Compact (one paragraph) with a character count and a Copy button.
2. **Bio Persona**: slot reserved on the Outputs page. Design to be added once the example layout is provided.

Same stack and look as the GR GT Concierge CRM: static site on GitHub Pages, Supabase behind it, individual team logins, live updates between teammates.

## What's in it

**Applicants list**: counts (Total, Complete, Drafts, VIP, LFA Owners; click to filter), search across name, dealer, vehicles and summary, filters by status, dealer and flags, sortable columns, Export Excel (Applicants and Garages tabs).

**Interview form**, in the order of the call:
* Bio: Name, Age Range, Preferred Dealer, Social Media, Relationships/Affiliation with TMNA, VIP
* Summary
* Motorsports / Events: HPDE Experience, Race Experience, Key Events Attended, What Drives You
* Car Profile: Current Garage (one row per vehicle with usage chips for Private Collection, Public Collection, Street, Track Only, Daily, and miles per year), LFA Ownership, Previous Toyota/Lexus, Recent Flips
* Buyer Profile: Timing, Spec Consideration, Why the GR GT (intended use)
* Call details: Interviewed By, Interview Date

Section checkmarks show what's been covered. Ctrl+S saves. Unsaved work is kept on that computer and offered back if the tab closes. If a teammate saved the same profile while you were editing, you're told instead of overwriting them. Draft / Complete status per profile.

**Account**: change your name and password. Admins get the Trash (restore or delete forever).

## Setup (about 15 minutes)

### 1. Supabase project
1. supabase.com → **New project** (name it something like `gr-gt-applicants`). Save the database password somewhere safe.
2. **SQL Editor** → New query → paste all of `sql/schema.sql` → Run.

### 2. Team logins
1. **Authentication → Users → Add user → Create new user**. Enter email and password, tick **Auto Confirm User**. Repeat for each concierge.
2. Make yourself admin: SQL Editor →
   ```sql
   update profiles set is_admin = true, full_name = 'Logan' where email = 'YOUR_EMAIL';
   ```
   Set `full_name` for the others the same way (or they can do it on the Account page).
3. **Authentication → Sign In / Providers → Email**: turn off "Allow new users to sign up" so only people you add can get in.

### 3. Connect the site
**Project Settings → API**. Copy the Project URL and the anon / publishable key into `js/config.js`.

### 4. GitHub Pages
1. New **private or public** repo (e.g. `gr-gt-profiles`). Upload everything in this folder (keep the folder structure).
2. Repo **Settings → Pages** → Source: Deploy from a branch → `main` / root → Save.
3. The site appears at `https://lwilliamsjd.github.io/<repo-name>/` in a minute or two.

Note: GitHub Pages on a free account only publishes **public** repos. The data itself stays protected by the login and Row Level Security either way; the repo only contains the page code and the public anon key.

### No live website option
Everything runs from the files, so the site also works by opening `index.html` through any local web server (for example, VS Code's Live Server). It still needs the Supabase project for the shared database. It can also be handed to company IT the same way the CRM was: it's plain HTML, CSS and JS with no build step.

## Changing the questions later
* Form layout and fields: `js/app.js` (search for `renderEditor`).
* Text summary wording (and the Bio Persona, once designed): `js/outputs.js`.
* New fields also need a column: `alter table applicants add column if not exists <name> text;` in the SQL Editor, and the field name added to `TEXT_FIELDS` in `js/app.js`.

## Files
```
index.html               page shell
css/styles.css           CRM look (dark, GR red)
js/config.js             Supabase URL + key  ← fill in
js/supabase-client.js    connection
js/api.js                database calls
js/outputs.js            text summary builder (Bio Persona goes here later)
js/app.js                screens and form
sql/schema.sql           run once in Supabase
```
