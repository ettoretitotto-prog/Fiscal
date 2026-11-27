import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { UserProfile } from "./types";

interface Session {
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
}

const Ctx = createContext<Session>({ loading: true, user: null, profile: null });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Session>({ loading: true, user: null, profile: null });
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user || user.isAnonymous) {
          setState({ loading: false, user: null, profile: null });
          return;
        }
        setState((s) => ({ ...s, loading: true }));
        let profile: UserProfile | null = null;
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          profile = snap.exists() ? (snap.data() as UserProfile) : null;
        } catch {
          profile = null;
        }
        setState({ loading: false, user, profile });
      }),
    [],
  );
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
