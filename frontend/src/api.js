const BASE = import.meta.env.VITE_API_URL || "/api";

async function refresh() {
  const r = localStorage.getItem("refresh");
  if (!r) return false;
  const res = await fetch(`${BASE}/auth/refresh/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: r }) });
  if (!res.ok) return false;
  localStorage.setItem("access", (await res.json()).access);
  return true;
}

function errText(d) {
  if (!d || typeof d !== "object") return "Une erreur est survenue.";
  if (d.detail) return d.detail;
  return Object.entries(d).map(([k, v]) => `${k === "non_field_errors" ? "" : k + " : "}${[].concat(v).join(" ")}`).join(" — ");
}

export async function api(path, { method = "GET", body, blob = false, auth = true } = {}) {
  const form = body instanceof FormData;
  const go = () => fetch(BASE + path, {
    method,
    headers: { ...(body && !form ? { "Content-Type": "application/json" } : {}), ...(auth && localStorage.getItem("access") ? { Authorization: "Bearer " + localStorage.getItem("access") } : {}) },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  let res = await go();
  if (auth && res.status === 401 && (await refresh())) res = await go();
  if (auth && res.status === 401) { localStorage.clear(); window.location.href = "/"; throw new Error("Session expirée"); }
  if (!res.ok) {
    let d = null;
    try { d = await res.json(); } catch { /* corps vide */ }
    throw new Error(res.status === 403 ? "Vous n’avez pas accès à cette action." : errText(d));
  }
  if (res.status === 204) return null;
  return blob ? res.blob() : res.json();
}

export const fcfa = (n) => Math.round(n || 0).toLocaleString("fr-FR") + " FCFA";
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const monthLabel = (m) => { const [y, mo] = m.split("-"); return `${MONTHS[+mo - 1]} ${y}`; };
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const today = () => new Date().toISOString().slice(0, 10);
export async function openBlob(path) {
  const b = await api(path, { blob: true });
  window.open(URL.createObjectURL(b), "_blank");
}
export const openReceipt = (id) => openBlob(`/payments/${id}/receipt/`);
export async function download(path, name) {
  const b = await api(path, { blob: true });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export const dmy = (d) => (d ? d.split("-").reverse().join("/") : "");
