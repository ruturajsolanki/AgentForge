import { useEffect, useState, useCallback } from "react";
import { getSession, type Session, type UserRole } from "../lib/auth";

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

export function useRole(slug: UserRole): boolean {
  const session = useSession();
  return session?.roles?.includes(slug) ?? false;
}
