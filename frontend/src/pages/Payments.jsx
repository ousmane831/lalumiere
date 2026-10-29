import { useState } from "react";
import { api, dmy, fcfa, monthLabel, openReceipt, thisMonth, today } from "../api";
import { useAuth } from "../auth.jsx";
import { Badge, Empty, ErrorBox, ExportMenu, FormModal, Loading, MonthPicker, PageHead, STATUS, Tabs, useDebounced, useFetch } from "../ui.jsx";

const TABS = [["all", "Tous"], ["paid", "Payés"], ["partial", "Partiels"], ["none", "Impayés"], ["arrears", "Arriérés"]];
const METHODS = [{ v: "cash", l: "Espèces" }, { v: "wave", l: "Wave" }, { v: "orange", l: "Orange Money" }, { v: "bank", l: "Virement bancaire" }];

export default function Payments() {
  const { user } = useAuth();
  const canWrite = ["director", "accountant"].includes(user.role);
  const [month, setMonth] = useState(thisMonth()); const [tab, setTab] = useState("all"); const [q, setQ] = useState(""); const [cl, setCl] = useState(""); const [cash, setCash] = useState(null);
  const dq = useDebounced(q).toLowerCase();
  const rooms = useFetch("/classrooms/").data || [];
  const dues = useFetch(`/dues/?month=${month}${cl ? `&classroom=${cl}` : ""}`); const pays = useFetch(`/payments/?month=${month}`);
  const rows = (dues.data || []).filter((r) => (tab === "all" || (tab === "arrears" ? r.arrears > 0 : r.status === tab)) && (r.name + r.classroom).toLowerCase().includes(dq));
  const reload = () => { dues.reload(); pays.reload(); };
  const fields = cash && [
    { k: "month", label: "Mensualité payée", required: true, options: cash.months.map((m) => ({ v: m.month, l: `${monthLabel(m.month)} — reste ${fcfa(m.remaining)}` })) },
    { k: "amount", label: "Montant reçu (FCFA)", type: "number", required: true },
    { k: "paid_on", label: "Date du paiement", type: "date", required: true, default: today() },
    { k: "method", label: "Mode de paiement", options: METHODS, required: true, default: "cash" },
    { k: "reference", label: "Référence de transaction (facultatif)", wide: true },
  ];
  const total = rows.reduce((a, r) => a + r.total_due, 0);
  return (
    <>
      <PageHead title={`Paiements · ${monthLabel(month)}`}><MonthPicker value={month} onChange={setMonth} /><ExportMenu kind="dues" params={{ month, ...(cl ? { classroom: cl } : {}) }} /></PageHead>
      <div className="toolbar">
        <input type="search" placeholder="Rechercher un élève ou une classe" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cl} onChange={(e) => setCl(e.target.value)} aria-label="Classe"><option value="">Toutes les classes</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      </div>
      <Tabs items={TABS} value={tab} onChange={setTab} />
      <ErrorBox>{dues.error}</ErrorBox>
      {dues.loading && !dues.data ? <Loading /> : !rows.length ? <Empty>Aucun élève dans cette liste.</Empty> : (
        <>
          <p className="muted">{rows.length} élève(s) · total restant dû : <b>{fcfa(total)}</b></p>
          <div className="list">
            {rows.map((r) => (
              <div className="item" key={r.student}>
                <div className="grow"><b>{r.name} <small className="inline">{r.classroom}</small></b>
                  <small>{fcfa(r.paid)} payé sur {fcfa(r.monthly_fee)}{r.arrears > 0 && <> · <span className="neg">arriérés {fcfa(r.arrears)}</span></>}</small></div>
                <Badge kind={STATUS[r.status][0]}>{STATUS[r.status][1]}</Badge>
                {canWrite && r.months.length > 0 && <button className="btn primary" onClick={() => setCash(r)}>Encaisser</button>}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="row-between"><h2 className="sub">Paiements reçus pour {monthLabel(month)}</h2><ExportMenu kind="payments" params={{ month }} /></div>
      {!pays.data?.length ? <Empty>Aucun paiement enregistré pour cette mensualité.</Empty> : (
        <div className="list">{pays.data.map((p) => (
          <div className="item" key={p.id}><div className="grow"><b>{p.student_name} <small className="inline">{p.classroom_name}</small></b><small>{p.receipt_no} · {p.method_label} · {dmy(p.paid_on)}{p.received_by_name && ` · ${p.received_by_name}`}</small></div><b>{fcfa(p.amount)}</b><button className="btn" onClick={() => openReceipt(p.id)}>Reçu PDF</button></div>
        ))}</div>
      )}
      {cash && <FormModal title={`Encaisser — ${cash.name}`} fields={fields} initial={{ month: cash.months[0].month, amount: cash.months[0].remaining }} submitLabel="Encaisser"
        onSubmit={async (b) => { const p = await api("/payments/", { method: "POST", body: { ...b, student: cash.student } }); reload(); openReceipt(p.id); }} onClose={() => setCash(null)} />}
    </>
  );
}
