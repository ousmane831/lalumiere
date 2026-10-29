import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import { Empty, ErrorBox, FormModal, PageHead, useFetch } from "../ui.jsx";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function Timetable() {
  const { user } = useAuth();
  const canWrite = ["director", "secretary"].includes(user.role);
  const rooms = useFetch("/classrooms/"); const teachers = useFetch("/teachers/");
  const [cl, setCl] = useState(""); const [modal, setModal] = useState(null);
  const slots = useFetch(`/timetable/${cl ? `?classroom=${cl}` : ""}`);
  const fields = [
    { k: "classroom", label: "Classe", required: true, default: cl, options: (rooms.data || []).map((r) => ({ v: r.id, l: r.name })) },
    { k: "teacher", label: "Enseignant", required: true, options: (teachers.data || []).map((t) => ({ v: t.id, l: t.full_name })) },
    { k: "subject", label: "Matière", required: true },
    { k: "weekday", label: "Jour", required: true, default: 1, options: DAYS.map((d, i) => ({ v: i + 1, l: d })) },
    { k: "start", label: "Début", type: "time", required: true, default: "08:00" }, { k: "end", label: "Fin", type: "time", required: true, default: "10:00" },
    { k: "room", label: "Salle" },
  ];
  return (
    <>
      <PageHead title="Emploi du temps">{canWrite && <button className="btn primary" onClick={() => setModal({})}>+ Ajouter un cours</button>}</PageHead>
      {user.role !== "teacher" && <div className="toolbar"><select value={cl} onChange={(e) => setCl(e.target.value)} aria-label="Classe"><option value="">Toutes les classes</option>{(rooms.data || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
      <ErrorBox>{slots.error}</ErrorBox>
      {!slots.data?.length ? <Empty>Aucun cours programmé.</Empty> : (
        <div className="week">{DAYS.map((d, i) => (
          <div className="day" key={d}><h3>{d}</h3>
            {slots.data.filter((s) => s.weekday === i + 1).map((s) => (
              <button key={s.id} className="slot" disabled={!canWrite} onClick={() => setModal({ s })}><b>{s.start.slice(0, 5)}–{s.end.slice(0, 5)}</b><span>{s.subject}</span><small>{s.classroom_name} · {s.teacher_name}{s.room && ` · ${s.room}`}</small></button>
            ))}
          </div>
        ))}</div>
      )}
      {modal && <FormModal title={modal.s ? "Modifier le cours" : "Ajouter un cours"} fields={fields} initial={modal.s}
        onSubmit={async (b) => { await api(modal.s ? `/timetable/${modal.s.id}/` : "/timetable/", { method: modal.s ? "PATCH" : "POST", body: b }); slots.reload(); }}
        onDelete={modal.s && (async () => { await api(`/timetable/${modal.s.id}/`, { method: "DELETE" }); slots.reload(); })} onClose={() => setModal(null)} />}
    </>
  );
}
