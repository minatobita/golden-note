import { auth } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { useState, useEffect } from 'react';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return () => unsubscribe();
  }, []);
  return { user, loading };
}

export async function signUp(email: string, password: string) {
  return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

export async function signIn(email: string, password: string) {
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}

export async function signOut() { await firebaseSignOut(auth); }

export function onAuthChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export type { User };
