import { createContext, useContext, useState } from "react";
import { api } from "./api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } });
  async function login(username, password) {
    const d = await api("/auth/login/", { method: "POST", body: { username, password }, auth: false });
    localStorage.setItem("access", d.access); localStorage.setItem("refresh", d.refresh);
    localStorage.setItem("user", JSON.stringify(d.user)); setUser(d.user);
  }
  function logout() { localStorage.clear(); setUser(null); }
  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}
