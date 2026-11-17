import React, { useState, useEffect, useMemo } from 'react';
import {
  Book as BookIcon,
  Search,
  ArrowLeft,
  CheckCircle2,
  HandHeart,
  RotateCcw,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
  Clock,
  Calendar,
  User as UserIcon,
  Phone,
  RefreshCw,
  MoreVertical,
  Sun,
  Moon,
  MessageCircle,
  ShieldCheck,
  AlertTriangle,
  Check,
  BellRing,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import {
  libraryService,
  Book,
  Loan,
  Borrower,
  normalizePhoneKey,
} from '../services/libraryService';
import {
  normalizeWhatsAppPhone,
  buildWhatsAppUrl,
  parseLoanDate,
  ADMIN_WHATSAPP_DIGITS,
  ADMIN_WHATSAPP_DISPLAY,
  buildAdminReturnClaimMessage,
  buildVerificationWhatsAppMessage,
} from '../lib/whatsappReminder';

type KioskStep = 'home' | 'borrow' | 'return';
type BorrowSubStep =
  | 'identify'
  | 'verify_whatsapp'
  | 'blocked'
  | 'select_book'
  | 'agree_terms'
  | 'completed';

interface CompletedLoanSummary {
  bookTitle: string;
  bookAuthor: string;
  cdeIndex?: string;
  borrowerName: string;
  borrowerPhone: string;
  loanDate: Date;
  dueDate: Date;
  reminderDate: Date;
}

interface EligibilityResult {
  allowed: boolean;
  activeLoans: Loan[];
  severelyOverdueLoans: Array<{ loan: Loan; overdueDays: number }>;
  limitReached: boolean;
}

interface SelfServiceViewProps {
  standalone?: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onSignOut?: () => void;
  userLabel?: string;
}

const LOAN_TERM_DAYS = 30;
const REMINDER_DAYS_BEFORE = 3;
const MAX_ACTIVE_LOANS = 3;
const MAX_OVERDUE_DAYS_ALLOWED = 15;

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const SelfServiceView = ({
  standalone = false,
  theme,
  onToggleTheme,
}: SelfServiceViewProps) => {
  const [step, setStep] = useState<KioskStep>('home');
  const [borrowStep, setBorrowStep] = useState<BorrowSubStep>('identify');
  const [isTotemMode, setIsTotemMode] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: Reader identification & WhatsApp verification
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [whatsappOpened, setWhatsappOpened] = useState(false);
  const [showCodeOnTerminal, setShowCodeOnTerminal] = useState(false);
  const [eligibilityBlock, setEligibilityBlock] = useState<EligibilityResult | null>(null);

  // Step 2 & 3: Book search, 30-day term + "Concordo", completion
  const [bookSearch, setBookSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [completedLoan, setCompletedLoan] = useState<CompletedLoanSummary | null>(null);

  // Return state
  const [returnSearch, setReturnSearch] = useState('');
  const [confirmingLoan, setConfirmingLoan] = useState<Loan | null>(null);
  const [returnedLoanSummary, setReturnedLoanSummary] = useState<Loan | null>(null);

  // WhatsApp reminder deep-link action state (?acao=estender|ja-devolvi&loanId=...)
  const [reminderAction, setReminderAction] = useState<'estender' | 'ja-devolvi' | null>(null);
  const [actionLoan, setActionLoan] = useState<Loan | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionDone, setActionDone] = useState<{
    type: 'estender' | 'ja-devolvi';
    newDueDate?: Date;
    adminNotifiedViaApi?: boolean;
  } | null>(null);
  const [verificationApiSent, setVerificationApiSent] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [booksData, loansData, borrowersData] = await Promise.all([
        libraryService.getBooks(),
        libraryService.getLoans(),
        libraryService.getBorrowers(),
      ]);
      setBooks(booksData);
      setLoans(loansData);
      setBorrowers(borrowersData);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error('Erro ao carregar dados do autoatendimento:', err);
      setErrorMsg('Não foi possível carregar os dados do acervo. Tente atualizar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setErrorMsg(null);

    let booksLoaded = false;
    let loansLoaded = false;
    const markReady = () => {
      if (booksLoaded && loansLoaded) {
        setLoading(false);
      }
      setLastSyncedAt(new Date());
    };

    const handleSyncError = () => {
      setErrorMsg('Não foi possível sincronizar o acervo em tempo real. Tente atualizar.');
      setLoading(false);
    };

    const unsubBooks = libraryService.subscribeBooks((data) => {
      setBooks(data);
      booksLoaded = true;
      markReady();
    }, handleSyncError);

    const unsubLoans = libraryService.subscribeLoans((data) => {
      setLoans(data);
      loansLoaded = true;
      markReady();
    }, handleSyncError);

    const unsubBorrowers = libraryService.subscribeBorrowers((data) => {
      setBorrowers(data);
    });

    return () => {
      unsubBooks();
      unsubLoans();
      unsubBorrowers();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const acao = params.get('acao');
    const loanId = params.get('loanId');
    if ((acao === 'estender' || acao === 'ja-devolvi') && loanId) {
      setReminderAction(acao);
      setActionLoading(true);
      setErrorMsg(null);
      libraryService
        .getLoanById(loanId)
        .then((loan) => {
          if (!loan) {
            setErrorMsg('Empréstimo não encontrado. Verifique o link ou procure um empréstimo na tela inicial.');
          }
          setActionLoan(loan);
        })
        .catch(() => {
          setErrorMsg('Não foi possível carregar os dados deste empréstimo.');
        })
        .finally(() => {
          setActionLoading(false);
        });
    }
  }, []);

  const availableBooks = useMemo(
    () => books.filter((b) => b.status === 'available'),
    [books]
  );

  const activeLoans = useMemo(
    () => loans.filter((l) => l.status !== 'returned' && l.status !== 'lost'),
    [loans]
  );

  const filteredAvailableBooks = useMemo(() => {
    const q = bookSearch.trim().toLowerCase();
    if (!q) return availableBooks;
    return availableBooks.filter(
      (b) =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.cdeIndex || '').toLowerCase().includes(q) ||
        (b.isbn || '').toLowerCase().includes(q)
    );
  }, [availableBooks, bookSearch]);

  const matchingLoanedBooks = useMemo(() => {
    const q = bookSearch.trim().toLowerCase();
    if (!q || filteredAvailableBooks.length > 0) return [];
    return books.filter(
      (b) =>
        b.status === 'loaned' &&
        ((b.title || '').toLowerCase().includes(q) ||
          (b.author || '').toLowerCase().includes(q) ||
          (b.cdeIndex || '').toLowerCase().includes(q) ||
          (b.isbn || '').toLowerCase().includes(q))
    );
  }, [books, bookSearch, filteredAvailableBooks.length]);

  const filteredActiveLoans = useMemo(() => {
    const q = returnSearch.trim().toLowerCase();
    const qDigits = returnSearch.replace(/\D/g, '');
    const list = !q
      ? activeLoans
      : activeLoans.filter((l) => {
          const loanPhoneDigits = (l.borrowerPhone || '').replace(/\D/g, '');
          return (
            (l.bookTitle || '').toLowerCase().includes(q) ||
            (l.borrowerName || '').toLowerCase().includes(q) ||
            (l.borrowerPhone || '').toLowerCase().includes(q) ||
            (qDigits.length >= 4 && loanPhoneDigits.includes(qDigits)) ||
            (l.cdeIndex || '').toLowerCase().includes(q)
          );
        });

    return [...list].sort((a, b) => {
      const da = parseLoanDate(a.dueDate)?.getTime() ?? Infinity;
      const db = parseLoanDate(b.dueDate)?.getTime() ?? Infinity;
      return da - db;
    });
  }, [activeLoans, returnSearch]);

  const currentReaderPhoneKey = useMemo(
    () => normalizePhoneKey(borrowerPhone),
    [borrowerPhone]
  );

  const currentReaderActiveLoans = useMemo(() => {
    if (!currentReaderPhoneKey) return [];
    return activeLoans.filter((l) => {
      const loanKey = l.borrowerPhoneNormalized || normalizePhoneKey(l.borrowerPhone);
      return loanKey === currentReaderPhoneKey;
    });
  }, [activeLoans, currentReaderPhoneKey]);

  const evaluateBorrowerEligibility = (phoneKey: string, currentLoans: Loan[]): EligibilityResult => {
    const personActive = currentLoans.filter((l) => {
      if (l.status === 'returned' || l.status === 'lost') return false;
      const loanKey = l.borrowerPhoneNormalized || normalizePhoneKey(l.borrowerPhone);
      return loanKey === phoneKey;
    });

    const today = new Date();
    const severelyOverdueLoans: Array<{ loan: Loan; overdueDays: number }> = [];

    personActive.forEach((loan) => {
      const due = parseLoanDate(loan.dueDate);
      if (due) {
        const overdueDays = differenceInCalendarDays(today, due);
        if (overdueDays > MAX_OVERDUE_DAYS_ALLOWED) {
          severelyOverdueLoans.push({ loan, overdueDays });
        }
      }
    });

    const limitReached = personActive.length >= MAX_ACTIVE_LOANS;
    return {
      allowed: severelyOverdueLoans.length === 0 && !limitReached,
      activeLoans: personActive,
      severelyOverdueLoans,
      limitReached,
    };
  };

  const resetToHome = () => {
    setStep('home');
    setBorrowStep('identify');
    setBookSearch('');
    setSelectedBook(null);
    setBorrowerName('');
    setBorrowerPhone('');
    setVerificationCode('');
    setCodeInput('');
    setWhatsappOpened(false);
    setShowCodeOnTerminal(false);
    setEligibilityBlock(null);
    setAgreedToTerms(false);
    setCompletedLoan(null);
    setReturnSearch('');
    setConfirmingLoan(null);
    setReturnedLoanSummary(null);
    setReminderAction(null);
    setActionLoan(null);
    setActionDone(null);
    setVerificationApiSent(false);
    setErrorMsg(null);
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const startBorrowFlow = () => {
    resetToHome();
    setStep('borrow');
    setBorrowStep('identify');
  };

  const startReturnFlow = (initialSearch = '') => {
    resetToHome();
    setReturnSearch(initialSearch);
    setStep('return');
  };

  const proceedAfterRegistration = (phoneKey: string, freshLoans: Loan[]) => {
    const eligibility = evaluateBorrowerEligibility(phoneKey, freshLoans);
    if (!eligibility.allowed) {
      setEligibilityBlock(eligibility);
      setBorrowStep('blocked');
      return;
    }
    setEligibilityBlock(null);
    setBorrowStep('select_book');
  };

  const handleIdentifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = borrowerName.trim();
    const trimmedPhone = borrowerPhone.trim();
    const waDigits = normalizeWhatsAppPhone(trimmedPhone);

    if (!trimmedName || trimmedName.length < 2) {
      setErrorMsg('Informe seu nome completo para continuar.');
      return;
    }

    if (!waDigits || waDigits.length < 12) {
      setErrorMsg(
        'Informe um número de telefone/WhatsApp válido com DDD (ex: (11) 99999-8888).'
      );
      return;
    }

    setSubmitting(true);
    try {
      const [latestBorrowers, latestLoans] = await Promise.all([
        libraryService.getBorrowers(),
        libraryService.getLoans(),
      ]);
      setBorrowers(latestBorrowers);
      setLoans(latestLoans);

      const phoneKey = normalizePhoneKey(trimmedPhone);
      const existingBorrower = latestBorrowers.find((b) => {
        const bKey = b.phoneNormalized || normalizePhoneKey(b.phone);
        return bKey === phoneKey;
      });

      const hasLegacyLoanWithPhone = latestLoans.some((l) => {
        const lKey = l.borrowerPhoneNormalized || normalizePhoneKey(l.borrowerPhone);
        return lKey === phoneKey;
      });

      if (existingBorrower || hasLegacyLoanWithPhone) {
        // Already registered in the system -> check limits directly
        proceedAfterRegistration(phoneKey, latestLoans);
      } else {
        // Not yet registered -> require WhatsApp confirmation code
        const code = generateVerificationCode();
        setVerificationCode(code);
        setCodeInput('');
        setWhatsappOpened(false);
        setShowCodeOnTerminal(false);
        setVerificationApiSent(false);
        setBorrowStep('verify_whatsapp');

        // Attempt automatic server-side Cloud API delivery if configured
        fetch('/api/whatsapp/send-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: trimmedPhone,
            name: trimmedName,
            code,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.ok) {
              setVerificationApiSent(true);
            }
          })
          .catch(() => {
            // Fallback to wa.me / terminal code when server API is not configured
          });
      }
    } catch (err) {
      console.error('Erro ao verificar cadastro:', err);
      setErrorMsg('Não foi possível verificar o cadastro. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (codeInput.trim() !== verificationCode) {
      setErrorMsg('Código de confirmação incorreto. Verifique a mensagem do WhatsApp e tente novamente.');
      return;
    }

    setSubmitting(true);
    try {
      await libraryService.registerVerifiedBorrower(borrowerName.trim(), borrowerPhone.trim());
      const [latestBorrowers, latestLoans] = await Promise.all([
        libraryService.getBorrowers(),
        libraryService.getLoans(),
      ]);
      setBorrowers(latestBorrowers);
      setLoans(latestLoans);

      const phoneKey = normalizePhoneKey(borrowerPhone);
      proceedAfterRegistration(phoneKey, latestLoans);
    } catch (err) {
      console.error('Erro ao confirmar cadastro:', err);
      setErrorMsg('Não foi possível concluir o cadastro. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerateCode = () => {
    const newCode = generateVerificationCode();
    setVerificationCode(newCode);
    setCodeInput('');
    setErrorMsg(null);
  };

  const handleConfirmLoan = async () => {
    if (!selectedBook?.id || !agreedToTerms) return;

    const trimmedName = borrowerName.trim();
    const trimmedPhone = borrowerPhone.trim();
    const phoneKey = normalizePhoneKey(trimmedPhone);

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // Re-verify live eligibility and book availability before committing
      const [latestLoans, latestBooks] = await Promise.all([
        libraryService.getLoans(),
        libraryService.getBooks(),
      ]);
      setLoans(latestLoans);
      setBooks(latestBooks);

      const eligibility = evaluateBorrowerEligibility(phoneKey, latestLoans);
      if (!eligibility.allowed) {
        setEligibilityBlock(eligibility);
        setBorrowStep('blocked');
        return;
      }

      const freshBook = latestBooks.find((b) => b.id === selectedBook.id);
      if (!freshBook || freshBook.status !== 'available') {
        setErrorMsg('Este exemplar acabou de ser emprestado. Escolha outro título disponível.');
        setSelectedBook(null);
        setAgreedToTerms(false);
        setBorrowStep('select_book');
        return;
      }

      const now = new Date();
      const due = addDays(now, LOAN_TERM_DAYS);
      const scheduledReminderDate = addDays(due, -REMINDER_DAYS_BEFORE);

      await libraryService.createLoan({
        bookId: selectedBook.id,
        bookTitle: selectedBook.title,
        cdeIndex: selectedBook.cdeIndex || undefined,
        borrowerName: trimmedName,
        borrowerPhone: trimmedPhone,
        borrowerPhoneNormalized: phoneKey || undefined,
        responsible: 'Autoatendimento',
        notes: `Registrado via Autoatendimento (prazo de ${LOAN_TERM_DAYS} dias · lembrete WhatsApp agendado para ${format(scheduledReminderDate, 'dd/MM/yyyy')})`,
        loanDate: now,
        dueDate: due,
        agreedToTerms: true,
        reminderScheduledFor: Timestamp.fromDate(scheduledReminderDate),
        reminderStatus: 'scheduled',
      });

      setCompletedLoan({
        bookTitle: selectedBook.title,
        bookAuthor: selectedBook.author,
        cdeIndex: selectedBook.cdeIndex,
        borrowerName: trimmedName,
        borrowerPhone: trimmedPhone,
        loanDate: now,
        dueDate: due,
        reminderDate: scheduledReminderDate,
      });
      setBorrowStep('completed');
    } catch (err) {
      console.error('Erro no autoatendimento (empréstimo):', err);
      setErrorMsg(
        'Não foi possível registrar o empréstimo. Tente novamente ou peça ajuda na recepção.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReturn = async (loan: Loan) => {
    if (!loan.id) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await libraryService.returnBook(loan.id, loan.bookId);
      setReturnedLoanSummary(loan);
      setConfirmingLoan(null);
      await loadData();
    } catch (err) {
      console.error('Erro no autoatendimento (devolução):', err);
      setErrorMsg(
        'Não foi possível registrar a devolução. Tente novamente ou peça ajuda na recepção.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateValue = (date: any) => {
    const parsed = parseLoanDate(date);
    if (!parsed) return 'Sem prazo';
    return format(parsed, "dd 'de' MMM 'de' yyyy", { locale: ptBR });
  };

  const isLoanOverdue = (loan: Loan) => {
    if (loan.status === 'returned' || loan.status === 'lost') return false;
    if (loan.status === 'overdue') return true;
    const dueDate = parseLoanDate(loan.dueDate);
    return dueDate !== null && differenceInCalendarDays(dueDate, new Date()) < 0;
  };

  const handleConfirmExtend15Days = async () => {
    if (!actionLoan?.id) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const newDueDate = await libraryService.extendLoanBy15Days(actionLoan);
      setActionDone({ type: 'estender', newDueDate });
      await loadData();
    } catch (err) {
      console.error('Erro ao prorrogar empréstimo:', err);
      setErrorMsg('Não foi possível prorrogar este empréstimo. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAlreadyReturned = async () => {
    if (!actionLoan?.id) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await libraryService.reportLoanAlreadyReturned(actionLoan.id);
      let adminNotifiedViaApi = false;
      try {
        const resp = await fetch('/api/whatsapp/notify-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loanId: actionLoan.id,
            bookTitle: actionLoan.bookTitle,
            borrowerName: actionLoan.borrowerName,
            borrowerPhone: actionLoan.borrowerPhone,
          }),
        });
        const data = await resp.json();
        adminNotifiedViaApi = Boolean(data?.ok);
      } catch {
        adminNotifiedViaApi = false;
      }

      setActionDone({ type: 'ja-devolvi', adminNotifiedViaApi });
      await loadData();
    } catch (err) {
      console.error('Erro ao registrar aviso de devolução:', err);
      setErrorMsg('Não foi possível registrar seu aviso. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewDueDate = addDays(new Date(), LOAN_TERM_DAYS);
  const previewReminderDate = addDays(previewDueDate, -REMINDER_DAYS_BEFORE);

  const verificationWaDigits = normalizeWhatsAppPhone(borrowerPhone);
  const verificationMessage = buildVerificationWhatsAppMessage(
    borrowerName || 'leitor(a)',
    verificationCode
  );
  const verificationWaUrl = verificationWaDigits
    ? buildWhatsAppUrl(verificationWaDigits, verificationMessage)
    : '#';

  const content = (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          {step !== 'home' && (
            <button
              type="button"
              onClick={resetToHome}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-2 transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Voltar ao início</span>
            </button>
          )}
          <h1 className="text-3xl font-display font-bold tracking-tight text-slate-800 dark:text-slate-100">
            Autoatendimento
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
            Retire ou devolva livros de forma simples e rápida, sem precisar fazer login.
          </p>
        </div>

        {/* Discreet Utility Menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 180)}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
            title="Opções do autoatendimento"
            aria-label="Opções do autoatendimento"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 z-30">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setMenuOpen(false);
                  loadData();
                }}
                disabled={loading}
                className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin text-indigo-500' : 'text-slate-400'} />
                <span>Atualizar acervo</span>
              </button>
              {!isTotemMode ? (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    setIsTotemMode(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                >
                  <Maximize2 size={15} className="text-slate-400" />
                  <span>Modo Totem (tela cheia)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    setShowExitConfirm(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                >
                  <Minimize2 size={15} className="text-slate-400" />
                  <span>Sair do Modo Totem</span>
                </button>
              )}
              {standalone && onToggleTheme && theme && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    onToggleTheme();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                >
                  {theme === 'light' ? (
                    <Moon size={15} className="text-slate-400" />
                  ) : (
                    <Sun size={15} className="text-slate-400" />
                  )}
                  <span>{theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Global Error */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-sm font-medium">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* WHATSAPP REMINDER INTERACTIVE ACTION VIEW */}
      {reminderAction ? (
        <div className="max-w-xl mx-auto">
          {actionLoading ? (
            <div className="glass-card p-12 rounded-2xl flex flex-col items-center gap-4 text-center">
              <Loader2 className="animate-spin text-indigo-500" size={32} />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Carregando informações do seu empréstimo...
              </p>
            </div>
          ) : actionDone ? (
            <div className="glass-card p-8 md:p-10 rounded-2xl text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={36} />
              </div>
              {actionDone.type === 'estender' ? (
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                    Prazo Prorrogado (+15 dias)
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Adicionamos mais 15 dias ao prazo do livro{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {actionLoan?.bookTitle}
                    </strong>
                    .
                  </p>
                  {actionDone.newDueDate && (
                    <div className="mt-4 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40 text-sm">
                      <span className="text-slate-600 dark:text-slate-300">Nova data de devolução: </span>
                      <strong className="text-indigo-700 dark:text-indigo-300 tabular-nums">
                        {format(actionDone.newDueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </strong>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                    Aviso de Devolução Registrado
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {actionDone.adminNotifiedViaApi
                      ? `O administrador da biblioteca (${ADMIN_WHATSAPP_DISPLAY}) já recebeu a notificação automática pelo WhatsApp e o status foi sinalizado no sistema.`
                      : `Registramos no sistema que você já devolveu o livro "${actionLoan?.bookTitle}". Caso deseje, envie também a confirmação direta para o WhatsApp do administrador abaixo:`}
                  </p>
                  {!actionDone.adminNotifiedViaApi && actionLoan && (
                    <a
                      href={buildWhatsAppUrl(
                        ADMIN_WHATSAPP_DIGITS,
                        buildAdminReturnClaimMessage(actionLoan)
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
                    >
                      <MessageCircle size={18} />
                      <span>Enviar mensagem ao Administrador ({ADMIN_WHATSAPP_DISPLAY})</span>
                    </a>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={resetToHome}
                className="w-full btn-primary py-4 text-base"
              >
                Ir para o Autoatendimento
              </button>
            </div>
          ) : actionLoan ? (
            <div className="glass-card p-6 md:p-8 rounded-2xl space-y-6">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Resposta ao Lembrete WhatsApp · Centro Espírita Pedra de Luz
                </p>
                <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                  {reminderAction === 'estender'
                    ? 'Preciso de mais tempo (+15 dias)'
                    : 'Informar que já devolvi o livro'}
                </h2>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 text-sm">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Livro</span>
                  <strong className="text-slate-800 dark:text-slate-100 text-base">
                    {actionLoan.bookTitle}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300 text-xs">
                  <span>
                    Leitor: <strong>{actionLoan.borrowerName}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    Prazo atual: {formatDateValue(actionLoan.dueDate)}
                  </span>
                </div>
              </div>

              {actionLoan.status === 'returned' || actionLoan.status === 'lost' ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-sm font-medium">
                  Este empréstimo já foi encerrado e consta como devolvido no sistema.
                </div>
              ) : reminderAction === 'estender' ? (
                <button
                  type="button"
                  onClick={handleConfirmExtend15Days}
                  disabled={submitting}
                  className="w-full btn-primary py-4 text-base disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <span>Confirmar: Preciso de mais tempo (+15 dias)</span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmAlreadyReturned}
                  disabled={submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-5 rounded-xl transition-colors flex items-center justify-center gap-2 text-base disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <span>Confirmar: Já devolvi (Avisar Administrador)</span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={resetToHome}
                className="w-full btn-secondary py-3 text-sm"
              >
                Voltar ao Autoatendimento
              </button>
            </div>
          ) : (
            <div className="glass-card p-8 rounded-2xl text-center space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Não foi possível localizar o empréstimo informado neste link.
              </p>
              <button
                type="button"
                onClick={resetToHome}
                className="btn-primary py-3 px-6 text-sm mx-auto"
              >
                Ir para o Autoatendimento
              </button>
            </div>
          )}
        </div>
      ) : (
      <AnimatePresence mode="wait">
        {/* HOME SCREEN */}
        {step === 'home' && (
          <motion.div
            key="kiosk-home"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              <span>
                <strong className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {availableBooks.length}
                </strong>{' '}
                {availableBooks.length === 1 ? 'livro disponível para retirada' : 'livros disponíveis para retirada'}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span>
                <strong className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {activeLoans.length}
                </strong>{' '}
                {activeLoans.length === 1 ? 'empréstimo em andamento' : 'empréstimos em andamento'}
              </span>
              {lastSyncedAt && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500">
                    Sincronizado às {format(lastSyncedAt, 'HH:mm')}
                  </span>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                type="button"
                onClick={startBorrowFlow}
                className="group text-left glass-card p-8 rounded-2xl hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-xl hover:shadow-indigo-500/5 transition-all flex flex-col justify-between min-h-[240px]"
              >
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                    <HandHeart size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                      Retirar Livro
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                      Identifique-se com nome e WhatsApp, escolha um livro disponível e confirme o prazo de 30 dias.
                    </p>
                  </div>
                </div>
                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  <span>Iniciar empréstimo</span>
                  <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500 font-semibold">
                    {availableBooks.length} disponíveis
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => startReturnFlow('')}
                className="group text-left glass-card p-8 rounded-2xl hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-xl hover:shadow-emerald-500/5 transition-all flex flex-col justify-between min-h-[240px]"
              >
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                    <RotateCcw size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                      Devolver Livro
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                      Encontre seu empréstimo pelo seu nome, telefone ou título do livro e confirme a devolução.
                    </p>
                  </div>
                </div>
                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Registrar devolução</span>
                  <span className="tabular-nums text-xs text-slate-400 dark:text-slate-500 font-semibold">
                    {activeLoans.length} em curso
                  </span>
                </div>
              </button>
            </div>
          </motion.div>
        )}

        {/* BORROW FLOW */}
        {step === 'borrow' && (
          <motion.div
            key={`kiosk-borrow-${borrowStep}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* STEP 1: IDENTIFY (NAME + PHONE) */}
            {borrowStep === 'identify' && (
              <div className="max-w-xl mx-auto">
                <form
                  onSubmit={handleIdentifySubmit}
                  className="glass-card p-6 md:p-8 rounded-2xl space-y-6"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      Etapa 1 de 3 · Identificação
                    </p>
                    <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                      Informe seu nome e WhatsApp
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Verificaremos seu cadastro pelo telefone. Se for sua primeira vez, enviaremos um código de confirmação no WhatsApp.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <UserIcon size={14} />
                        <span>Nome completo *</span>
                      </label>
                      <input
                        required
                        type="text"
                        autoComplete="name"
                        placeholder="Digite seu nome completo"
                        value={borrowerName}
                        onChange={(e) => setBorrowerName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Phone size={14} />
                        <span>Telefone / WhatsApp *</span>
                      </label>
                      <input
                        required
                        type="tel"
                        autoComplete="tel"
                        placeholder="(00) 00000-0000"
                        value={borrowerPhone}
                        onChange={(e) => setBorrowerPhone(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-800 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full btn-primary py-4 text-base disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      <span>Continuar</span>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* STEP 1B: WHATSAPP VERIFICATION FOR NEW READERS */}
            {borrowStep === 'verify_whatsapp' && (
              <div className="max-w-xl mx-auto">
                <form
                  onSubmit={handleVerifyCodeSubmit}
                  className="glass-card p-6 md:p-8 rounded-2xl space-y-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <ShieldCheck size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Novo cadastro · Verificação pelo WhatsApp
                      </p>
                      <h2 className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">
                        Confirme seu número de WhatsApp
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Não encontramos cadastro para{' '}
                        <strong className="text-slate-700 dark:text-slate-200 tabular-nums">
                          {borrowerPhone}
                        </strong>
                        . Envie a mensagem de confirmação para o WhatsApp e informe o código de 6 dígitos abaixo.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 space-y-3">
                    {verificationApiSent ? (
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                        Código enviado automaticamente para o seu WhatsApp ({borrowerPhone}). Caso não tenha chegado, você também pode clicar no botão abaixo:
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                        1. Clique no botão abaixo para receber/enviar a mensagem com seu código pelo WhatsApp:
                      </p>
                    )}
                    <a
                      href={verificationWaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setWhatsappOpened(true)}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
                    >
                      <MessageCircle size={18} />
                      <span>
                        {whatsappOpened
                          ? 'Reenviar código pelo WhatsApp'
                          : 'Enviar código pelo WhatsApp'}
                      </span>
                    </a>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setShowCodeOnTerminal((prev) => !prev)}
                        className="font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
                      >
                        {showCodeOnTerminal
                          ? 'Ocultar código no terminal'
                          : 'Não abriu o WhatsApp? Ver código aqui'}
                      </button>
                      <button
                        type="button"
                        onClick={handleRegenerateCode}
                        className="font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        Gerar novo código
                      </button>
                    </div>
                    {showCodeOnTerminal && (
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Código gerado para {borrowerPhone}:
                        </span>
                        <span className="font-mono font-bold text-base tracking-widest text-emerald-700 dark:text-emerald-300 tabular-nums">
                          {verificationCode}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      2. Digite o código de confirmação (6 dígitos) *
                    </label>
                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-4 text-center text-2xl font-mono font-bold tracking-[0.35em] text-slate-800 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setBorrowStep('identify');
                      }}
                      className="btn-secondary py-3.5 px-5 text-sm"
                    >
                      Alterar número
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || codeInput.trim().length < 6}
                      className="flex-1 btn-primary py-3.5 text-base disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        <span>Confirmar Cadastro e Continuar</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* BLOCKED: >15 DAYS OVERDUE OR 3 ACTIVE BOOKS */}
            {borrowStep === 'blocked' && eligibilityBlock && (
              <div className="max-w-2xl mx-auto glass-card p-6 md:p-8 rounded-2xl space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle size={24} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                      Empréstimo não disponível no momento
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Cadastro de <strong className="text-slate-700 dark:text-slate-200">{borrowerName}</strong>{' '}
                      ({borrowerPhone})
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {eligibilityBlock.severelyOverdueLoans.length > 0 && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200 space-y-2">
                      <p className="text-sm font-bold">
                        Motivo: Livro com mais de 15 dias de atraso na devolução
                      </p>
                      <p className="text-xs leading-relaxed">
                        Você possui{' '}
                        {eligibilityBlock.severelyOverdueLoans.length === 1
                          ? '1 exemplar com mais de 15 dias de atraso'
                          : `${eligibilityBlock.severelyOverdueLoans.length} exemplares com mais de 15 dias de atraso`}
                        . Devolva o(s) livro(s) em atraso antes de retirar um novo exemplar:
                      </p>
                      <ul className="text-xs space-y-1 pt-1 font-semibold">
                        {eligibilityBlock.severelyOverdueLoans.map(({ loan, overdueDays }) => (
                          <li key={loan.id} className="tabular-nums">
                            • {loan.bookTitle} ({overdueDays} dias de atraso)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {eligibilityBlock.limitReached && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 space-y-1.5">
                      <p className="text-sm font-bold">
                        Motivo: Limite de 3 livros por pessoa atingido
                      </p>
                      <p className="text-xs leading-relaxed tabular-nums">
                        Você já está com {eligibilityBlock.activeLoans.length} livros emprestados simultaneamente. O limite máximo é de {MAX_ACTIVE_LOANS} livros por pessoa. Devolva ao menos um exemplar para liberar uma nova retirada.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Seus empréstimos ativos no momento ({eligibilityBlock.activeLoans.length})
                  </p>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {eligibilityBlock.activeLoans.map((loan) => (
                      <div
                        key={loan.id}
                        className="p-3.5 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {loan.bookTitle}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                          Prazo: {formatDateValue(loan.dueDate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => startReturnFlow(borrowerPhone)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <RotateCcw size={17} />
                    <span>Devolver um Livro Agora</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetToHome}
                    className="btn-secondary py-3.5 px-5 text-sm"
                  >
                    Voltar ao início
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: SEARCH BY TITLE & CHOOSE AVAILABLE BOOK */}
            {borrowStep === 'select_book' && (
              <div className="space-y-6">
                <div className="glass-card p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Leitor: </span>
                    <strong className="text-slate-800 dark:text-slate-100">{borrowerName}</strong>
                    <span className="text-slate-400 mx-2">·</span>
                    <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                      {borrowerPhone}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    Empréstimos ativos: {currentReaderActiveLoans.length} de {MAX_ACTIVE_LOANS}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    Etapa 2 de 3 · Escolha do livro
                  </p>
                  <h2 className="text-xl font-display font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                    Digite o título do livro que deseja retirar
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Clique em um exemplar disponível abaixo para prosseguir.
                  </p>
                </div>

                <div className="relative">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="text"
                    autoFocus
                    value={bookSearch}
                    onChange={(e) => setBookSearch(e.target.value)}
                    placeholder="Digite o título do livro (ou autor / código CDE)..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-4 pl-12 pr-4 text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  />
                </div>

                {loading ? (
                  <div className="py-20 flex justify-center">
                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                  </div>
                ) : filteredAvailableBooks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredAvailableBooks.map((book) => (
                      <button
                        key={book.id}
                        type="button"
                        onClick={() => {
                          setSelectedBook(book);
                          setAgreedToTerms(false);
                          setErrorMsg(null);
                          setBorrowStep('agree_terms');
                        }}
                        className="text-left glass-card p-4 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all flex gap-4 items-start group"
                      >
                        <div className="w-16 h-24 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 flex items-center justify-center text-slate-300 dark:text-slate-600">
                          {book.coverUrl ? (
                            <img
                              src={book.coverUrl}
                              alt={book.title}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <BookIcon size={24} strokeWidth={1.5} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col justify-between h-24">
                          <div>
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {book.title}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                              {book.author}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {book.cdeIndex && (
                              <>
                                <span>CDE {book.cdeIndex}</span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Disponível
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="glass-card p-10 rounded-2xl text-center space-y-4">
                    <BookIcon size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
                    <div>
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        Nenhum livro disponível encontrado
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Verifique a grafia ou tente buscar por outra palavra do título.
                      </p>
                    </div>
                    {matchingLoanedBooks.length > 0 && (
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 max-w-md mx-auto space-y-3">
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                          O exemplar &ldquo;{matchingLoanedBooks[0].title}&rdquo; está emprestado no momento. Deseja devolvê-lo?
                        </p>
                        <button
                          type="button"
                          onClick={() => startReturnFlow(matchingLoanedBooks[0].title)}
                          className="btn-secondary text-sm mx-auto"
                        >
                          <RotateCcw size={15} />
                          <span>Ir para Devolução</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: 30-DAY TERM + 3 DAYS BEFORE WHATSAPP NOTICE + "CONCORDO" */}
            {borrowStep === 'agree_terms' && selectedBook && (
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="glass-card p-4 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 flex items-center justify-center text-slate-400">
                      {selectedBook.coverUrl ? (
                        <img
                          src={selectedBook.coverUrl}
                          alt={selectedBook.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <BookIcon size={20} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">
                        {selectedBook.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {selectedBook.author}
                        {selectedBook.cdeIndex ? ` · CDE ${selectedBook.cdeIndex}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBook(null);
                      setAgreedToTerms(false);
                      setBorrowStep('select_book');
                    }}
                    className="btn-secondary text-xs px-3 py-2 whitespace-nowrap shrink-0"
                  >
                    Trocar Livro
                  </button>
                </div>

                <div className="glass-card p-6 md:p-8 rounded-2xl space-y-6">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      Etapa 3 de 3 · Prazo e Confirmação
                    </p>
                    <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                      Prazo de Devolução e Lembrete
                    </h2>
                  </div>

                  <div className="p-5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 space-y-4 text-sm text-slate-700 dark:text-slate-200">
                    <div className="flex items-start gap-3">
                      <Calendar size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        O prazo de entrega deste livro é de{' '}
                        <strong className="text-slate-900 dark:text-white">30 dias</strong> (até{' '}
                        <strong className="text-indigo-700 dark:text-indigo-300 tabular-nums">
                          {format(previewDueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </strong>
                        ).
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <BellRing size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        Será programada uma mensagem automática para o seu WhatsApp{' '}
                        <strong className="text-slate-900 dark:text-white">
                          3 dias antes do prazo encerrar
                        </strong>{' '}
                        (em{' '}
                        <strong className="tabular-nums">
                          {format(previewReminderDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </strong>
                        ), caso o livro ainda não tenha sido devolvido ao acervo.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-pressed={agreedToTerms}
                    onClick={() => setAgreedToTerms((prev) => !prev)}
                    className={`w-full p-4 rounded-xl border text-left transition-all flex items-center gap-3.5 ${
                      agreedToTerms
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        agreedToTerms
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {agreedToTerms && <Check size={15} strokeWidth={3} />}
                    </div>
                    <span className="font-bold text-sm">
                      Concordo com o prazo de devolução de 30 dias e com o envio do lembrete por WhatsApp 3 dias antes do vencimento.
                    </span>
                  </button>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setAgreedToTerms(false);
                        setBorrowStep('select_book');
                      }}
                      disabled={submitting}
                      className="btn-secondary py-3.5 px-5 text-sm"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmLoan}
                      disabled={!agreedToTerms || submitting}
                      className="flex-1 btn-primary py-4 text-base disabled:opacity-40"
                    >
                      {submitting ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        <span>Finalizar Empréstimo</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: COMPLETED */}
            {borrowStep === 'completed' && completedLoan && (
              <div className="max-w-xl mx-auto glass-card p-8 md:p-10 rounded-2xl text-center space-y-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 size={36} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                    Empréstimo Confirmado
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Boa leitura! Seu empréstimo foi registrado no acervo e o aviso pelo WhatsApp foi programado.
                  </p>
                </div>

                <div className="text-left bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Livro</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-right">
                      {completedLoan.bookTitle}
                    </span>
                  </div>
                  {completedLoan.cdeIndex && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500 dark:text-slate-400">Código CDE</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                        {completedLoan.cdeIndex}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Leitor</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 text-right">
                      {completedLoan.borrowerName}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">WhatsApp</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                      {completedLoan.borrowerPhone}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Devolução em 30 dias</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                      {format(completedLoan.dueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Aviso programado (3 dias antes)
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {format(completedLoan.reminderDate, 'dd/MM/yyyy')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetToHome}
                  className="w-full btn-primary py-4 text-base"
                >
                  Concluir e Novo Atendimento
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* RETURN FLOW */}
        {step === 'return' && (
          <motion.div
            key="kiosk-return"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {returnedLoanSummary ? (
              <div className="max-w-xl mx-auto glass-card p-8 md:p-10 rounded-2xl text-center space-y-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 size={36} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                    Devolução Registrada
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Obrigado por devolver o exemplar! O livro já está disponível no acervo e o lembrete programado foi cancelado.
                  </p>
                </div>

                <div className="text-left bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Livro devolvido</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-right">
                      {returnedLoanSummary.bookTitle}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Leitor</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 text-right">
                      {returnedLoanSummary.borrowerName}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Situação do exemplar</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Disponível no acervo
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetToHome}
                  className="w-full btn-primary py-4 text-base"
                >
                  Concluir e Novo Atendimento
                </button>
              </div>
            ) : confirmingLoan ? (
              <div className="max-w-lg mx-auto glass-card p-8 rounded-2xl space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">
                    Confirmar Devolução
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Confira os dados antes de concluir a devolução do livro.
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Livro</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-base">
                      {confirmingLoan.bookTitle}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
                    <span>
                      Leitor: <strong>{confirmingLoan.borrowerName}</strong>
                    </span>
                    {confirmingLoan.cdeIndex && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">CDE {confirmingLoan.cdeIndex}</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Prazo previsto: {formatDateValue(confirmingLoan.dueDate)}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingLoan(null)}
                    disabled={submitting}
                    className="flex-1 btn-secondary py-3.5 text-sm"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmReturn(confirmingLoan)}
                    disabled={submitting}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <CheckCircle2 size={18} />
                        <span>Confirmar Devolução</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">
                    Encontre o empréstimo para devolver
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Busque pelo seu nome, telefone, título do livro ou código CDE.
                  </p>
                </div>

                <div className="relative">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="text"
                    value={returnSearch}
                    onChange={(e) => setReturnSearch(e.target.value)}
                    placeholder="Digite seu nome, telefone ou título do livro..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-4 pl-12 pr-4 text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>

                {loading ? (
                  <div className="py-20 flex justify-center">
                    <Loader2 className="animate-spin text-emerald-500" size={32} />
                  </div>
                ) : filteredActiveLoans.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredActiveLoans.map((loan) => {
                      const overdue = isLoanOverdue(loan);
                      return (
                        <div
                          key={loan.id}
                          className="glass-card p-5 rounded-xl flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0 space-y-1.5">
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base truncate">
                              {loan.bookTitle}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {loan.borrowerName}
                              </span>
                              {loan.cdeIndex && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">CDE {loan.cdeIndex}</span>
                                </>
                              )}
                            </div>
                            <div
                              className={`flex items-center gap-1.5 text-xs font-medium tabular-nums ${
                                overdue
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              <Clock size={13} />
                              <span>
                                {overdue ? 'Atrasado · Previsto para ' : 'Devolução prevista: '}
                                {formatDateValue(loan.dueDate)}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setConfirmingLoan(loan)}
                            className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
                          >
                            Devolver
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="glass-card p-10 rounded-2xl text-center space-y-2">
                    <CheckCircle2 size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="font-bold text-slate-700 dark:text-slate-200">
                      Nenhum empréstimo ativo encontrado
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Não há pendências correspondentes à sua busca no momento.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* Exit Totem Confirmation Dialog */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-5"
            >
              <div className="space-y-1.5">
                <h3 className="text-lg font-display font-bold text-slate-800 dark:text-slate-100">
                  Sair do Modo Totem?
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Isso encerrará a visualização em tela cheia do autoatendimento.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 btn-secondary text-sm py-2.5"
                >
                  Continuar no Totem
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExitConfirm(false);
                    setIsTotemMode(false);
                  }}
                  className="flex-1 btn-primary text-sm py-2.5"
                >
                  Sair do Totem
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (isTotemMode) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-6 py-8 md:py-12">{content}</div>
      </div>
    );
  }

  return content;
};
