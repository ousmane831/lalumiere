import { useEffect, useState } from "react";
import { api, download, thisMonth } from "./api";

export function useFetch(path) {
  const [s, set] = useState({ data: null, loading: !!path, error: "" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) { set({ data: null, loading: false, error: "" }); return; }
    let ok = true;
    set((x) => ({ ...x, loading: true }));
    api(path).then((d) => ok && set({ data: d, loading: false, error: "" })).catch((e) => ok && set({ data: null, loading: false, error: e.message }));
    return () => { ok = false; };
  }, [path, n]);
  return { ...s, reload: () => setN((x) => x + 1) };
}

export function useDebounced(v, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export const Badge = ({ kind, children }) => <span className={`badge ${kind}`}>{children}</span>;
export const STATUS = { paid: ["ok", "Payé"], partial: ["part", "Partiel"], none: ["bad", "Impayé"] };
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty">Chargement…</div>;
export const ErrorBox = ({ children }) => children ? <div className="alert" role="alert">{children}</div> : null;
export const MonthPicker = ({ value, onChange }) => <input className="month" type="month" aria-label="Mois" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />;

export function PageHead({ title, children }) {
  return <div className="head"><h1>{title}</h1><div className="head-actions">{children}</div></div>;
}
export function Tabs({ items, value, onChange }) {
  return <div className="tabs" role="tablist">{items.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Stat({ label, value, hint, tone }) {
  return <div className={`stat ${tone || ""}`}><div className="stat-v">{value}</div><div className="stat-l">{label}</div>{hint && <div className="stat-h">{hint}</div>}</div>;
}

export function ExportMenu({ kind, params = {} }) {
  const [busy, setBusy] = useState(false);
  const go = async (f) => {
    setBusy(true);
    try { await download(`/export/${kind}/?${new URLSearchParams({ ...params, fmt: f })}`, `${kind}.${f}`); } catch (e) { alert(e.message); }
    setBusy(false);
  };
  return <span className="export"><button className="btn" disabled={busy} onClick={() => go("xlsx")}>⬇ Excel</button><button className="btn" disabled={busy} onClick={() => go("pdf")}>⬇ PDF</button></span>;
}

/** Formulaire générique. Champ : {k,label,type(text|number|date|time|tel|password|textarea|file|checkbox),options:[{v,l}],required,hint,default,wide,nullable,step} */
export function FormModal({ title, fields, initial, onSubmit, onClose, onDelete, submitLabel = "Enregistrer" }) {
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.k, f.type === "file" ? null : (initial?.[f.k] ?? f.default ?? (f.type === "checkbox" ? false : ""))])));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      let body = {}, file = false;
      fields.forEach((f) => {
        let x = v[f.k];
        if (f.type === "number") x = Number(x || 0);
        else if (f.type === "checkbox") x = !!x;
        else if (f.type === "file") { if (!(x instanceof File)) return; file = true; }
        else if (x === "" && (f.nullable || (f.options && !f.required))) x = null;
        body[f.k] = x;
      });
      if (file) { const fd = new FormData(); Object.entries(body).forEach(([k, x]) => x != null && fd.append(k, typeof x === "boolean" ? (x ? "true" : "false") : x)); body = fd; }
      await onSubmit(body); onClose();
    } catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <h2>{title}</h2>
        <div className="form-grid">
          {fields.map((f) => f.type === "checkbox" ? (
            <label key={f.k} className="check wide"><input type="checkbox" checked={!!v[f.k]} onChange={(e) => set(f.k, e.target.checked)} /><span>{f.label}</span></label>
          ) : (
            <label key={f.k} className={f.wide ? "wide" : ""}>
              <span>{f.label}</span>
              {f.options ? (
                <select value={v[f.k]} required={f.required} onChange={(e) => set(f.k, e.target.value)}>
                  {!f.required && <option value="">—</option>}
                  {f.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea rows={3} value={v[f.k]} onChange={(e) => set(f.k, e.target.value)} />
              ) : f.type === "file" ? (
                <input type="file" accept={f.accept} onChange={(e) => set(f.k, e.target.files[0] || null)} />
              ) : (
                <input type={f.type || "text"} min={f.type === "number" ? 0 : undefined} step={f.step} required={f.required} value={v[f.k]} onChange={(e) => set(f.k, e.target.value)} />
              )}
              {f.hint && <small>{f.hint}</small>}
            </label>
          ))}
        </div>
        <ErrorBox>{err}</ErrorBox>
        <div className="actions">
          {onDelete && <button type="button" className="btn danger" onClick={async () => { if (confirm("Confirmer la suppression ?")) { try { await onDelete(); onClose(); } catch (x) { setErr(x.message); } } }}>Supprimer</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={busy}>{submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

/** Fenêtre de contenu libre. */
export function Sheet({ title, onClose, children, wide }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide-modal" : ""}`}><div className="row-between"><h2>{title}</h2><button className="btn ghost" onClick={onClose} aria-label="Fermer">✕</button></div>{children}</div>
    </div>
  );
}
export { thisMonth };
