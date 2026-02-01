
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCIlAw1KBrZoARmqKWU_IzsVSS8zJzfNio",
  authDomain: "lastminute-25376.firebaseapp.com",
  projectId: "lastminute-25376",
  storageBucket: "lastminute-25376.firebasestorage.app",
  messagingSenderId: "1079473327517",
  appId: "1:1079473327517:web:58786eb0d56ecb368b7374"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
