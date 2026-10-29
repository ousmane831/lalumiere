import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import { useFetch } from "./ui.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Students from "./pages/Students.jsx";
import Classes from "./pages/Classes.jsx";
import Payments from "./pages/Payments.jsx";
import Teachers from "./pages/Teachers.jsx";
import Timetable from "./pages/Timetable.jsx";
import Grades from "./pages/Grades.jsx";
import Absences from "./pages/Absences.jsx";
import Finance from "./pages/Finance.jsx";
import Reports from "./pages/Reports.jsx";
import Admin from "./pages/Admin.jsx";

// Le directeur voit tout ; les autres profils ne voient que ce qui est listé dans `roles`.
const NAV = [
  { to: "/", label: "Accueil", icon: "📊", roles: ["accountant"], el: <Dashboard /> },
  { to: "/eleves", label: "Élèves", icon: "🎓", roles: ["secretary", "accountant", "teacher"], el: <Students /> },
  { to: "/classes", label: "Classes", icon: "🏫", roles: ["secretary"], el: <Classes /> },
  { to: "/paiements", label: "Paiements", icon: "💰", roles: ["accountant"], el: <Payments /> },
  { to: "/enseignants", label: "Enseignants", icon: "👩‍🏫", roles: ["secretary", "accountant"], el: <Teachers /> },
  { to: "/emploi-du-temps", label: "Emploi du temps", icon: "🗓️", roles: ["secretary", "teacher", "accountant"], el: <Timetable /> },
  { to: "/notes", label: "Notes", icon: "📝", roles: ["secretary", "teacher"], el: <Grades /> },
  { to: "/absences", label: "Absences", icon: "🙋", roles: ["secretary", "teacher"], el: <Absences /> },
  { to: "/finances", label: "Finances", icon: "📈", roles: ["accountant"], el: <Finance /> },
  { to: "/rapports", label: "Rapports", icon: "📑", roles: ["accountant"], el: <Reports /> },
  { to: "/administration", label: "Admin", icon: "⚙️", roles: [], el: <Admin /> },
];
const ROLES = { director: "Directeur", secretary: "Secrétariat", accountant: "Comptable / Caissier", teacher: "Enseignant" };

export default function App() {
  const { user, logout } = useAuth();
  const cfg = useFetch(user ? "/settings/" : null).data;
  if (!user) return <Login />;
  const items = NAV.filter((n) => user.role === "director" || n.roles.includes(user.role));
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">{cfg?.logo ? <img className="logo" src={cfg.logo} alt="" /> : <span className="lamp" aria-hidden="true" />}<div><b>{cfg?.name || "La Lumière"}</b><small>Gestion scolaire</small></div></div>
        <nav>{items.map((n) => <NavLink key={n.to} to={n.to} end={n.to === "/"}><i>{n.icon}</i><span>{n.label}</span></NavLink>)}</nav>
        <div className="me"><div><b>{user.name}</b><small>{ROLES[user.role]}</small></div><button className="btn ghost" onClick={logout}>Quitter</button></div>
      </aside>
      <main className="main">
        <Routes>
          {items.map((n) => <Route key={n.to} path={n.to} element={n.el} />)}
          <Route path="*" element={<Navigate to={items[0].to} replace />} />
        </Routes>
      </main>
    </div>
  );
}
