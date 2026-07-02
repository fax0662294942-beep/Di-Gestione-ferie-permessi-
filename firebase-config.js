// Configurazione Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDue3aMzi-8-zflMvlgdGp1TzzId1CZNaI",
    authDomain: "viaggi-camper.firebaseapp.com",
    projectId: "viaggi-camper",
    storageBucket: "viaggi-camper.firebasestorage.app",
    messagingSenderId: "172431561795",
    appId: "1:172431561795:web:ae6ef3e9c2bbdfeb2d70f6"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Configurazione Firestore
db.settings({ merge: true });
