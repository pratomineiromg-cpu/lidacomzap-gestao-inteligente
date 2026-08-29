import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCzmLDq40GGCjRvQrSMqA2SdP9Hy93f3n0",
  authDomain: "lidacomzap-gestao-inteligente.firebaseapp.com",
  projectId: "lidacomzap-gestao-inteligente",
  storageBucket: "lidacomzap-gestao-inteligente.firebasestorage.app",
  messagingSenderId: "446483877373",
  appId: "1:446483877373:web:578e5efaa8a44643c89d94"
};

// Initialize Firebase securely preventing duplicate initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use the default database
const db = getFirestore(app, "(default)");

export { app, db };
