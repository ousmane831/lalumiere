import { useState } from "react";
import { api } from "../api";
import { Empty, ErrorBox, FormModal, Loading, PageHead, useFetch } from "../ui.jsx";

const LEVELS = [{ v: "preschool", l: "Préscolaire" }, { v: "primary", l: "Élémentaire" }, { v: "middle", l: "Collège" }, { v: "high", l: "Lycée" }];

export default function Classes() {
  const { data, loading, error, reload } = useFetch("/classrooms/");
  const [modal, setModal] = useState(null);
  const fields = [
    { k: "name", label: "Nom de la classe", required: true, hint: "Ex. CI A, CI B, Terminale L1, Terminale S2" },
    { k: "level", label: "Niveau", options: LEVELS, required: true, default: "primary" },
    { k: "school_year", label: "Année scolaire", required: true, default: "2026-2027", hint: "Format 2026-2027" },
    { k: "position", label: "Ordre d’affichage", type: "number" },
  ];
  return (
    <>
      <PageHead title="Classes"><button className="btn primary" onClick={() => setModal({})}>+ Nouvelle classe</button></PageHead>
      <p className="muted">Créez autant de classes que nécessaire pour un même niveau (CI A, CI B…). Les mensualités sont calculées de septembre à juin pour l’année scolaire de la classe.</p>
      <ErrorBox>{error}</ErrorBox>
      {loading && !data ? <Loading /> : !data?.length ? <Empty>Aucune classe.</Empty> : LEVELS.map((lv) => {
        const rows = data.filter((c) => c.level === lv.v);
        return rows.length > 0 && (
          <section key={lv.v}><h2 className="sub">{lv.l}</h2>
            <div className="list">{rows.map((c) => (
              <div className="item" key={c.id}><div className="grow"><b>{c.name}</b><small>{c.school_year} · {c.students_count} élève(s)</small></div><button className="btn" onClick={() => setModal({ c })}>Modifier</button></div>
            ))}</div></section>
        );
      })}
      {modal && <FormModal title={modal.c ? "Modifier la classe" : "Nouvelle classe"} fields={fields} initial={modal.c}
        onSubmit={async (b) => { await api(modal.c ? `/classrooms/${modal.c.id}/` : "/classrooms/", { method: modal.c ? "PATCH" : "POST", body: b }); reload(); }}
        onDelete={modal.c && (async () => { await api(`/classrooms/${modal.c.id}/`, { method: "DELETE" }); reload(); })} onClose={() => setModal(null)} />}
    </>
  );
}
