import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyBwDNOkT77WkIorQaN5w4zYaBhXzFaQvpQ",
  authDomain: "cdir-basket-analytics.firebaseapp.com",
  projectId: "cdir-basket-analytics",
  storageBucket: "cdir-basket-analytics.firebasestorage.app",
  messagingSenderId: "491978418614",
  appId: "1:491978418614:web:1a683f0713b96ddddfb917",
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
