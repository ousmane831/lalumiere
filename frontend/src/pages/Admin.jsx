import { useState } from "react";
import { api } from "../api";
import { Badge, Empty, ErrorBox, FormModal, Loading, PageHead, Tabs, useFetch } from "../ui.jsx";

const ROLES = [{ v: "director", l: "Directeur" }, { v: "secretary", l: "Secrétariat" }, { v: "accountant", l: "Comptable / Caissier" }, { v: "teacher", l: "Enseignant" }];
const ACT = { create: ["ok", "Création"], update: ["part", "Modification"], delete: ["bad", "Suppression"], other: ["part", "Action"] };

function Users() {
  const { data, loading, error, reload } = useFetch("/users/"); const [modal, setModal] = useState(null);
  const fields = (isNew) => [{ k: "username", label: "Identifiant", required: true }, { k: "first_name", label: "Prénom" }, { k: "last_name", label: "Nom" },
    { k: "role", label: "Profil", options: ROLES, required: true, default: "secretary" },
    { k: "password", label: isNew ? "Mot de passe" : "Nouveau mot de passe (laisser vide pour ne pas changer)", type: "password", required: isNew, hint: "8 caractères minimum" },
    { k: "is_active", label: "Compte actif", type: "checkbox", default: true }];
  return (
    <>
      <div className="toolbar"><button className="btn primary" onClick={() => setModal({})}>+ Nouvel utilisateur</button></div>
      <p className="muted">Directeur : accès général. Secrétariat : inscriptions, dossiers, classes, emplois du temps, absences. Comptable / caissier : paiements, recettes, dépenses, salaires. Enseignant : son emploi du temps, ses classes, ses notes et absences.</p>
      <ErrorBox>{error}</ErrorBox>
      {loading && !data ? <Loading /> : <div className="list">{data?.map((u) => (
        <div className="item" key={u.id}><div className="grow"><b>{u.first_name} {u.last_name} <small className="inline">@{u.username}</small></b><small>{ROLES.find((r) => r.v === u.role)?.l}</small></div>
          <Badge kind={u.is_active ? "ok" : "bad"}>{u.is_active ? "Actif" : "Désactivé"}</Badge><button className="btn" onClick={() => setModal({ x: u })}>Modifier</button></div>
      ))}</div>}
      {modal && <FormModal title={modal.x ? "Modifier l’utilisateur" : "Nouvel utilisateur"} fields={fields(!modal.x)} initial={modal.x}
        onSubmit={async (b) => { if (modal.x && !b.password) delete b.password; await api(modal.x ? `/users/${modal.x.id}/` : "/users/", { method: modal.x ? "PATCH" : "POST", body: b }); reload(); }} onClose={() => setModal(null)} />}
    </>
  );
}

function School() {
  const { data, error, reload } = useFetch("/settings/"); const [modal, setModal] = useState(false);
  const fields = [{ k: "name", label: "Nom de l’école", required: true, wide: true }, { k: "address", label: "Adresse" }, { k: "phone", label: "Téléphone", type: "tel" },
    { k: "term_system", label: "Découpage de l’année", options: [{ v: "trimester", l: "Trimestres" }, { v: "semester", l: "Semestres" }], required: true },
    { k: "logo", label: "Logo (affiché sur les reçus et bulletins)", type: "file", accept: "image/*", wide: true }];
  return (
    <>
      <ErrorBox>{error}</ErrorBox>
      {data && <section className="card"><div className="item" style={{ border: 0, padding: 0 }}>{data.logo ? <img className="photo-lg" src={data.logo} alt="Logo" /> : <span className="lamp big" aria-hidden="true" />}
        <div className="grow"><b>{data.name}</b><small>{data.address || "Adresse non renseignée"} · {data.phone || "Téléphone non renseigné"}</small><small>{data.term_system === "semester" ? "Semestres" : "Trimestres"}</small></div>
        <button className="btn" onClick={() => setModal(true)}>Modifier</button></div></section>}
      {modal && <FormModal title="Paramètres de l’école" fields={fields} initial={data} onSubmit={async (b) => { await api("/settings/", { method: "PATCH", body: b }); reload(); }} onClose={() => setModal(false)} />}
    </>
  );
}

function History() {
  const [model, setModel] = useState(""); const [q, setQ] = useState("");
  const { data, loading, error } = useFetch(`/audit/?model=${encodeURIComponent(model)}&q=${encodeURIComponent(q)}`);
  return (
    <>
      <div className="toolbar"><input type="search" placeholder="Rechercher dans l’historique" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Type d’opération"><option value="">Tout</option>{data?.models.map((m) => <option key={m}>{m}</option>)}</select></div>
      <ErrorBox>{error}</ErrorBox>
      {loading && !data ? <Loading /> : !data?.results.length ? <Empty>Aucune opération.</Empty> : <div className="list">{data.results.map((a) => (
        <div className="item" key={a.id}><div className="grow"><b>{a.summary || a.model}</b><small>{new Date(a.at).toLocaleString("fr-FR")} · {a.user_name} · {a.model}</small></div><Badge kind={ACT[a.action]?.[0] || "part"}>{ACT[a.action]?.[1] || a.action}</Badge></div>
      ))}</div>}
      <p className="muted">Les 300 dernières opérations importantes : paiements, dépenses, recettes, élèves, enseignants, salaires versés, exports et paramètres.</p>
    </>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("users");
  return (
    <>
      <PageHead title="Administration" />
      <Tabs items={[["users", "Utilisateurs"], ["school", "École"], ["audit", "Historique des opérations"]]} value={tab} onChange={setTab} />
      {tab === "users" ? <Users /> : tab === "school" ? <School /> : <History />}
    </>
  );
}
