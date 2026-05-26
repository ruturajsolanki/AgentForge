import { useEffect, useState } from "react";
import { getSession, type Session } from "../lib/auth";

export function useSession() {
  const [session, setSession] = useState<Session | null>(() => getSession());

  useEffect(() => {
    const sync = () => setSession(getSession());
    window.addEventListener("storage", sync);
    window.addEventListener("forgeos.session", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("forgeos.session", sync);
    };
  }, []);

  return session;
}
