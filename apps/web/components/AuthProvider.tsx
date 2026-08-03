"use client";

// Google 로그인 컨텍스트 (docs/02 §2 로그인 플로우)

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import { initialUserDoc, type UserDoc } from "@/lib/userDoc";

interface AuthContextValue {
  user: User | null;
  userDoc: UserDoc | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userDoc: null,
  loading: true,
  signIn: async () => {},
  signOutUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      unsubDoc?.();
      unsubDoc = null;
      setUser(u);

      if (!u) {
        setUserDoc(null);
        setLoading(false);
        return;
      }
      try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            ...initialUserDoc(u),
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, { lastLoginAt: serverTimestamp() });
        }
        // 실시간 구독 — 매치 종료 후 exp/points 갱신이 즉시 반영되도록
        unsubDoc = onSnapshot(ref, (s) => {
          if (s.exists()) setUserDoc(s.data() as UserDoc);
        });
      } catch (e) {
        console.error("users/{uid} 문서 처리 실패:", e);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  const signIn = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, userDoc, loading, signIn, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}
