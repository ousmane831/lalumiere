import { useEffect, useState } from "react";
import { api, dmy, today } from "../api";
import { Badge, Empty, ErrorBox, PageHead, Tabs, useFetch } from "../ui.jsx";

export default function Absences() {
  const rooms = useFetch("/classrooms/").data || [];
  const [cl, setCl] = useState(""); const [date, setDate] = useState(today()); const [tab, setTab] = useState("call");
  const [marks, setMarks] = useState({}); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { if (!cl && rooms.length) setCl(String(rooms[0].id)); }, [rooms, cl]);
  const studs = useFetch(cl ? `/students/?classroom=${cl}&status=active` : null);
  const existing = useFetch(cl ? `/absences/?classroom=${cl}&date=${date}` : null);
  const hist = useFetch(cl && tab === "hist" ? `/absences/?classroom=${cl}` : null);
  useEffect(() => {
    if (!existing.data) return;
    setMarks(Object.fromEntries(existing.data.map((a) => [a.student, { kind: a.kind, justified: a.justified, reason: a.reason }])));
  }, [existing.data]);
  const set = (id, patch) => { setMsg(""); setMarks((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } })); };
  async function save() {
    setErr(""); setMsg("");
    try {
      const entries = Object.entries(marks).filter(([, v]) => v.kind === "absent" || v.kind === "late").map(([student, v]) => ({ student, ...v }));
      await api("/absences/sheet/", { method: "POST", body: { classroom: +cl, date, entries } });
      setMsg(`Appel enregistré : ${entries.length} absence(s) ou retard(s).`); existing.reload();
    } catch (e) { setErr(e.message); }
  }
  const count = Object.values(marks).filter((v) => v.kind === "absent" || v.kind === "late").length;
  return (
    <>
      <PageHead title="Absences et retards" />
      <div className="toolbar">
        <select value={cl} onChange={(e) => setCl(e.target.value)} aria-label="Classe">{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        {tab === "call" && <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: "auto" }} aria-label="Date" />}
      </div>
      <Tabs items={[["call", "Faire l’appel"], ["hist", "Historique de la classe"]]} value={tab} onChange={setTab} />
      <ErrorBox>{err || studs.error || existing.error || hist.error}</ErrorBox>
      {tab === "call" ? (!studs.data?.length ? <Empty>Aucun élève dans cette classe.</Empty> : (
        <>
          <div className="list">{studs.data.map((s) => {
            const m = marks[s.id] || {}, k = m.kind || "present";
            return (
              <div className="item wrap" key={s.id}>
                <div className="grow"><b>{s.full_name}</b></div>
                <div className="seg" role="group" aria-label={`Présence de ${s.full_name}`}>
                  <button className={k === "present" ? "on" : ""} onClick={() => set(s.id, { kind: "present" })}>Présent</button>
                  <button className={`bad ${k === "absent" ? "on" : ""}`} onClick={() => set(s.id, { kind: "absent" })}>Absent</button>
                  <button className={`part ${k === "late" ? "on" : ""}`} onClick={() => set(s.id, { kind: "late" })}>Retard</button>
                </div>
                {k !== "present" && <><label className="check"><input type="checkbox" checked={!!m.justified} onChange={(e) => set(s.id, { justified: e.target.checked })} /><span>Justifiée</span></label>
                  <input placeholder="Motif" style={{ maxWidth: 200 }} value={m.reason || ""} onChange={(e) => set(s.id, { reason: e.target.value })} aria-label="Motif" /></>}
              </div>
            );
          })}</div>
          <div className="actions"><span className="muted">{count} absence(s) ou retard(s) pour le {dmy(date)}</span><span className="grow" /><button className="btn primary" onClick={save}>Enregistrer l’appel</button></div>
          {msg && <p className="muted" role="status">{msg}</p>}
        </>
      )) : (!hist.data?.length ? <Empty>Aucune absence enregistrée.</Empty> : <div className="list">{hist.data.slice(0, 150).map((a) => (
        <div className="item" key={a.id}><div className="grow"><b>{a.student_name}</b><small>{dmy(a.date)}{a.reason && ` · ${a.reason}`}</small></div>
          <Badge kind={a.kind === "late" ? "part" : "bad"}>{a.kind === "late" ? "Retard" : "Absent"}</Badge>{a.kind === "absent" && <Badge kind={a.justified ? "ok" : "part"}>{a.justified ? "Justifiée" : "Non justifiée"}</Badge>}</div>
      ))}</div>)}
    </>
  );
}
