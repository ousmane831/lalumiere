import { useEffect, useState } from "react";
import { api, dmy, openBlob, today } from "../api";
import { useAuth } from "../auth.jsx";
import { Badge, Empty, ErrorBox, ExportMenu, FormModal, Loading, PageHead, Sheet, Tabs, useFetch } from "../ui.jsx";

function GradeSheet({ ev, onClose, onSaved }) {
  const { data, loading, error } = useFetch(`/evaluations/${ev.id}/grades/`);
  const [sc, setSc] = useState({}); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setSc(Object.fromEntries(data.map((r) => [r.student, r.score ?? ""]))); }, [data]);
  async function save() {
    setBusy(true); setErr("");
    try { await api(`/evaluations/${ev.id}/grades/`, { method: "POST", body: { grades: Object.entries(sc).map(([student, score]) => ({ student, score })) } }); onSaved(); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Sheet title={`${ev.title} — ${ev.subject_name} (/${ev.max_score})`} onClose={onClose}>
      <ErrorBox>{error || err}</ErrorBox>
      {loading ? <Loading /> : (
        <>
          {data?.map((r) => <div className="grade-row" key={r.student}><span className="grow">{r.name}</span>
            <input type="number" inputMode="decimal" min="0" max={ev.max_score} step="0.25" aria-label={`Note de ${r.name}`} value={sc[r.student] ?? ""} onChange={(e) => setSc({ ...sc, [r.student]: e.target.value })} /></div>)}
          <p className="muted">Laissez vide si l’élève était absent à l’évaluation.</p>
          <div className="actions"><span className="grow" /><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>Enregistrer les notes</button></div>
        </>
      )}
    </Sheet>
  );
}

export default function Grades() {
  const { user } = useAuth();
  const canWrite = ["director", "secretary"].includes(user.role);
  const cfg = useFetch("/settings/").data;
  const semester = cfg?.term_system === "semester";
  const rooms = useFetch("/classrooms/").data || [];
  const [cl, setCl] = useState(""); const [term, setTerm] = useState(1); const [tab, setTab] = useState("eval"); const [modal, setModal] = useState(null);
  useEffect(() => { if (!cl && rooms.length) setCl(String(rooms[0].id)); }, [rooms, cl]);
  const subs = useFetch(cl ? `/subjects/?classroom=${cl}` : null);
  const evs = useFetch(cl ? `/evaluations/?classroom=${cl}&term=${term}` : null);
  const res = useFetch(cl && tab === "res" ? `/results/?classroom=${cl}&term=${term}` : null);
  const teachers = useFetch(canWrite ? "/teachers/" : null).data || [];
  const termOpts = Array.from({ length: semester ? 2 : 3 }, (_, i) => i + 1);
  const fSub = [{ k: "name", label: "Matière", required: true }, { k: "coefficient", label: "Coefficient", type: "number", step: "0.5", required: true, default: 1 },
    { k: "teacher", label: "Enseignant", options: teachers.map((t) => ({ v: t.id, l: t.full_name })) }];
  const fEv = [{ k: "class_subject", label: "Matière", required: true, options: (subs.data || []).map((s) => ({ v: s.id, l: s.name })) }, { k: "title", label: "Intitulé", required: true, default: "Devoir 1" },
    { k: "kind", label: "Type", required: true, default: "homework", options: [{ v: "homework", l: "Devoir (poids 1)" }, { v: "exam", l: "Composition (poids 2)" }] },
    { k: "max_score", label: "Note maximale", type: "number", required: true, default: 20 }, { k: "date", label: "Date", type: "date", required: true, default: today() }];
  const rm = [{ k: "comment", label: "Appréciation du directeur", type: "textarea", wide: true }];
  return (
    <>
      <PageHead title="Notes et bulletins">{tab === "res" && canWrite && <ExportMenu kind="results" params={{ classroom: cl, term }} />}</PageHead>
      <div className="toolbar">
        <select value={cl} onChange={(e) => setCl(e.target.value)} aria-label="Classe">{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select value={term} onChange={(e) => setTerm(+e.target.value)} aria-label="Période">{termOpts.map((t) => <option key={t} value={t}>{semester ? "Semestre" : "Trimestre"} {t}</option>)}</select>
      </div>
      <Tabs items={[["eval", "Évaluations et notes"], ["sub", "Matières"], ["res", "Résultats et bulletins"]]} value={tab} onChange={setTab} />
      <ErrorBox>{subs.error || evs.error || res.error}</ErrorBox>

      {tab === "sub" && <>
        {canWrite && <div className="toolbar"><button className="btn primary" onClick={() => setModal({ k: "s" })}>+ Matière</button></div>}
        {!subs.data?.length ? <Empty>Aucune matière pour cette classe.</Empty> : <div className="list">{subs.data.map((s) => (
          <div className="item" key={s.id}><div className="grow"><b>{s.name}</b><small>Coefficient {s.coefficient}{s.teacher_name && ` · ${s.teacher_name}`}</small></div>{canWrite && <button className="btn" onClick={() => setModal({ k: "s", x: s })}>Modifier</button>}</div>
        ))}</div>}
      </>}

      {tab === "eval" && <>
        <div className="toolbar"><button className="btn primary" disabled={!subs.data?.length} onClick={() => setModal({ k: "e" })}>+ Évaluation</button>{!subs.data?.length && <span className="muted">Ajoutez d’abord les matières de la classe.</span>}</div>
        {!evs.data?.length ? <Empty>Aucune évaluation pour cette période.</Empty> : <div className="list">{evs.data.map((e) => (
          <div className="item" key={e.id}><div className="grow"><b>{e.title} · {e.subject_name}</b><small>{e.kind_label} sur {e.max_score} · {dmy(e.date)} · {e.graded} note(s) saisie(s)</small></div>
            <button className="btn primary" onClick={() => setModal({ k: "g", x: e })}>Saisir les notes</button><button className="btn" onClick={() => setModal({ k: "e", x: e })}>Modifier</button></div>
        ))}</div>}
      </>}

      {tab === "res" && (res.loading && !res.data ? <Loading /> : !res.data?.rows.length ? <Empty>Aucun élève dans cette classe.</Empty> : <>
        <div className="tbl"><table><thead><tr><th>Élève</th>{res.data.subjects.map((s) => <th key={s.id} className="num">{s.name} <small>coef {s.coefficient}</small></th>)}<th className="num">Moyenne</th><th className="num">Rang</th><th></th></tr></thead>
          <tbody>{res.data.rows.map((r) => <tr key={r.student}><td>{r.name}</td>{res.data.subjects.map((s) => <td key={s.id} className="num">{r.averages[s.id] ?? "—"}</td>)}
            <td className="num"><b>{r.general ?? "—"}</b></td><td className="num">{r.rank ? `${r.rank}/${res.data.class_size}` : "—"}</td>
            <td style={{ whiteSpace: "nowrap" }}><button className="btn" onClick={() => openBlob(`/bulletin/?student=${r.student}&term=${term}`).catch((e) => alert(e.message))}>Bulletin</button>{canWrite && <> <button className="btn ghost" onClick={() => setModal({ k: "r", x: r })}>{r.remark ? "Appréciation ✓" : "Appréciation"}</button></>}</td></tr>)}</tbody>
          <tfoot><tr><td>Moyenne de la classe</td>{res.data.subjects.map((s) => <td key={s.id} className="num">{res.data.class_averages[s.id] ?? "—"}</td>)}<td className="num">{res.data.class_general ?? "—"}</td><td colSpan={2}></td></tr></tfoot></table></div>
        <p className="muted">Moyenne d’une matière : devoirs (poids 1) et composition (poids 2) ramenés sur 20. Moyenne générale : moyennes des matières pondérées par les coefficients.</p></>)}

      {modal?.k === "s" && <FormModal title={modal.x ? "Modifier la matière" : "Nouvelle matière"} fields={fSub} initial={modal.x}
        onSubmit={async (b) => { await api(modal.x ? `/subjects/${modal.x.id}/` : "/subjects/", { method: modal.x ? "PATCH" : "POST", body: { ...b, classroom: +cl } }); subs.reload(); }}
        onDelete={modal.x && (async () => { await api(`/subjects/${modal.x.id}/`, { method: "DELETE" }); subs.reload(); })} onClose={() => setModal(null)} />}
      {modal?.k === "e" && <FormModal title={modal.x ? "Modifier l’évaluation" : "Nouvelle évaluation"} fields={fEv} initial={modal.x}
        onSubmit={async (b) => { await api(modal.x ? `/evaluations/${modal.x.id}/` : "/evaluations/", { method: modal.x ? "PATCH" : "POST", body: { ...b, term } }); evs.reload(); }}
        onDelete={modal.x && (async () => { await api(`/evaluations/${modal.x.id}/`, { method: "DELETE" }); evs.reload(); })} onClose={() => setModal(null)} />}
      {modal?.k === "g" && <GradeSheet ev={modal.x} onClose={() => setModal(null)} onSaved={evs.reload} />}
      {modal?.k === "r" && <FormModal title={`Appréciation — ${modal.x.name}`} fields={rm} initial={{ comment: modal.x.remark }}
        onSubmit={async (b) => { await api("/results/", { method: "POST", body: { student: modal.x.student, term, comment: b.comment } }); res.reload(); }} onClose={() => setModal(null)} />}
    </>
  );
}
