// File: firebase-init.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBFNNeJMeDIVRcG2Xj4ZVjr2-0d9RGrURc",
    authDomain: "zitthenkne.firebaseapp.com",
    projectId: "zitthenkne",
    storageBucket: "zitthenkne.appspot.com",
    messagingSenderId: "288090340109",
    appId: "1:288090340109:web:2fdf3e4117e92318ef8e44"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);