import { useState } from "react";
import { api, dmy, fcfa, monthLabel, openReceipt, today } from "../api";
import { useAuth } from "../auth.jsx";
import { Badge, Empty, ErrorBox, ExportMenu, FormModal, Loading, PageHead, Sheet, useDebounced, useFetch } from "../ui.jsx";

const METHODS = [{ v: "cash", l: "Espèces" }, { v: "wave", l: "Wave" }, { v: "orange", l: "Orange Money" }, { v: "bank", l: "Virement bancaire" }];
const initials = (s) => (s.first_name[0] || "") + (s.last_name[0] || "");

function Avatar({ s }) {
  return s.photo ? <img className="avatar" src={s.photo} alt="" /> : <div className="avatar">{initials(s)}</div>;
}

function Dossier({ id, onClose }) {
  const { data: d, loading, error } = useFetch(`/students/${id}/dossier/`);
  const st = d?.student;
  return (
    <Sheet title="Dossier de l’élève" onClose={onClose} wide>
      <ErrorBox>{error}</ErrorBox>
      {loading ? <Loading /> : st && (
        <>
          <div className="item" style={{ marginTop: 10 }}>
            {st.photo ? <img className="photo-lg" src={st.photo} alt="" /> : <div className="avatar photo-lg">{initials(st)}</div>}
            <div className="grow"><b>{st.full_name}</b><small>{st.matricule} · {st.classroom_name}</small><small>{st.sex === "F" ? "Fille" : "Garçon"}{st.birth_date && ` · né(e) le ${dmy(st.birth_date)}`}</small></div>
            <Badge kind={st.status === "active" ? "ok" : "bad"}>{st.status === "active" ? "Inscrit" : "Parti"}</Badge>
          </div>
          <div className="kv">
            <div><small>Responsable</small><b>{st.guardian_name || "—"}</b></div>
            <div><small>Téléphone</small><b>{st.guardian_phone ? <a href={`tel:${st.guardian_phone}`}>{st.guardian_phone}</a> : "—"}</b></div>
            <div><small>Adresse</small><b>{st.address || "—"}</b></div>
            <div><small>Scolarité mensuelle</small><b>{fcfa(st.monthly_fee)}</b></div>
          </div>
          <h3>Historique scolaire</h3>
          <div className="tbl"><table><thead><tr><th>Année</th><th>Classe</th><th>Date</th><th className="num">Frais d’inscription</th></tr></thead>
            <tbody>{d.enrollments.map((e) => <tr key={e.id}><td>{e.school_year}</td><td>{e.classroom_name}</td><td>{dmy(e.enrolled_on)}</td><td className="num">{fcfa(e.registration_fee)}</td></tr>)}</tbody></table></div>
          <h3>Assiduité</h3>
          <div className="kv"><div><small>Absences</small><b>{d.absences.absent}</b></div><div><small>dont non justifiées</small><b>{d.absences.unjustified}</b></div><div><small>Retards</small><b>{d.absences.late}</b></div></div>
          {d.months && (
            <>
              <h3>Mensualités</h3>
              <div className="tbl"><table><thead><tr><th>Mois</th><th className="num">Dû</th><th className="num">Payé</th><th className="num">Reste</th><th>Statut</th></tr></thead>
                <tbody>{d.months.map((m) => <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{fcfa(m.due)}</td><td className="num">{fcfa(m.paid)}</td><td className="num">{fcfa(m.remaining)}</td>
                  <td><Badge kind={m.remaining === 0 ? "ok" : m.paid > 0 ? "part" : "bad"}>{m.remaining === 0 ? "Payé" : m.paid > 0 ? "Partiel" : "Impayé"}</Badge></td></tr>)}</tbody></table></div>
              <h3>Paiements enregistrés</h3>
              {!d.payments.length ? <Empty>Aucun paiement.</Empty> : <div className="list">{d.payments.map((p) => (
                <div className="item" key={p.id}><div className="grow"><b>{fcfa(p.amount)} · {monthLabel(p.month.slice(0, 7))}</b><small>{p.receipt_no} · {p.method_label} · {dmy(p.paid_on)}{p.received_by_name && ` · ${p.received_by_name}`}</small></div><button className="btn" onClick={() => openReceipt(p.id)}>Reçu PDF</button></div>
              ))}</div>}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

export default function Students() {
  const { user } = useAuth();
  const canWrite = ["director", "secretary"].includes(user.role);
  const isTeacher = user.role === "teacher";
  const [q, setQ] = useState(""); const [cl, setCl] = useState(""); const [modal, setModal] = useState(null);
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(`/students/?search=${encodeURIComponent(dq)}${cl ? `&classroom=${cl}` : ""}`);
  const rooms = useFetch("/classrooms/").data || [];
  const opts = rooms.map((r) => ({ v: r.id, l: `${r.name} (${r.school_year})` }));
  const fields = (isNew) => [
    { k: "last_name", label: "Nom", required: true }, { k: "first_name", label: "Prénom", required: true },
    { k: "birth_date", label: "Date de naissance", type: "date", nullable: true },
    { k: "sex", label: "Sexe", options: [{ v: "M", l: "Garçon" }, { v: "F", l: "Fille" }], required: true, default: "M" },
    { k: "classroom", label: "Classe", options: opts, required: true },
    { k: "enrolled_on", label: "Date d’inscription", type: "date", default: today(), required: true },
    { k: "monthly_fee", label: "Scolarité mensuelle (FCFA)", type: "number", required: true },
    { k: "registration_fee", label: "Frais d’inscription (FCFA)", type: "number" },
    ...(isNew ? [{ k: "collect_registration", label: "Frais d’inscription encaissés maintenant (enregistrés en recette)", type: "checkbox" }, { k: "registration_method", label: "Mode de paiement des frais", options: METHODS, required: true, default: "cash" }] : [{ k: "status", label: "Situation de l’inscription", options: [{ v: "active", l: "Inscrit" }, { v: "left", l: "Parti" }], required: true }]),
    { k: "guardian_name", label: "Père, mère ou tuteur" }, { k: "guardian_phone", label: "Téléphone du responsable", type: "tel" },
    { k: "address", label: "Adresse", wide: true }, { k: "photo", label: "Photo de l’élève (facultatif)", type: "file", accept: "image/*", wide: true },
  ];
  const re = [{ k: "classroom", label: "Nouvelle classe", options: opts, required: true }, { k: "monthly_fee", label: "Scolarité mensuelle (FCFA)", type: "number", required: true },
    { k: "registration_fee", label: "Frais de réinscription (FCFA)", type: "number" }, { k: "collect_registration", label: "Frais encaissés maintenant", type: "checkbox" }, { k: "registration_method", label: "Mode de paiement", options: METHODS, required: true, default: "cash" }];
  return (
    <>
      <PageHead title={isTeacher ? "Mes classes" : "Élèves"}>
        {!isTeacher && <ExportMenu kind="students" params={cl ? { classroom: cl } : {}} />}
        {canWrite && <button className="btn primary" onClick={() => setModal({ type: "edit" })}>+ Inscrire un élève</button>}
      </PageHead>
      <div className="toolbar">
        <input type="search" placeholder="Nom, matricule ou classe" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cl} onChange={(e) => setCl(e.target.value)} aria-label="Classe"><option value="">Toutes les classes</option>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {loading && !data ? <Loading /> : !data?.length ? <Empty>Aucun élève trouvé.</Empty> : (
        <div className="list">
          {data.map((s) => (
            <div className="item" key={s.id}>
              <Avatar s={s} />
              <div className="grow"><b>{s.full_name} {s.status !== "active" && <Badge kind="bad">Parti</Badge>}</b>
                <small>{s.matricule} · {s.classroom_name}{!isTeacher && ` · ${fcfa(s.monthly_fee)}/mois`}</small>
                {!isTeacher && s.guardian_phone && <small><a href={`tel:${s.guardian_phone}`}>{s.guardian_name || "Responsable"} · {s.guardian_phone}</a></small>}</div>
              {!isTeacher && <div className="item-actions"><button className="btn" onClick={() => setModal({ type: "dossier", s })}>Dossier</button>
                {canWrite && <><button className="btn" onClick={() => setModal({ type: "edit", s })}>Modifier</button><button className="btn" onClick={() => setModal({ type: "re", s })}>Réinscrire</button></>}</div>}
            </div>
          ))}
        </div>
      )}
      {modal?.type === "dossier" && <Dossier id={modal.s.id} onClose={() => setModal(null)} />}
      {modal?.type === "edit" && <FormModal title={modal.s ? "Modifier l’élève" : "Inscrire un élève"} fields={fields(!modal.s)} initial={modal.s}
        onSubmit={async (b) => { await api(modal.s ? `/students/${modal.s.id}/` : "/students/", { method: modal.s ? "PATCH" : "POST", body: b }); reload(); }}
        onDelete={modal.s && (async () => { await api(`/students/${modal.s.id}/`, { method: "DELETE" }); reload(); })} onClose={() => setModal(null)} />}
      {modal?.type === "re" && <FormModal title={`Réinscrire ${modal.s.full_name}`} fields={re} initial={{ monthly_fee: modal.s.monthly_fee }} submitLabel="Réinscrire"
        onSubmit={async (b) => { await api(`/students/${modal.s.id}/reenroll/`, { method: "POST", body: b }); reload(); }} onClose={() => setModal(null)} />}
    </>
  );
}
