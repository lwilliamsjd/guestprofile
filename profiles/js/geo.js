// ZIP code helpers for Inquiries: city/state from a ZIP and the closest participating dealers.
// The ZIP table (about 1 MB) lives with the CRM and is only loaded when first needed.
let zipsPromise = null;
function zips() {
  if (!zipsPromise) zipsPromise = Promise.all([import("../../crm/js/zip5.js"), import("../../crm/js/zip3.js")]).then(([a, b]) => ({ z5: a.ZIP5, z3: b.ZIP3 }));
  return zipsPromise;
}
const clean = (zip) => String(zip || "").replace(/\D/g, "").slice(0, 5);

// { lat, lng, city, state } or null. Falls back to the 3 digit area when the exact ZIP isn't listed.
export async function lookupZip(zip) {
  const z = clean(zip);
  if (z.length < 3) return null;
  const { z5, z3 } = await zips();
  const hit = (z.length === 5 && z5[z]) || null;
  if (hit) return { lat: hit[0], lng: hit[1], city: hit[2], state: hit[3], exact: true };
  const area = z3[z.slice(0, 3)];
  return area ? { lat: area[0], lng: area[1], city: area[2], state: area[3], exact: false } : null;
}

function miles(a, b) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// dealers: [{ dealership, zip, city, state }] → closest first, with miles (straight line).
export async function closestDealers(zip, dealers, n = 3) {
  const here = await lookupZip(zip);
  if (!here) return [];
  const out = [];
  for (const d of dealers) {
    const loc = await lookupZip(d.zip);
    if (loc) out.push({ ...d, miles: Math.round(miles(here, loc)) });
  }
  return out.sort((a, b) => a.miles - b.miles).slice(0, n);
}
