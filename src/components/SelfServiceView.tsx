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
  Mail,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { libraryService, Book, Loan, Borrower } from '../services/libraryService';

type KioskStep = 'home' | 'borrow' | 'return';

interface CompletedLoanSummary {
  bookTitle: string;
  bookAuthor: string;
  cdeIndex?: string;
  borrowerName: string;
  borrowerPhone: string;
  loanDate: Date;
  dueDate: Date;
}

export const SelfServiceView = () => {
  const [step, setStep] = useState<KioskStep>('home');
  const [isTotemMode, setIsTotemMode] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Borrow state
  const [bookSearch, setBookSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [borrowerEmail, setBorrowerEmail] = useState('');
  const [loanDurationDays, setLoanDurationDays] = useState<15 | 30>(30);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [completedLoan, setCompletedLoan] = useState<CompletedLoanSummary | null>(null);

  // Return state
  const [returnSearch, setReturnSearch] = useState('');
  const [confirmingLoan, setConfirmingLoan] = useState<Loan | null>(null);
  const [returnedLoanSummary, setReturnedLoanSummary] = useState<Loan | null>(null);

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
    } catch (err) {
      console.error('Erro ao carregar dados do autoatendimento:', err);
      setErrorMsg('Não foi possível carregar os dados do acervo. Tente atualizar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const availableBooks = useMemo(
    () => books.filter((b) => b.status === 'available'),
    [books]
  );

  const activeLoans = useMemo(
    () => loans.filter((l) => l.status !== 'returned'),
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
    const list = !q
      ? activeLoans
      : activeLoans.filter(
          (l) =>
            (l.bookTitle || '').toLowerCase().includes(q) ||
            (l.borrowerName || '').toLowerCase().includes(q) ||
            (l.borrowerPhone || '').toLowerCase().includes(q) ||
            (l.cdeIndex || '').toLowerCase().includes(q)
        );

    return [...list].sort((a, b) => {
      const getVal = (date: any) => {
        try {
          if (date?.toDate) return date.toDate().getTime();
          if (date instanceof Date) return date.getTime();
          return new Date(date).getTime();
        } catch {
          return Infinity;
        }
      };
      return getVal(a.dueDate) - getVal(b.dueDate);
    });
  }, [activeLoans, returnSearch]);

  const borrowerSuggestions = useMemo(() => {
    const q = borrowerName.trim().toLowerCase();
    if (!q || !showSuggestions) return [];
    return borrowers
      .filter((b) => (b.name || '').toLowerCase().includes(q))
      .slice(0, 5);
  }, [borrowers, borrowerName, showSuggestions]);

  const resetToHome = () => {
    setStep('home');
    setBookSearch('');
    setSelectedBook(null);
    setBorrowerName('');
    setBorrowerPhone('');
    setBorrowerEmail('');
    setLoanDurationDays(30);
    setCompletedLoan(null);
    setReturnSearch('');
    setConfirmingLoan(null);
    setReturnedLoanSummary(null);
    setErrorMsg(null);
  };

  const startBorrowFlow = () => {
    resetToHome();
    setStep('borrow');
    loadData();
  };

  const startReturnFlow = (initialSearch = '') => {
    resetToHome();
    setReturnSearch(initialSearch);
    setStep('return');
    loadData();
  };

  const handleConfirmLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook?.id) return;

    const trimmedName = borrowerName.trim();
    const trimmedPhone = borrowerPhone.trim();
    const trimmedEmail = borrowerEmail.trim();

    if (!trimmedName || !trimmedPhone) {
      setErrorMsg('Informe seu nome completo e telefone para concluir o empréstimo.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    const now = new Date();
    const due = addDays(now, loanDurationDays);

    try {
      await libraryService.createLoan({
        bookId: selectedBook.id,
        bookTitle: selectedBook.title,
        cdeIndex: selectedBook.cdeIndex || undefined,
        borrowerName: trimmedName,
        borrowerPhone: trimmedPhone,
        borrowerEmail: trimmedEmail || undefined,
        responsible: 'Autoatendimento',
        notes: `Registrado via Autoatendimento (${loanDurationDays} dias)`,
        loanDate: now,
        dueDate: due,
      });

      setCompletedLoan({
        bookTitle: selectedBook.title,
        bookAuthor: selectedBook.author,
        cdeIndex: selectedBook.cdeIndex,
        borrowerName: trimmedName,
        borrowerPhone: trimmedPhone,
        loanDate: now,
        dueDate: due,
      });
      await loadData();
    } catch (err) {
      console.error('Erro no autoatendimento (empréstimo):', err);
      setErrorMsg('Não foi possível registrar o empréstimo. Tente novamente ou peça ajuda na recepção.');
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
      setErrorMsg('Não foi possível registrar a devolução. Tente novamente ou peça ajuda na recepção.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateValue = (date: any) => {
    try {
      const parsed = date?.toDate ? date.toDate() : new Date(date);
      if (isNaN(parsed.getTime())) return 'Sem prazo';
      return format(parsed, "dd 'de' MMM 'de' yyyy", { locale: ptBR });
    } catch {
      return 'Sem prazo';
    }
  };

  const isLoanOverdue = (loan: Loan) => {
    if (loan.status !== 'active') return false;
    try {
      const dueDate = loan.dueDate?.toDate ? loan.dueDate.toDate() : new Date(loan.dueDate);
      return !isNaN(dueDate.getTime()) && dueDate < new Date();
    } catch {
      return false;
    }
  };

  const computedDueDate = addDays(new Date(), loanDurationDays);

  const content = (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-slate-800 dark:text-slate-100">
            Autoatendimento
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
            Retire ou devolva livros de forma simples e rápida.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {step !== 'home' && (
            <button
              type="button"
              onClick={resetToHome}
              className="btn-secondary text-sm px-4 py-2.5 whitespace-nowrap shrink-0"
            >
              <ArrowLeft size={16} />
              <span>Início</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="btn-secondary text-sm px-3.5 py-2.5 whitespace-nowrap shrink-0"
            title="Atualizar acervo"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          {!isTotemMode ? (
            <button
              type="button"
              onClick={() => setIsTotemMode(true)}
              className="btn-primary text-sm px-4 py-2.5 whitespace-nowrap shrink-0"
            >
              <Maximize2 size={16} />
              <span>Modo Totem</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowExitConfirm(true)}
              className="btn-secondary text-sm px-4 py-2.5 whitespace-nowrap shrink-0"
            >
              <Minimize2 size={16} />
              <span>Modo Gestão</span>
            </button>
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
            {/* Quiet summary metrics */}
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
            </div>

            {/* 2 Primary Self-Service Action Cards */}
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
                      Pesquise o título desejado no acervo, informe seu nome e telefone e leve sua leitura para casa.
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
            key="kiosk-borrow"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {completedLoan ? (
              <div className="max-w-xl mx-auto glass-card p-8 md:p-10 rounded-2xl text-center space-y-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 size={36} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100">
                    Empréstimo Confirmado
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Boa leitura! Lembre-se da data prevista para devolução.
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
                    <span className="text-slate-500 dark:text-slate-400">Telefone</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                      {completedLoan.borrowerPhone}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Devolução prevista</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                      {format(completedLoan.dueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
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
            ) : !selectedBook ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">
                      1. Escolha o livro que deseja retirar
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Mostrando apenas exemplares disponíveis para empréstimo.
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="text"
                    value={bookSearch}
                    onChange={(e) => setBookSearch(e.target.value)}
                    placeholder="Buscar por título, autor, código CDE ou ISBN..."
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
                          setErrorMsg(null);
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
                        Verifique a grafia ou tente buscar pelo nome do autor.
                      </p>
                    </div>
                    {matchingLoanedBooks.length > 0 && (
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 max-w-md mx-auto space-y-3">
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                          Encontramos &ldquo;{matchingLoanedBooks[0].title}&rdquo; marcado como emprestado. Deseja devolvê-lo?
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
            ) : (
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
                    onClick={() => setSelectedBook(null)}
                    className="btn-secondary text-xs px-3 py-2 whitespace-nowrap shrink-0"
                  >
                    Trocar Livro
                  </button>
                </div>

                <form onSubmit={handleConfirmLoan} className="glass-card p-6 md:p-8 rounded-2xl space-y-5">
                  <div>
                    <h2 className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">
                      2. Informe seus dados
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      Se você já pegou livros antes, digite seu nome para preencher automaticamente.
                    </p>
                  </div>

                  <div className="space-y-1.5 relative">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <UserIcon size={14} />
                      <span>Nome completo *</span>
                    </label>
                    <input
                      required
                      type="text"
                      autoComplete="off"
                      placeholder="Digite seu nome completo"
                      value={borrowerName}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                      onChange={(e) => {
                        setBorrowerName(e.target.value);
                        setShowSuggestions(true);
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    />
                    {borrowerSuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                        {borrowerSuggestions.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setBorrowerName(b.name);
                              setBorrowerPhone(b.phone);
                              setBorrowerEmail(b.email || '');
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center justify-between gap-4"
                          >
                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                              {b.name}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              {b.phone}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Phone size={14} />
                        <span>Telefone / WhatsApp *</span>
                      </label>
                      <input
                        required
                        type="tel"
                        placeholder="(00) 00000-0000"
                        value={borrowerPhone}
                        onChange={(e) => setBorrowerPhone(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-800 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Mail size={14} />
                        <span>E-mail (opcional)</span>
                      </label>
                      <input
                        type="email"
                        placeholder="seu@email.com"
                        value={borrowerEmail}
                        onChange={(e) => setBorrowerEmail(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <Calendar size={14} />
                      <span>Prazo de devolução</span>
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-900 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setLoanDurationDays(15)}
                          className={`px-3.5 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            loanDurationDays === 15
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          15 dias
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoanDurationDays(30)}
                          className={`px-3.5 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            loanDurationDays === 30
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          30 dias
                        </button>
                      </div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                        Devolver até {format(computedDueDate, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                      </span>
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
                      <span>Confirmar Empréstimo</span>
                    )}
                  </button>
                </form>
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
                    Obrigado por devolver o exemplar e cuidar do nosso acervo!
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
                    <span>Leitor: <strong>{confirmingLoan.borrowerName}</strong></span>
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
                  Voltar ao Modo Gestão?
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Isso encerrará a visualização em tela cheia do totem de autoatendimento.
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
