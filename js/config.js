// Bump on every change: major for a big change in how the app works, minor for a new feature, patch for fixes.
export const VERSION = "0.30.0";

// Firebase project for the league. Leave null until the project exists; the app then shows setup steps.
// This config is public by design; access is limited by the rules in firestore.rules.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBs-sqZMUAiTdY8hyRVYUOx9FNe9GnGAfc",
  authDomain: "lunkerleague-2c619.firebaseapp.com",
  projectId: "lunkerleague-2c619",
  storageBucket: "lunkerleague-2c619.firebasestorage.app",
  messagingSenderId: "497973733161",
  appId: "1:497973733161:web:000c237b10666b58333938",
};

export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
