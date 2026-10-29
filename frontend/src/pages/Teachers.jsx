import { useState } from "react";
import { api, dmy, fcfa, monthLabel, thisMonth, today } from "../api";
import { useAuth } from "../auth.jsx";
import { Badge, Empty, ErrorBox, ExportMenu, FormModal, Loading, MonthPicker, PageHead, Tabs, useFetch } from "../ui.jsx";

const METHODS = [{ v: "cash", l: "Espèces" }, { v: "wave", l: "Wave" }, { v: "orange", l: "Orange Money" }, { v: "bank", l: "Virement bancaire" }];

export default function Teachers() {
  const { user } = useAuth();
  const dir = user.role === "director", money = dir || user.role === "accountant", edit = dir || user.role === "secretary";
  const [tab, setTab] = useState("list"); const [month, setMonth] = useState(thisMonth()); const [modal, setModal] = useState(null); const [err, setErr] = useState("");
  const t = useFetch("/teachers/"); const rooms = useFetch("/classrooms/").data || [];
  const users = useFetch(dir ? "/users/" : null).data || [];
  const asg = useFetch(tab === "asg" ? "/assignments/" : null); const abs = useFetch(tab === "abs" ? `/teacher-absences/?month=${month}` : null); const h = useFetch(tab === "pay" ? `/hours/?month=${month}` : null);
  const tOpts = (t.data || []).map((x) => ({ v: x.id, l: x.full_name }));
  const act = async (fn) => { setErr(""); try { await fn(); h.reload(); } catch (e) { setErr(e.message); } };
  const tabs = [["list", "Fiches"], ["asg", "Affectations"], ["abs", "Absences et remplacements"], ...(money ? [["pay", "Heures et salaires"]] : [])];
  const fTeacher = [
    { k: "last_name", label: "Nom", required: true }, { k: "first_name", label: "Prénom", required: true },
    { k: "phone", label: "Téléphone", type: "tel" }, { k: "address", label: "Adresse" }, { k: "subjects", label: "Matières enseignées", wide: true },
    { k: "contract", label: "Type de contrat", options: [{ v: "cdi", l: "CDI" }, { v: "cdd", l: "CDD" }, { v: "part", l: "Vacataire" }], required: true, default: "cdi" },
    { k: "hired_on", label: "Date de recrutement", type: "date", required: true, default: today() },
    { k: "weekly_hours", label: "Heures par semaine", type: "number" },
    { k: "hourly_rate", label: "Tarif horaire (FCFA)", type: "number", hint: "0 si salaire fixe" },
    { k: "fixed_salary", label: "Salaire mensuel fixe (FCFA)", type: "number", hint: "0 si payé à l’heure" },
    { k: "user", label: "Compte de connexion (facultatif)", options: users.filter((u) => u.role === "teacher").map((u) => ({ v: u.id, l: u.username })), hint: "Permet à l’enseignant de voir son emploi du temps et ses classes" },
  ];
  const fAsg = [{ k: "teacher", label: "Enseignant", options: tOpts, required: true }, { k: "classroom", label: "Classe", options: rooms.map((r) => ({ v: r.id, l: r.name })), required: true },
    { k: "subject", label: "Matière", required: true }, { k: "weekly_hours", label: "Heures par semaine", type: "number", required: true }];
  const fAbs = [{ k: "teacher", label: "Enseignant absent", options: tOpts, required: true }, { k: "date", label: "Date", type: "date", required: true, default: today() },
    { k: "hours", label: "Heures manquées", type: "number", step: "0.5", required: true, default: 2 }, { k: "replaced_by", label: "Remplaçant (facultatif)", options: tOpts }, { k: "note", label: "Motif", wide: true }];
  const crud = (path, reload) => ({ save: async (id, b) => { await api(id ? `${path}${id}/` : path, { method: id ? "PATCH" : "POST", body: b }); reload(); }, del: async (id) => { await api(`${path}${id}/`, { method: "DELETE" }); reload(); } });
  const T = crud("/teachers/", t.reload), A = crud("/assignments/", asg.reload), B = crud("/teacher-absences/", abs.reload);
  const byTeacher = {}; (asg.data || []).forEach((a) => { (byTeacher[a.teacher_name] ||= []).push(a); });
  return (
    <>
      <PageHead title="Enseignants">
        {tab === "list" && dir && <button className="btn primary" onClick={() => setModal({ k: "t" })}>+ Ajouter</button>}
        {tab === "asg" && edit && <button className="btn primary" onClick={() => setModal({ k: "a" })}>+ Affecter</button>}
        {tab === "abs" && <MonthPicker value={month} onChange={setMonth} />}
        {tab === "abs" && edit && <button className="btn primary" onClick={() => setModal({ k: "b" })}>+ Absence</button>}
        {tab === "pay" && <><MonthPicker value={month} onChange={setMonth} /><ExportMenu kind="hours" params={{ month }} /></>}
      </PageHead>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      <ErrorBox>{err || t.error || asg.error || abs.error || h.error}</ErrorBox>

      {tab === "list" && (t.loading && !t.data ? <Loading /> : !t.data?.length ? <Empty>Aucun enseignant enregistré.</Empty> : (
        <div className="list">{t.data.map((x) => (
          <div className="item" key={x.id}><div className="avatar">{x.first_name[0]}{x.last_name[0]}</div>
            <div className="grow"><b>{x.full_name}</b><small>{x.subjects} · {x.weekly_hours} h/semaine · {x.assigned_hours} h attribuées{money && ` · ${x.fixed_salary > 0 ? fcfa(x.fixed_salary) + " fixe" : fcfa(x.hourly_rate) + "/h"}`}</small>{x.phone && <small><a href={`tel:${x.phone}`}>{x.phone}</a></small>}</div>
            {dir && <button className="btn" onClick={() => setModal({ k: "t", x })}>Modifier</button>}</div>
        ))}</div>
      ))}

      {tab === "asg" && (!asg.data?.length ? <Empty>Aucune affectation.</Empty> : Object.entries(byTeacher).map(([name, rows]) => (
        <section className="card" key={name}><div className="row-between"><b>{name}</b><span className="muted">Total : {rows.reduce((a, r) => a + r.weekly_hours, 0)} h/semaine</span></div>
          <table><tbody>{rows.map((a) => <tr key={a.id}><td>{a.subject}</td><td>{a.classroom_name}</td><td>{a.weekly_hours} h{edit && <> <button className="btn ghost" onClick={() => setModal({ k: "a", x: a })}>Modifier</button></>}</td></tr>)}</tbody></table></section>
      )))}

      {tab === "abs" && (!abs.data?.length ? <Empty>Aucune absence ce mois-ci.</Empty> : <div className="list">{abs.data.map((a) => (
        <div className="item" key={a.id}><div className="grow"><b>{a.teacher_name}</b><small>{dmy(a.date)} · {a.hours} h{a.replaced_by_name && ` · remplacé par ${a.replaced_by_name}`}{a.note && ` · ${a.note}`}</small></div>{edit && <button className="btn" onClick={() => setModal({ k: "b", x: a })}>Modifier</button>}</div>
      ))}</div>)}

      {tab === "pay" && (
        <>
          <div className="toolbar"><button className="btn" onClick={() => act(() => api("/hours/generate/", { method: "POST", body: { month } }))}>Préparer {monthLabel(month)}</button></div>
          {!h.data?.length ? <Empty>Aucune ligne pour ce mois. Utilisez « Préparer » pour la créer.</Empty> : (
            <div className="list">{h.data.map((x) => (
              <div className="item wrap" key={x.id}><div className="grow"><b>{x.teacher_name}</b>
                <small>Prévues {x.planned_hours} h · absences −{x.absent_hours} h · remplacements +{x.replacement_hours} h · {x.mode === "fixe" ? "salaire fixe" : "payé à l’heure"}</small></div>
                {x.mode === "heures" && <label className="mini"><span>Heures réalisées</span><input type="number" min="0" step="0.5" defaultValue={x.done_hours} disabled={x.paid} onBlur={(e) => e.target.value !== String(x.done_hours) && act(() => api(`/hours/${x.id}/`, { method: "PATCH", body: { done_hours: e.target.value } }))} /></label>}
                <b>{fcfa(x.amount)}</b>
                {x.paid ? <Badge kind="ok">Versé</Badge> : <><button className="btn" title="Heures prévues − absences + remplacements" onClick={() => act(() => api(`/hours/${x.id}/recalculate/`, { method: "POST" }))}>Recalculer</button><button className="btn primary" onClick={() => setModal({ k: "p", x })}>Verser</button></>}</div>
            ))}</div>
          )}
          <p className="muted">Heures réalisées = heures prévues − absences + remplacements (modifiable). « Verser » enregistre la dépense de salaire dans les finances.</p>
        </>
      )}

      {modal?.k === "t" && <FormModal title={modal.x ? "Modifier l’enseignant" : "Ajouter un enseignant"} fields={fTeacher} initial={modal.x} onSubmit={(b) => T.save(modal.x?.id, b)} onDelete={modal.x && (() => T.del(modal.x.id))} onClose={() => setModal(null)} />}
      {modal?.k === "a" && <FormModal title={modal.x ? "Modifier l’affectation" : "Affecter un enseignant à une classe"} fields={fAsg} initial={modal.x} onSubmit={(b) => A.save(modal.x?.id, b)} onDelete={modal.x && (() => A.del(modal.x.id))} onClose={() => setModal(null)} />}
      {modal?.k === "b" && <FormModal title={modal.x ? "Modifier l’absence" : "Absence d’un enseignant"} fields={fAbs} initial={modal.x} onSubmit={(b) => B.save(modal.x?.id, b)} onDelete={modal.x && (() => B.del(modal.x.id))} onClose={() => setModal(null)} />}
      {modal?.k === "p" && <FormModal title={`Verser ${fcfa(modal.x.amount)} à ${modal.x.teacher_name}`} fields={[{ k: "method", label: "Mode de paiement", options: METHODS, required: true, default: "cash" }]} submitLabel="Verser"
        onSubmit={async (b) => { await api(`/hours/${modal.x.id}/pay/`, { method: "POST", body: b }); h.reload(); }} onClose={() => setModal(null)} />}
    </>
  );
}
