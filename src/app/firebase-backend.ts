import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, serverTimestamp, setDoc, type Firestore, type QuerySnapshot } from 'firebase/firestore';
import { Backend, COLLECTION, FirebaseConfig, SPOTS, SignedIn, StoreError, docId, toEntries } from './backend';
import { Person, osloDate } from './challenge';

/** Så lenge venter vi på at Firestore bekrefter en lagring før vi sier ifra. */
const SAVE_TIMEOUT = 10_000;

/**
 * Google-innlogging og Firestore. Lastes som egen chunk først når config.json har Firebase-oppsett.
 * Innlogging skjer i popup, som virker på GitHub Pages uten at appen ligger på Firebase Hosting.
 */
export class FirebaseBackend implements Backend {
  private readonly auth: Auth;
  private readonly db: Firestore;

  constructor(config: FirebaseConfig) {
    const app = initializeApp(config);
    this.auth = getAuth(app);
    this.db = getFirestore(app);
  }

  async init() {
    await this.auth.authStateReady();
    return signedIn(this.auth.currentUser);
  }

  /** Må kalles rett fra et klikk, ellers blokkerer nettleseren popupen. */
  async login() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { return signedIn((await signInWithPopup(this.auth, provider)).user); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
      throw error;
    }
  }

  logout() { return signOut(this.auth); }

  /** Leser plassen, og oppretter den hvis ingen har den. Reglene avviser alle andre enn eieren. */
  async claimSpot(person: Person) {
    const user = this.auth.currentUser;
    if (!user) throw new StoreError('unauthorized', 'Innloggingen har utløpt.');
    const ref = doc(this.db, SPOTS, docId(person));
    let spot;
    // Nektes vi å lese plassene, er reglene feil publisert – det er ikke det samme som at plassen er tatt.
    try { spot = await getDoc(ref); }
    catch (error) { throw storeError(error); }
    if (spot.exists()) return spot.get('uid') === user.uid;
    try {
      await setDoc(ref, { uid: user.uid, email: user.email });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'permission-denied') return false;
      throw storeError(error);
    }
  }

  async readAll() {
    try { return entries(await getDocs(collection(this.db, COLLECTION))); }
    catch (error) { throw storeError(error); }
  }

  watch(next: (entries: ReturnType<typeof toEntries>) => void, fail: (error: StoreError) => void) {
    const stop = onSnapshot(collection(this.db, COLLECTION), snapshot => next(entries(snapshot)), error => fail(storeError(error)));
    // Logges brukeren ut i en annen fane, stopper vi også her.
    const stopAuth = onAuthStateChanged(this.auth, user => { if (!user) fail(new StoreError('unauthorized', 'Innloggingen har utløpt.')); });
    return () => { stop(); stopAuth(); };
  }

  /** `merge` slår sammen `days`-kartet, så bare denne dagen endres og resten av måneden står urørt. */
  async saveDay(person: Person, day: string, steps: number) {
    if (!this.auth.currentUser) throw new StoreError('unauthorized', 'Innloggingen har utløpt.');
    const write = setDoc(doc(this.db, COLLECTION, docId(person)), { days: { [day]: steps }, updatedAt: serverTimestamp() }, { merge: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StoreError('request', 'Firestore svarte ikke.')), SAVE_TIMEOUT); });
    try { await Promise.race([write, timeout]); }
    catch (error) { throw storeError(error); }
    finally { clearTimeout(timer); }
  }
}

const entries = (snapshot: QuerySnapshot) => toEntries(snapshot.docs.map(d => ({ id: d.id, data: d.data() })), osloDate());

function signedIn(user: User | null): SignedIn | null {
  return user ? { email: user.email ?? '', name: user.displayName ?? user.email ?? '' } : null;
}

function storeError(error: unknown): StoreError {
  if (error instanceof StoreError) return error;
  const code = (error as { code?: string }).code;
  if (code === 'unauthenticated') return new StoreError('unauthorized', 'Innloggingen har utløpt.');
  if (code === 'permission-denied') return new StoreError('denied', 'Firestore nektet tilgang.');
  return new StoreError('request', 'Får ikke kontakt med Firestore.');
}
