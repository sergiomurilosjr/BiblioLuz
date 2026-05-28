import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
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
  responsible?: string;
  notes?: string;
  loanDate: any;
  dueDate?: any;
  returnDate?: any;
  status: 'active' | 'returned' | 'overdue' | 'lost';
  ownerId: string;
  updatedAt?: any;
}

export interface Borrower {
  id?: string;
  name: string;
  email?: string;
  phone: string;
  lastBorrowed?: any;
  ownerId: string;
}

const BOOKS_COL = 'books';
const LOANS_COL = 'loans';
const BORROWERS_COL = 'borrowers';

export const libraryService = {
  // Borrowers
  async getBorrowers() {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    
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
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      // Check if borrower already exists by phone (unique enough for this app)
      const q = query(
        collection(db, BORROWERS_COL),
        where('phone', '==', borrowerData.phone)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        // Update existing
        const borrowerDoc = snapshot.docs[0];
        await updateDoc(doc(db, BORROWERS_COL, borrowerDoc.id), {
          ...borrowerData,
          lastBorrowed: serverTimestamp(),
        });
        return borrowerDoc.id;
      } else {
        // Create new
        const docRef = await addDoc(collection(db, BORROWERS_COL), {
          ...borrowerData,
          ownerId: userId,
          lastBorrowed: serverTimestamp(),
        });
        return docRef.id;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, BORROWERS_COL);
    }
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
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    
    try {
      const q = query(
        collection(db, BOOKS_COL), 
        orderBy('createdAt', 'desc')
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
      const docRef = await addDoc(collection(db, BOOKS_COL), {
        ...bookData,
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
      const bookRef = doc(db, BOOKS_COL, bookId);
      await updateDoc(bookRef, {
        ...bookData,
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
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      const q = query(
        collection(db, LOANS_COL),
        orderBy('loanDate', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, LOANS_COL);
      return [];
    }
  },

  async createLoan(loanData: Omit<Loan, 'id' | 'ownerId' | 'status'>) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    try {
      // 1. Save/Update borrower info
      await this.saveBorrower({
        name: loanData.borrowerName,
        email: loanData.borrowerEmail,
        phone: loanData.borrowerPhone
      });

      // 2. Create the loan
      const loanRef = await addDoc(collection(db, LOANS_COL), {
        ...loanData,
        ownerId: userId,
        status: 'active',
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
      // 1. Update loan status
      const loanRef = doc(db, LOANS_COL, loanId);
      await updateDoc(loanRef, {
        status: 'returned',
        returnDate: serverTimestamp(),
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

  async updateLoan(loanId: string, loanData: Partial<Loan>) {
    try {
      const loanRef = doc(db, LOANS_COL, loanId);
      await updateDoc(loanRef, {
        ...loanData,
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
  }
};
