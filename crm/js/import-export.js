// Reads the old CRM's Excel export in the browser and sends it to the
// import_crm_export database function (sql/crm_import.sql).
import { importCrmExport } from "./api.js?v=202610091420";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = (v) => (v instanceof Date && !isNaN(v) ? v.toISOString() : v ? String(v) : "");
const day = (v) => (v instanceof Date && !isNaN(v) ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : v ? String(v).slice(0, 10) : "");
const txt = (v) => (v == null ? "" : String(v).trim());

function sheet(wb, name) {
  const ws = wb.Sheets[name];
  return ws ? window.XLSX.utils.sheet_to_json(ws, { defval: "", raw: true }) : [];
}

export function readExport(wb) {
  const categories = sheet(wb, "Question Types")
    .filter((r) => txt(r["Question Type"]) && !txt(r["Question Type"]).startsWith("("))
    .map((r) => ({ name: txt(r["Question Type"]), active: txt(r.Status) !== "Retired" }));
  const meisters = sheet(wb, "Meisters").filter((r) => txt(r.Name)).map((r) => ({
    name: txt(r.Name), job_title: txt(r["Job Title"]), concierge: txt(r.Concierge), status: txt(r.Status),
    phone: txt(r.Phone), email: txt(r.Email), dealership: txt(r.Dealership), dealership_website: txt(r["Dealership Website"]),
    city: txt(r.City), state: txt(r.State), zip: txt(r.Zip), allocation_count: txt(r.Allocation).replace(/[^0-9]/g, ""),
    pma: txt(r.PMA), delivery_eta: day(r["Delivery ETA"]), profile_summary: txt(r["Profile Summary"]),
    created_by_name: txt(r["Created By"]), created_at: iso(r["Created At"]),
    updated_by_name: txt(r["Last Updated By"]), updated_at: iso(r["Last Updated At"]),
  }));
  const interactions = sheet(wb, "Interactions").filter((r) => txt(r.Meister)).map((r) => ({
    meister: txt(r.Meister), method: txt(r.Method), direction: txt(r.Direction), category: txt(r["Question Type"]),
    occurred_at: iso(r["Date/Time"]), note: String(r.Note ?? ""), created_by_name: txt(r["Logged By"]),
    created_at: iso(r["Logged At"]), edited_by_name: txt(r["Edited By"]), edited_at: iso(r["Edited At"]),
  }));
  const comments = sheet(wb, "Comments").filter((r) => txt(r.Meister) && txt(r.Comment)).map((r) => ({
    meister: txt(r.Meister), on_activity: String(r["On Activity"] ?? ""), body: String(r.Comment), by: txt(r.By),
    created_at: iso(r["Date/Time"]), edited_at: iso(r["Edited At"]),
  }));
  const followups = sheet(wb, "Follow-Ups").filter((r) => txt(r.Meister) && txt(r.Title)).map((r) => ({
    meister: txt(r.Meister), title: txt(r.Title), due_at: iso(r.Due), owner: txt(r.Owner),
    done_at: iso(r["Completed At"]), created_at: iso(r["Created At"]),
  }));
  const history = sheet(wb, "Status History").filter((r) => txt(r.Meister) && txt(r.To)).map((r) => ({
    meister: txt(r.Meister), from: txt(r.From), to: txt(r.To), changed_by_name: txt(r["Changed By"]), changed_at: iso(r["Changed At"]),
  }));
  return { categories, meisters, interactions, comments, followups, history };
}

// same rules as public._import_user in sql/crm_import.sql
function nameMatch(name, team) {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const last = (x) => (x.includes(" ") ? x.split(" ").pop() : null);
  const first4 = (x) => x.split(" ")[0].slice(0, 4);
  const names = team.map((t) => ({ t, f: (t.full_name || "").trim().toLowerCase() }));
  return (names.find((x) => x.f === n) ||
    names.find((x) => last(n) && last(x.f) && last(x.f) === last(n)) ||
    names.find((x) => x.f && first4(x.f) === first4(n)) || {}).t || null;
}

export function wireImport(container, team, onDone, toast) {
  const input = container.querySelector("#import-file");
  const out = container.querySelector("#import-preview");
  if (!input || !out) return;
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    if (!window.XLSX) { out.innerHTML = `<p class="fu-overdue">Excel reader didn't load. Check your connection and refresh.</p>`; return; }
    let data;
    try {
      const wb = window.XLSX.read(await file.arrayBuffer(), { cellDates: true });
      if (!wb.Sheets["Meisters"]) throw new Error("This doesn't look like a CRM export (no Meisters tab).");
      data = readExport(wb);
    } catch (err) { out.innerHTML = `<p class="fu-overdue">${esc(err.message)}</p>`; return; }

    const names = new Set();
    data.meisters.forEach((m) => { names.add(m.created_by_name); names.add(m.updated_by_name); });
    data.interactions.forEach((i) => names.add(i.created_by_name));
    data.comments.forEach((c) => names.add(c.by));
    data.followups.forEach((f) => names.add(f.owner));
    data.history.forEach((h) => names.add(h.changed_by_name));
    names.delete("");
    const dupes = [...data.meisters.reduce((m, x) => m.set(x.name.toLowerCase(), (m.get(x.name.toLowerCase()) || 0) + 1), new Map())].filter(([, c]) => c > 1).length;

    out.innerHTML = `
      <div class="mini-list" style="margin:12px 0">
        <div class="mini-row"><span>Meisters</span><strong>${data.meisters.length}</strong></div>
        <div class="mini-row"><span>Conversations</span><strong>${data.interactions.length}</strong></div>
        <div class="mini-row"><span>Comments</span><strong>${data.comments.length}</strong></div>
        <div class="mini-row"><span>Follow ups</span><strong>${data.followups.length}</strong></div>
        <div class="mini-row"><span>Status history</span><strong>${data.history.length}</strong></div>
        <div class="mini-row"><span>Question types</span><strong>${data.categories.length}</strong></div>
      </div>
      <p class="muted" style="margin:0 0 6px">People in the file and the login each one becomes:</p>
      <div class="mini-list" style="margin-bottom:12px">${[...names].map((n) => {
        const t = nameMatch(n, team);
        return `<div class="mini-row"><span>${esc(n)}</span><span>${t ? `→ <strong>${esc(t.full_name)}</strong>` : `<span class="muted">no login, kept as name only</span>`}</span></div>`;
      }).join("") || `<div class="muted">None</div>`}</div>
      ${dupes ? `<p class="fu-overdue">${dupes} Meister name${dupes > 1 ? "s appear" : " appears"} more than once; their conversations attach to the first one.</p>` : ""}
      <p class="muted">Follow ups whose owner has no login are assigned to you. Notifications are not created for imported history.</p>
      <button class="btn btn-primary" id="import-go">Import ${data.meisters.length} Meisters</button>`;

    out.querySelector("#import-go").addEventListener("click", async (e) => {
      if (!confirm("Import everything from this file into the CRM now?")) return;
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = "Importing…";
      const run = async (allow) => importCrmExport(data, allow);
      try {
        let res;
        try { res = await run(false); }
        catch (err) {
          if (/already has Meisters/i.test(err.message) && confirm(err.message + "\n\nImport anyway? Meisters already in the CRM will be duplicated.")) res = await run(true);
          else throw err;
        }
        const skipped = (res.skipped || []).length;
        out.innerHTML = `<p style="color:var(--green)"><strong>Done.</strong> ${res.meisters} Meisters, ${res.interactions} conversations, ${res.comments} comments, ${res.followups} follow ups and ${res.history} status changes imported.${skipped ? ` ${skipped} row${skipped > 1 ? "s" : ""} couldn't be matched to a Meister and ${skipped > 1 ? "were" : "was"} skipped.` : ""}</p>`;
        toast && toast("Import complete");
        onDone && setTimeout(onDone, 1500);
      } catch (err) {
        btn.disabled = false; btn.textContent = `Import ${data.meisters.length} Meisters`;
        const hint = /function .*import_crm_export|could not find the function/i.test(err.message) ? " Run sql/crm_import.sql in Supabase first." : "";
        out.insertAdjacentHTML("beforeend", `<p class="fu-overdue">Import failed: ${esc(err.message)}.${hint} Nothing was saved.</p>`);
      }
    });
  });
}
