import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { ErrorBox } from "../ui.jsx";

export default function Login() {
  const { login } = useAuth();
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await login(u, p); } catch (x) { setErr(x.message.includes("No active") ? "Identifiant ou mot de passe incorrect." : x.message); setBusy(false); }
  }
  return (
    <div className="login">
      <div className="login-art"><span className="lamp big" aria-hidden="true" /><h1>La Lumière</h1><p>Élèves, paiements, enseignants et comptabilité de l’école, au même endroit.</p></div>
      <form className="login-card" onSubmit={submit}>
        <h2>Connexion</h2>
        <label><span>Identifiant</span><input autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required /></label>
        <label><span>Mot de passe</span><input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></label>
        <ErrorBox>{err}</ErrorBox>
        <button className="btn primary block" disabled={busy}>Se connecter</button>
      </form>
    </div>
  );
}
