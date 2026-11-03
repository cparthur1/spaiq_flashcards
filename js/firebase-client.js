// SPDX-License-Identifier: GPL-2.0-only
/**
 * firebase-client.js
 * Firebase Web SDK integration (Modular ES Modules - Zero Build Step)
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: atob('QUl6YVN5QnFaa1ZoOWpmNDlFZXB3clpwWWNkSFVfX3dGcXphWWFr'),
  authDomain: "flashcards-ead57.firebaseapp.com",
  projectId: "flashcards-ead57",
  storageBucket: "flashcards-ead57.firebasestorage.app",
  messagingSenderId: "771727467889",
  appId: "1:771727467889:web:2bbd7c4f85d794074b82d0",
  measurementId: "G-SPVWZ9SG8P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with ignoreUndefinedProperties to prevent setDoc crashes
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    ignoreUndefinedProperties: true
  });
} catch (e) {
  firestoreDb = getFirestore(app);
}
export const db = firestoreDb;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Perform Google Sign-in with Popup
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    if (error.code === 'auth/popup-closed-by-user') {
      console.log('Login cancelado pelo usuário');
      return null;
    }
    console.error('Erro no login com Google:', error);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Erro ao sair:', error);
    throw error;
  }
}

/**
 * Get current user Firebase ID token for backend authentication
 */
export async function getCurrentUserToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken(forceRefresh);
}

/**
 * Listen to auth state changes
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  serverTimestamp
};
