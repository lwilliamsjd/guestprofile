# GR Concierge (www.gr-concierge.com)

Two tools on one site, one database and one login:

| Address | Tool |
|---|---|
| `/profiles/` | GR GT Applicant Profiles (interview form, outputs, analytics) |
| `/crm/` | GR GT Concierge CRM (Meisters, conversations, follow ups) |

`www.gr-concierge.com` opens whichever tool was used last on that computer. The switch at the top left of both tools jumps between them; signing in to one signs you in to both.

## Repo layout
```
index.html          root: sends you to the last used tool
CNAME               custom domain for GitHub Pages
profiles/           Applicant Profiles app
crm/                Concierge CRM app
sql/schema.sql      Profiles tables (run first)
sql/crm_schema.sql  CRM tables, added to the same database (run second)
sql/crm_import.sql  one time import function for the old CRM's Excel export (run third)
.github/workflows/  daily Supabase keep alive
```
Both apps' `js/config.js` must hold the same Supabase URL and key.

## Adding the CRM to the database (one time)
1. Supabase → SQL Editor → paste all of `sql/crm_schema.sql` → Run. Safe to re-run.
2. Link each login to its Concierge name (this routes CRM notifications):
   ```sql
   update profiles set concierge = 'Logan'   where email = 'LOGAN_LOGIN_EMAIL';
   update profiles set concierge = 'Freddie' where email = 'FREDDIE_LOGIN_EMAIL';
   ```
3. Import the old CRM's data:
   * Supabase → SQL Editor → paste all of `sql/crm_import.sql` → Run.
   * In the CRM, open **Account** (admins only) → **Import CRM export** → choose the `GR-GT-CRM-Export-….xlsx` file the old CRM exported.
   * Check the preview: counts, and which current login each person in the file becomes. Then click **Import**.
   * It refuses to run a second time if Meisters already exist, so nothing gets duplicated. Comments whose conversation was deleted in the old CRM are skipped.

---

# GR GT Applicant Profiles

Internal tool for the concierge team's applicant interviews. Fill in the form while you're on the phone, save, then open **Outputs** to get:

1. **Text Summary**: plain text ready to paste into the other internal tool. Full (sectioned) or Compact (one paragraph) with a character count and a Copy button.
2. **Buyer Profile PDF**: the two page leadership profile, previewed on the Outputs page. **Print / Save PDF** opens the print window; choose Save as PDF. A photo can be dropped onto the preview for that PDF only; it is never saved in the tool. If any text is too long to fit, a note above the preview says which field to shorten.

Same stack and look as the GR GT Concierge CRM: static site on GitHub Pages, Supabase behind it, individual team logins, live updates between teammates.

## What's in it

**Applicants list**: counts (Total, Complete, Drafts, VIP, LFA Owners; click to filter), search across name, dealer, vehicles and summary, filters by status, dealer and flags, sortable columns, Export Excel (Applicants and Garages tabs).

**Profile ID**: every profile gets an automatic ID like GRGT-26-0142 (year created, then its number). It shows on the list, the form, the outputs and the PDF.

**Interview form**, in the order of the call:
* Bio: Name, Age Range (decades), City, State, Preferred Dealer, VIP (shown as a badge on the PDF), Bio (long, with a guide to how much fits the PDF), What Drives You (quoted on the PDF)
* Social & Connections: social accounts as rows (platform, handle, what they post, followers), TMC/TMNA relationships, track and driving clubs
* Motorsports / Events: HPDE Level, Race Level (None, Autocross / Time Attack, Club Racer, Pro Am, Pro), years on track, track days, racing series tags, details, key events, raw numbers vs overall experience slider with a note
* Car Profile: Current Garage (year, make, model, use, miles per year, year acquired, how it's used), Previous LFA Experience (Owned, Driven, Inquired, None) with a note, Toyota/Lexus history and significant past cars (years held), Recent Flips
* Buyer Profile: Why the GR GT, Intended Usage as percentages (Track/HPDE, Street/GT, Events/Shows, Collection) with a note, target delivery quarter with flexibility and a note, spec considerations as tags (star the priority), cross shopping
* Concierge Assessment: recommendation (Approve, Waitlist, Decline), write up, strengths and flags
* Call details: Interviewed By, Interview Date, Leadership Decision (Pending, Approve, Waitlist, Decline)

Average ownership, cars in garage, garage miles per year, the HPDE and racing scales and the pipeline on the PDF are calculated. The job title in the PDF footer comes from each person's Account page.

Section checkmarks show what's been covered. Ctrl+S saves. Unsaved work is kept on that computer and offered back if the tab closes. If a teammate saved the same profile while you were editing, you're told instead of overwriting them. Draft / Complete status per profile.

**Analytics**: KPI tiles (applicants, LFA owner share, track experience share, VIP share, average garage size, average miles per year) and breakdowns for Age Ranges, LFA Ownership, Planned GR GT Use, Motorsports Experience, Current Garage Use, Garage Size, Timing, Profile Signals (VIP, prior Toyota/Lexus, TMNA relationship, recent flips), Most Common Makes, Preferred Dealers, and Interviews by Team Member. Filter by status or VIP. Click any bar to see the applicants behind it.

**Data quality**: Timing, HPDE Level, Race Level and Recent Flips (Yes/No) are fixed choices so analytics count them exactly; the text boxes stay for detail. Interviewed By is picked from team logins. Preferred Dealer suggests names already used. Each garage vehicle has a Make (filled in automatically from the vehicle name, editable).

**Decisions and history**: each profile has an Allocation Outcome (Pending, Awarded, Waitlist, Declined), shown and filterable on the Applicants list. A profile can't be marked Complete until the key fields are filled. Creating a profile with a name that already exists asks first. Every save records who changed what, shown under Change History at the bottom of the profile.

**Backups and keep alive**: admins see a reminder on the Applicants page when nobody has exported Excel in 14 days. A GitHub Action (`.github/workflows/keepalive.yml`) pings Supabase daily so the free project doesn't pause; check it under the repo's **Actions** tab.

**During calls**: Drafts autosave every 30 seconds (and whenever you pause typing, switch tabs or leave the page), so nothing depends on clicking Save. Complete profiles still save with the Save button. The **Notes** button (or Ctrl+J) opens a Call Notes panel beside the form for quick typing during the call; it saves with the profile but isn't included in the summary or Bio. Autosave history is grouped into one Change History entry per editing session.

**Working together**: the Applicants list shows who has a profile open ("Freddie is editing"), and the profile itself shows "Freddie also has this open". If a teammate saves a profile you have open, it refreshes with their changes; if you have unsaved changes, you get a banner to load theirs or keep yours, and autosave pauses so nothing is overwritten. **Needs another call** (with a note) flags a guest for a follow up, with a count and filter on the Applicants list. A **Connection lost** banner appears if the internet or the live connection drops; keep typing, and it saves when the connection is back.

**Account**: change your name and password. Admins get the Trash (restore or delete forever).

## Updating an existing database
Already set up before an update? Paste the whole `sql/schema.sql` into **SQL Editor** and run it. Every statement in it is safe to re-run, so it only adds what's missing.

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
