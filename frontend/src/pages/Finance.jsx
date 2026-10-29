import { useState } from "react";
import { api, dmy, fcfa, monthLabel, thisMonth, today } from "../api";
import { Empty, ErrorBox, ExportMenu, FormModal, MonthPicker, PageHead, Stat, Tabs, useFetch } from "../ui.jsx";

const METHODS = [{ v: "cash", l: "Espèces" }, { v: "wave", l: "Wave" }, { v: "orange", l: "Orange Money" }, { v: "bank", l: "Virement bancaire" }];
const ECATS = [["salaries", "Salaires des enseignants"], ["admin_salaries", "Salaires du personnel administratif"], ["electricity", "Électricité"], ["water", "Eau"], ["supplies", "Fournitures scolaires"], ["maintenance", "Réparations et entretien"], ["transport", "Transport"], ["equipment", "Matériel informatique"], ["other", "Autres dépenses"]];
const ICATS = [["registration", "Frais d’inscription"], ["exam", "Frais d’examen"], ["transport", "Transport scolaire"], ["canteen", "Cantine"], ["other", "Autres recettes"]];
const opt = (a) => a.map(([v, l]) => ({ v, l }));

function Table({ rows, empty = "Aucune donnée ce mois-ci." }) {
  return rows?.length ? <table><tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{fcfa(r.total)}</td></tr>)}</tbody></table> : <p className="muted">{empty}</p>;
}

export default function Finance() {
  const [month, setMonth] = useState(thisMonth()); const [tab, setTab] = useState("exp"); const [modal, setModal] = useState(null);
  const f = useFetch(`/finance/?month=${month}`); const ex = useFetch(`/expenses/?month=${month}`); const inc = useFetch(`/incomes/?month=${month}`);
  const d = f.data;
  const both = () => { f.reload(); ex.reload(); inc.reload(); };
  const fExp = [{ k: "label", label: "Motif", required: true, wide: true }, { k: "category", label: "Catégorie", options: opt(ECATS), required: true, default: "supplies" },
    { k: "amount", label: "Montant (FCFA)", type: "number", required: true }, { k: "date", label: "Date", type: "date", required: true, default: today() },
    { k: "method", label: "Payé par", options: METHODS, required: true, default: "cash" }, { k: "beneficiary", label: "Bénéficiaire" }, { k: "proof", label: "Pièce justificative (facultatif)", type: "file", wide: true }];
  const fInc = [{ k: "label", label: "Motif", required: true, wide: true }, { k: "category", label: "Catégorie", options: opt(ICATS), required: true, default: "exam" },
    { k: "amount", label: "Montant (FCFA)", type: "number", required: true }, { k: "date", label: "Date", type: "date", required: true, default: today() },
    { k: "method", label: "Reçu par", options: METHODS, required: true, default: "cash" }, { k: "reference", label: "Référence" }, { k: "proof", label: "Justificatif (facultatif)", type: "file", wide: true }];
  const totalE = (ex.data || []).reduce((a, e) => a + e.amount, 0), totalI = (inc.data || []).reduce((a, e) => a + e.amount, 0);
  const row = (e, kind) => (
    <div className="item" key={e.id}><div className="grow"><b>{e.label}</b><small>{dmy(e.date)} · {e.category_label} · {e.method_label}{(e.beneficiary || e.reference) && ` · ${e.beneficiary || e.reference}`}{e.proof && <> · <a href={e.proof} target="_blank" rel="noreferrer">justificatif</a></>}</small></div>
      <b>{fcfa(e.amount)}</b><button className="btn" onClick={() => setModal({ kind, x: e })}>Modifier</button></div>
  );
  return (
    <>
      <PageHead title={`Finances · ${monthLabel(month)}`}><MonthPicker value={month} onChange={setMonth} /></PageHead>
      <ErrorBox>{f.error || ex.error || inc.error}</ErrorBox>
      {d && <div className="stats"><Stat label="Recettes du mois" value={fcfa(d.income)} /><Stat label="Dépenses du mois" value={fcfa(d.expenses)} /><Stat label="Solde de trésorerie" value={fcfa(d.treasury)} tone="gold" hint="Solde initial + encaissements − décaissements" /></div>}
      <Tabs items={[["exp", "Dépenses"], ["inc", "Autres recettes"], ["acc", "Caisse et comptes"]]} value={tab} onChange={setTab} />

      {tab === "exp" && <>
        <div className="toolbar"><button className="btn primary" onClick={() => setModal({ kind: "exp" })}>+ Dépense</button><ExportMenu kind="expenses" params={{ month }} /></div>
        {!ex.data?.length ? <Empty>Aucune dépense enregistrée ce mois-ci.</Empty> : <><div className="list">{ex.data.map((e) => row(e, "exp"))}</div><p className="row-between"><b>Total des dépenses</b><b>{fcfa(totalE)}</b></p></>}
      </>}
      {tab === "inc" && <>
        <p className="muted">Les mensualités de scolarité sont enregistrées dans « Paiements ». Ici : inscription, examens, transport, cantine et autres recettes.</p>
        <div className="toolbar"><button className="btn primary" onClick={() => setModal({ kind: "inc" })}>+ Recette</button><ExportMenu kind="incomes" params={{ month }} /></div>
        {!inc.data?.length ? <Empty>Aucune recette de ce type ce mois-ci.</Empty> : <><div className="list">{inc.data.map((e) => row(e, "inc"))}</div><p className="row-between"><b>Total</b><b>{fcfa(totalI)}</b></p></>}
      </>}
      {tab === "acc" && d && <>
        <div className="stats">{d.accounts.map((a) => <Stat key={a.key} label={a.label} value={fcfa(a.balance)} />)}</div>
        <p className="muted">Solde cumulé de chaque compte à la fin du mois. Le solde initial ({fcfa(d.opening_balance)}) est compté dans la caisse en espèces.
          {" "}<button className="btn ghost" onClick={async () => { const v = prompt("Solde initial de la caisse (FCFA)", d.opening_balance); if (v !== null && !isNaN(+v)) { try { await api(`/finance/?month=${month}`, { method: "PATCH", body: { opening_balance: +v } }); both(); } catch (e) { alert(e.message); } } }}>Modifier le solde initial</button></p>
        <div className="two">
          <section className="card"><b>Recettes par origine</b><Table rows={d.by_source} /></section>
          <section className="card"><b>Recettes par mode de règlement</b><Table rows={d.by_method} /></section>
          <section className="card"><b>Dépenses par catégorie</b><Table rows={d.by_category} /></section>
        </div>
      </>}

      {modal?.kind === "exp" && <FormModal title={modal.x ? "Modifier la dépense" : "Nouvelle dépense"} fields={fExp} initial={modal.x}
        onSubmit={async (b) => { await api(modal.x ? `/expenses/${modal.x.id}/` : "/expenses/", { method: modal.x ? "PATCH" : "POST", body: b }); both(); }}
        onDelete={modal.x && (async () => { await api(`/expenses/${modal.x.id}/`, { method: "DELETE" }); both(); })} onClose={() => setModal(null)} />}
      {modal?.kind === "inc" && <FormModal title={modal.x ? "Modifier la recette" : "Nouvelle recette"} fields={fInc} initial={modal.x}
        onSubmit={async (b) => { await api(modal.x ? `/incomes/${modal.x.id}/` : "/incomes/", { method: modal.x ? "PATCH" : "POST", body: b }); both(); }}
        onDelete={modal.x && (async () => { await api(`/incomes/${modal.x.id}/`, { method: "DELETE" }); both(); })} onClose={() => setModal(null)} />}
    </>
  );
}
