import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2afLmSIPzhinajWe8e-dRZLyO7NpXz7U",
  authDomain: "strawberry-2b2e2.firebaseapp.com",
  projectId: "strawberry-2b2e2",
  storageBucket: "strawberry-2b2e2.firebasestorage.app",
  messagingSenderId: "251158063189",
  appId: "1:251158063189:web:4bae05bc6a2df87dcc4cdc",
  measurementId: "G-BKS3KWPM2V"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);
