import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  query, 
  where, 
  getDocs, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { addDays } from 'date-fns';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { normalizeWhatsAppPhone, parseLoanDate } from '../lib/whatsappReminder';
import axios from 'axios';

export interface Book {
  id?: string;
  title: string;
  author: string;
  isbn?: string;
  category?: string;
  cdeIndex?: string;
  edition?: string;
  year?: string;
  acquisitionType?: string;
  supplier?: string;
  status: 'available' | 'loaned';
  description?: string;
  coverUrl?: string;
  ownerId: string;
  createdAt: any;
  updatedAt: any;
}

export interface Loan {
  id?: string;
  bookId: string;
  bookTitle: string;
  cdeIndex?: string;
  borrowerName: string;
  borrowerEmail?: string;
  borrowerPhone: string;
  borrowerPhoneNormalized?: string;
  responsible?: string;
  notes?: string;
  loanDate: any;
  dueDate?: any;
  returnDate?: any;
  status: 'active' | 'returned' | 'overdue' | 'lost';
  lastReminderAt?: any;
  reminderCount?: number;
  agreedToTerms?: boolean;
  agreedAt?: any;
  reminderScheduledFor?: any;
  reminderStatus?: 'scheduled' | 'sent' | 'cancelled' | 'none';
  extensionCount?: number;
  lastExtensionAt?: any;
  returnClaimedAt?: any;
  returnClaimStatus?: 'none' | 'pending_verification' | 'resolved';
  ownerId: string;
  updatedAt?: any;
}

export interface Borrower {
  id?: string;
  name: string;
  email?: string;
  phone: string;
  phoneNormalized?: string;
  verified?: boolean;
  verifiedAt?: any;
  lastBorrowed?: any;
  ownerId: string;
  updatedAt?: any;
}

const BOOKS_COL = 'books';
const LOANS_COL = 'loans';
const BORROWERS_COL = 'borrowers';

function stripUndefined<T extends Record<string, any>>(data: T): Partial<T> {
  const clean: Record<string, any> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      clean[key] = value;
    }
  });
  return clean as Partial<T>;
}

export function normalizePhoneKey(phone?: string): string {
  if (!phone) return '';
  const wa = normalizeWhatsAppPhone(phone);
  if (wa) return wa;
  return phone.replace(/\D/g, '').replace(/^0+/, '');
}

export const libraryService = {
  // Borrowers
  async getBorrowers() {
    try {
      const q = query(
        collection(db, BORROWERS_COL),
        orderBy('name', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Borrower));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, BORROWERS_COL);
      return [];
    }
  },

  async saveBorrower(borrowerData: Omit<Borrower, 'id' | 'ownerId'>) {
    const userId = auth.currentUser?.uid || 'self-service';

    try {
      const phoneNormalized = normalizePhoneKey(borrowerData.phone);
      const cleanBorrower = stripUndefined({
        ...borrowerData,
        phoneNormalized: phoneNormalized || undefined,
      });

      // Match existing borrower by normalized phone or raw phone
      let existingDocId: string | null = null;
      if (phoneNormalized) {
        const allSnapshot = await getDocs(collection(db, BORROWERS_COL));
        const match = allSnapshot.docs.find((d) => {
          const data = d.data() as Borrower;
          const existingKey = data.phoneNormalized || normalizePhoneKey(data.phone);
          return existingKey === phoneNormalized;
        });
        if (match) existingDocId = match.id;
      } else {
        const q = query(
          collection(db, BORROWERS_COL),
          where('phone', '==', borrowerData.phone)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) existingDocId = snapshot.docs[0].id;
      }

      if (existingDocId) {
        await updateDoc(doc(db, BORROWERS_COL, existingDocId), {
          ...cleanBorrower,
          lastBorrowed: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return existingDocId;
      } else {
        const docRef = await addDoc(collection(db, BORROWERS_COL), {
          ...cleanBorrower,
          ownerId: userId,
          lastBorrowed: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return docRef.id;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, BORROWERS_COL);
    }
  },

  async registerVerifiedBorrower(name: string, phone: string) {
    const phoneNormalized = normalizePhoneKey(phone);
    return this.saveBorrower({
      name: name.trim(),
      phone: phone.trim(),
      phoneNormalized: phoneNormalized || undefined,
      verified: true,
      verifiedAt: serverTimestamp(),
    });
  },

  async bulkAddLoans(loansData: Omit<Loan, 'id' | 'ownerId' | 'updatedAt'>[]) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      const chunkSize = 100;
      for (let i = 0; i < loansData.length; i += chunkSize) {
        const chunk = loansData.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        
        chunk.forEach(loanData => {
          const docRef = doc(collection(db, LOANS_COL));
          const cleanData: any = {};
          Object.entries(loanData).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              cleanData[key] = value;
            }
          });

          batch.set(docRef, {
            ...cleanData,
            ownerId: userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, LOANS_COL);
    }
  },
  // Books
  async getBooks() {
    try {
      const q = query(
        collection(db, BOOKS_COL)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Book));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, BOOKS_COL);
      return [];
    }
  },

  async addBook(bookData: Omit<Book, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      const cleanBook = stripUndefined(bookData);
      const docRef = await addDoc(collection(db, BOOKS_COL), {
        ...cleanBook,
        ownerId: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, BOOKS_COL);
    }
  },

  async updateBook(bookId: string, bookData: Partial<Book>) {
    try {
      const cleanBook = stripUndefined(bookData);
      const bookRef = doc(db, BOOKS_COL, bookId);
      await updateDoc(bookRef, {
        ...cleanBook,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${BOOKS_COL}/${bookId}`);
    }
  },

  async bulkAddBooks(booksData: Omit<Book, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[]) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      const chunkSize = 100;
      for (let i = 0; i < booksData.length; i += chunkSize) {
        const chunk = booksData.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        
        chunk.forEach(bookData => {
          const docRef = doc(collection(db, BOOKS_COL));
          const cleanData: any = {};
          Object.entries(bookData).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              cleanData[key] = value;
            }
          });

          batch.set(docRef, {
            ...cleanData,
            ownerId: userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, BOOKS_COL);
    }
  },

  async deleteBook(bookId: string) {
    try {
      await deleteDoc(doc(db, BOOKS_COL, bookId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${BOOKS_COL}/${bookId}`);
    }
  },

  async fetchBookInfo(isbn: string) {
    try {
      const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      if (response.data.totalItems > 0) {
        const item = response.data.items[0].volumeInfo;
        return {
          title: item.title || '',
          author: item.authors ? item.authors.join(', ') : '',
          description: item.description || '',
          coverUrl: item.imageLinks ? (item.imageLinks.thumbnail || item.imageLinks.smallThumbnail) : '',
          year: item.publishedDate ? item.publishedDate.split('-')[0] : '',
          category: item.categories ? item.categories[0] : '',
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching book info:', error);
      return null;
    }
  },

  // Loans
  async getLoans() {
    try {
      const q = query(
        collection(db, LOANS_COL)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, LOANS_COL);
      return [];
    }
  },

  async getLoanById(loanId: string): Promise<Loan | null> {
    try {
      const snap = await getDoc(doc(db, LOANS_COL, loanId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Loan;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${LOANS_COL}/${loanId}`);
      return null;
    }
  },

  async createLoan(loanData: Omit<Loan, 'id' | 'ownerId' | 'status'>) {
    const userId = auth.currentUser?.uid || 'self-service';

    try {
      const phoneNormalized = normalizePhoneKey(loanData.borrowerPhone);

      // 1. Save/Update borrower info
      await this.saveBorrower({
        name: loanData.borrowerName,
        email: loanData.borrowerEmail,
        phone: loanData.borrowerPhone,
        phoneNormalized: phoneNormalized || undefined,
      });

      // Compute scheduled reminder 3 days before due date
      let reminderScheduledFor = loanData.reminderScheduledFor;
      if (!reminderScheduledFor && loanData.dueDate instanceof Date && !isNaN(loanData.dueDate.getTime())) {
        reminderScheduledFor = Timestamp.fromDate(addDays(loanData.dueDate, -3));
      }

      // 2. Create the loan
      const cleanLoan = stripUndefined({
        ...loanData,
        borrowerPhoneNormalized: phoneNormalized || undefined,
        reminderScheduledFor,
        reminderStatus: loanData.reminderStatus || (reminderScheduledFor ? 'scheduled' : 'none'),
        agreedAt: loanData.agreedToTerms ? serverTimestamp() : undefined,
      });
      const loanRef = await addDoc(collection(db, LOANS_COL), {
        ...cleanLoan,
        ownerId: userId,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Update book status
      await this.updateBook(loanData.bookId, { status: 'loaned' });

      return loanRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, LOANS_COL);
    }
  },

  async returnBook(loanId: string, bookId: string) {
    try {
      // 1. Update loan status and cancel any pending scheduled reminder
      const loanRef = doc(db, LOANS_COL, loanId);
      await updateDoc(loanRef, {
        status: 'returned',
        returnDate: serverTimestamp(),
        reminderStatus: 'cancelled',
        returnClaimStatus: 'resolved',
        updatedAt: serverTimestamp(),
      });

      // 2. Update book status (only if it's a real book reference)
      if (bookId && bookId !== 'manual-import') {
        try {
          await this.updateBook(bookId, { status: 'available' });
        } catch (bookError) {
          console.warn('Could not update book status, it might have been deleted:', bookId);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${LOANS_COL}/${loanId}`);
    }
  },

  async extendLoanBy15Days(loan: Loan): Promise<Date> {
    if (!loan.id) throw new Error('Empréstimo inválido.');
    try {
      const now = new Date();
      const currentDue = parseLoanDate(loan.dueDate);
      const extendedFromDue = currentDue ? addDays(currentDue, 15) : addDays(now, 15);
      const minNewDue = addDays(now, 15);
      const newDueDate = extendedFromDue.getTime() < minNewDue.getTime() ? minNewDue : extendedFromDue;
      const newReminderDate = addDays(newDueDate, -3);

      const loanRef = doc(db, LOANS_COL, loan.id);
      await updateDoc(loanRef, {
        dueDate: Timestamp.fromDate(newDueDate),
        status: 'active',
        reminderScheduledFor: Timestamp.fromDate(newReminderDate),
        reminderStatus: 'scheduled',
        extensionCount: (loan.extensionCount || 0) + 1,
        lastExtensionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return newDueDate;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${LOANS_COL}/${loan.id}`);
      throw error;
    }
  },

  async reportLoanAlreadyReturned(loanId: string) {
    try {
      const loanRef = doc(db, LOANS_COL, loanId);
      await updateDoc(loanRef, {
        returnClaimedAt: serverTimestamp(),
        returnClaimStatus: 'pending_verification',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${LOANS_COL}/${loanId}`);
    }
  },

  async updateLoan(loanId: string, loanData: Partial<Loan>) {
    try {
      const cleanLoan = stripUndefined(loanData);
      const loanRef = doc(db, LOANS_COL, loanId);
      await updateDoc(loanRef, {
        ...cleanLoan,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${LOANS_COL}/${loanId}`);
    }
  },

  async markLoanReminderSent(loanId: string, currentCount = 0) {
    try {
      const loanRef = doc(db, LOANS_COL, loanId);
      await updateDoc(loanRef, {
        lastReminderAt: serverTimestamp(),
        reminderCount: (currentCount || 0) + 1,
        reminderStatus: 'sent',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${LOANS_COL}/${loanId}`);
    }
  },

  async updateLoanWithSync(loanId: string, bookId: string, loanData: Partial<Loan>) {
    try {
      // 1. Update/Save borrower info if present
      if (loanData.borrowerName && loanData.borrowerPhone) {
        await this.saveBorrower({
          name: loanData.borrowerName,
          email: loanData.borrowerEmail,
          phone: loanData.borrowerPhone
        });
      }

      // 2. Update the loan
      await this.updateLoan(loanId, loanData);

      // 2. If status is being updated, sync with the book
      if (loanData.status && bookId && bookId !== 'manual-import') {
        const bookStatus = loanData.status === 'returned' ? 'available' : 'loaned';
        try {
          await this.updateBook(bookId, { status: bookStatus });
        } catch (e) {
          console.warn('Could not sync book status:', e);
        }
      }
    } catch (error) {
       // already handled in updateLoan
    }
  },

  subscribeBooks(onData: (books: Book[]) => void, onError?: (error: unknown) => void) {
    const q = query(collection(db, BOOKS_COL));
    return onSnapshot(
      q,
      (snapshot) => {
        onData(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Book)));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, BOOKS_COL);
        } catch (wrappedError) {
          onError?.(wrappedError);
        }
      }
    );
  },

  subscribeLoans(onData: (loans: Loan[]) => void, onError?: (error: unknown) => void) {
    const q = query(collection(db, LOANS_COL));
    return onSnapshot(
      q,
      (snapshot) => {
        onData(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Loan)));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, LOANS_COL);
        } catch (wrappedError) {
          onError?.(wrappedError);
        }
      }
    );
  },

  subscribeBorrowers(onData: (borrowers: Borrower[]) => void, onError?: (error: unknown) => void) {
    const q = query(collection(db, BORROWERS_COL), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        onData(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Borrower)));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, BORROWERS_COL);
        } catch (wrappedError) {
          onError?.(wrappedError);
        }
      }
    );
  }
};
