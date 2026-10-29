import { useState } from "react";
import { fcfa, monthLabel, thisMonth } from "../api";
import { ErrorBox, Loading, MonthPicker, PageHead, Stat, useFetch } from "../ui.jsx";

export default function Dashboard() {
  const [month, setMonth] = useState(thisMonth());
  const { data: d, loading, error } = useFetch(`/dashboard/?month=${month}`);
  const pc = d && d.expected ? Math.round((d.collected / d.expected) * 100) : 0;
  const max = d?.series ? Math.max(1, ...d.series.flatMap((s) => [s.income, s.expenses])) : 1;
  return (
    <>
      <PageHead title={`Tableau de bord · ${monthLabel(month)}`}><MonthPicker value={month} onChange={setMonth} /></PageHead>
      <ErrorBox>{error}</ErrorBox>
      {loading && !d ? <Loading /> : d && (
        <>
          <div className="stats">
            <Stat label="Élèves inscrits" value={d.students} />
            <Stat label="Enseignants" value={d.teachers} />
            <Stat label="Ont payé ce mois" value={d.paid} tone="ok" />
            <Stat label="Paiements partiels" value={d.partial} tone="part" />
            <Stat label="N’ont rien payé" value={d.unpaid} tone="bad" />
            <Stat label="Arriérés des mois précédents" value={fcfa(d.arrears)} tone="bad" />
          </div>
          <section className="card">
            <div className="row-between"><b>Scolarité du mois : {pc} % encaissé</b><span className="muted">{fcfa(d.collected)} sur {fcfa(d.expected)}</span></div>
            <div className="meter"><i style={{ width: pc + "%" }} /></div>
          </section>
          {d.finance && (
            <>
              <div className="stats">
                <Stat label="Recettes du mois" value={fcfa(d.finance.income)} />
                <Stat label="Dépenses du mois" value={fcfa(d.finance.expenses)} />
                <Stat label="Solde de trésorerie" value={fcfa(d.finance.treasury)} tone="gold" />
              </div>
              <section className="card">
                <b>Caisse et comptes de paiement</b>
                <div className="stats" style={{ marginTop: 10, marginBottom: 0 }}>{d.finance.accounts.map((a) => <Stat key={a.key} label={a.label} value={fcfa(a.balance)} />)}</div>
              </section>
              <section className="card">
                <b>Année scolaire : recettes et dépenses</b>
                <div className="chart" role="img" aria-label="Recettes et dépenses par mois">
                  {d.series.map((s) => (
                    <div key={s.month} className="col" title={`${monthLabel(s.month)} — recettes ${fcfa(s.income)}, dépenses ${fcfa(s.expenses)}`}>
                      <div className="bars"><i className="in" style={{ height: (s.income / max) * 100 + "%" }} /><i className="out" style={{ height: (s.expenses / max) * 100 + "%" }} /></div>
                      <small>{monthLabel(s.month).slice(0, 3)}</small>
                    </div>
                  ))}
                </div>
                <div className="legend"><span><i className="in" /> Recettes</span><span><i className="out" /> Dépenses</span></div>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
