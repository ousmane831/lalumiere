import { useState } from "react";
import { fcfa, monthLabel, thisMonth } from "../api";
import { ErrorBox, ExportMenu, Loading, MonthPicker, PageHead, Tabs, useFetch } from "../ui.jsx";

const Simple = ({ title, rows }) => (
  <section className="card"><b>{title}</b>{rows?.length ? <table><tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{fcfa(r.total ?? r.balance)}</td></tr>)}</tbody></table> : <p className="muted">Aucune donnée.</p>}</section>
);

export default function Reports() {
  const now = new Date(); const sy = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const [mode, setMode] = useState("monthly"); const [month, setMonth] = useState(thisMonth()); const [year, setYear] = useState(sy);
  const r = useFetch(mode === "monthly" ? `/reports/monthly/?month=${month}` : `/reports/annual/?year=${year}`);
  // évite d'afficher les données de l'autre onglet pendant le chargement
  const d = r.data && (mode === "monthly" ? r.data.by_class : r.data.months) ? r.data : null;
  return (
    <>
      <PageHead title="Rapports financiers">
        {mode === "monthly" ? <MonthPicker value={month} onChange={setMonth} /> : <select value={year} onChange={(e) => setYear(+e.target.value)} aria-label="Année scolaire" style={{ width: "auto" }}>{[sy - 2, sy - 1, sy, sy + 1].map((y) => <option key={y} value={y}>{y}-{y + 1}</option>)}</select>}
        <ExportMenu kind={mode === "monthly" ? "report-monthly" : "report-annual"} params={mode === "monthly" ? { month } : { year }} />
      </PageHead>
      <Tabs items={[["monthly", "Rapport mensuel"], ["annual", "Rapport annuel"]]} value={mode} onChange={setMode} />
      <ErrorBox>{r.error}</ErrorBox>
      {r.loading && !d ? <Loading /> : d && mode === "monthly" && (
        <>
          <section className="card"><b>Synthèse de {monthLabel(d.month)}</b>
            <table><tbody>
              <tr><td>Scolarité attendue</td><td>{fcfa(d.expected)}</td></tr>
              <tr><td>Scolarité effectivement encaissée (mensualités du mois)</td><td>{fcfa(d.collected)}</td></tr>
              <tr><td>Impayés du mois</td><td className="neg">{fcfa(d.unpaid)}</td></tr>
              <tr><td>Arriérés des mois précédents</td><td className="neg">{fcfa(d.arrears)}</td></tr>
              <tr><td>Recettes du mois (toutes sources)</td><td>{fcfa(d.income)}</td></tr>
              <tr><td>Dépenses payées</td><td>{fcfa(d.expenses)}</td></tr>
              <tr><td>Salaires calculés / versés</td><td>{fcfa(d.salaries_calculated)} / {fcfa(d.salaries_paid)}</td></tr>
              <tr><td><b>Solde de trésorerie</b></td><td><b>{fcfa(d.treasury)}</b></td></tr></tbody></table>
            <p className="muted">Le solde dépend du solde initial et de tous les encaissements et décaissements, pas uniquement de la scolarité. Les recettes encaissées ne sont pas égales aux mensualités attendues.</p></section>
          <section className="card"><b>Impayés par classe</b>
            <div className="tbl" style={{ marginTop: 8 }}><table><thead><tr><th>Classe</th><th className="num">Élèves</th><th className="num">Attendu</th><th className="num">Encaissé</th><th className="num">Impayé</th><th className="num">Arriérés</th></tr></thead>
              <tbody>{d.by_class.map((c) => <tr key={c.classroom}><td>{c.classroom}</td><td className="num">{c.students}</td><td className="num">{fcfa(c.expected)}</td><td className="num">{fcfa(c.collected)}</td><td className="num">{fcfa(c.unpaid)}</td><td className="num">{fcfa(c.arrears)}</td></tr>)}</tbody></table></div></section>
          <div className="two"><Simple title="Recettes par origine" rows={d.by_source} /><Simple title="Paiements par mode de règlement" rows={d.by_method} /><Simple title="Dépenses par catégorie" rows={d.by_category} />
            <section className="card"><b>Salaires du mois</b>{d.salaries.length ? <table><tbody>{d.salaries.map((s) => <tr key={s.teacher}><td>{s.teacher} {s.paid ? "✓ versé" : "(à verser)"}</td><td>{fcfa(s.amount)}</td></tr>)}</tbody></table> : <p className="muted">Aucune ligne de salaire ce mois-ci.</p>}</section></div>
        </>
      )}
      {d && mode === "annual" && (
        <section className="card"><b>Bilan de l’année {d.year}</b>
          <div className="tbl" style={{ marginTop: 8 }}><table><thead><tr><th>Mois</th><th className="num">Attendu</th><th className="num">Encaissé</th><th className="num">Impayés</th><th className="num">Recettes</th><th className="num">Dépenses</th><th className="num">Résultat</th></tr></thead>
            <tbody>{d.months.map((m) => <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{fcfa(m.expected)}</td><td className="num">{fcfa(m.collected)}</td><td className="num">{fcfa(m.unpaid)}</td><td className="num">{fcfa(m.income)}</td><td className="num">{fcfa(m.expenses)}</td><td className="num">{fcfa(m.balance)}</td></tr>)}</tbody>
            <tfoot><tr><td>Total</td><td className="num">{fcfa(d.totals.expected)}</td><td className="num">{fcfa(d.totals.collected)}</td><td className="num">{fcfa(d.totals.unpaid)}</td><td className="num">{fcfa(d.totals.income)}</td><td className="num">{fcfa(d.totals.expenses)}</td><td className="num">{fcfa(d.totals.balance)}</td></tr></tfoot></table></div>
          <p className="muted">Trésorerie en fin d’année scolaire : <b>{fcfa(d.treasury)}</b></p></section>
      )}
    </>
  );
}
