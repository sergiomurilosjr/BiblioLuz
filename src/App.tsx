import React, { useState, useEffect, useMemo, memo } from 'react';
import { 
  Book as BookIcon, 
  Search, 
  Plus, 
  LogOut, 
  Library, 
  HandHeart, 
  Clock, 
  CheckCircle2, 
  Filter,
  User as UserIcon,
  Calendar,
  X,
  Loader2,
  Database,
  Trash2,
  Edit,
  History,
  Copy,
  Sun,
  Moon,
  Camera,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './AuthContext';
import { loginWithGoogle, auth } from './lib/firebase';
import { libraryService, Book, Loan } from './services/libraryService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CameraCapture } from './components/CameraCapture';

// --- Theme ---

const ThemeToggle = ({ theme, toggleTheme }: { theme: 'light' | 'dark', toggleTheme: () => void }) => (
  <button 
    onClick={toggleTheme}
    className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all border border-slate-200 dark:border-slate-700"
    title={theme === 'light' ? 'Ativar Modo Escuro' : 'Ativar Modo Claro'}
  >
    {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
  </button>
);

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${
      active 
        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-bold' 
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
    }`}
  >
    <div className="flex items-center gap-3">
      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </div>
    {active && (
      <motion.span layoutId="nav-dot" className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
    )}
  </button>
);

const StatCard = ({ label, value, icon: Icon, colorClass, highlight }: { label: string, value: number, icon: any, colorClass: string, highlight?: boolean }) => (
  <div className={`glass-card p-6 rounded-xl overflow-hidden relative ${highlight ? 'border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/20 dark:bg-indigo-900/10' : ''}`}>
    <div className="flex justify-between items-start mb-6">
      <div className={`p-2.5 rounded-lg ${colorClass} text-white shadow-lg shadow-black/5`}>
        <Icon size={20} />
      </div>
      <span className="text-3xl font-display font-bold tracking-tight text-slate-800 dark:text-slate-100">{value}</span>
    </div>
    <div className="flex flex-col">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2 uppercase tracking-[0.15em]">{label}</p>
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: highlight ? '100%' : '65%' }}
          className={`h-full ${colorClass}`}
        />
      </div>
    </div>
  </div>
);

interface BookCardProps {
  book: Book;
  onLoan: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}

const BookCard = memo(({ book, onLoan, onEdit, onDelete }: BookCardProps) => (
  <motion.div 
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-card flex flex-col h-full rounded-xl group relative hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-500 overflow-hidden"
  >
    <div className="aspect-[3/4.2] bg-slate-100 dark:bg-slate-800 relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
      {book.coverUrl ? (
        <img 
          src={book.coverUrl} 
          alt={book.title} 
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-200 p-6 text-center">
          <BookIcon size={40} strokeWidth={1} className="mb-2" />
          <p className="text-[10px] font-bold uppercase tracking-widest">{book.category || 'Biblioteca'}</p>
        </div>
      )}
      <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider backdrop-blur-md shadow-sm border ${
          book.status === 'available' 
            ? 'bg-emerald-500/80 text-white border-emerald-400' 
            : 'bg-amber-500/80 text-white border-amber-400'
        }`}>
          {book.status === 'available' ? 'Livre' : 'Emprestado'}
        </span>
        {book.cdeIndex && (
          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-indigo-500/80 text-white border border-indigo-400 backdrop-blur-md shadow-sm">
            CDE: {book.cdeIndex}
          </span>
        )}
      </div>
      
      <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3 backdrop-blur-[2px]">
        <button 
          onClick={onEdit}
          className="w-10 h-10 bg-white/20 hover:bg-white text-white hover:text-indigo-600 rounded-full flex items-center justify-center transition-all backdrop-blur-md"
        >
          <Edit size={18} />
        </button>
        <button 
          onClick={onDelete}
          className="w-10 h-10 bg-white/20 hover:bg-red-500 text-white rounded-full flex items-center justify-center transition-all backdrop-blur-md"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
    
    <div className="p-4 flex flex-col flex-1">
      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm line-clamp-1 mb-0.5" title={book.title}>{book.title}</h3>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold mb-4">{book.author}</p>
      
      <div className="mt-auto pt-3 border-t border-slate-50 dark:border-slate-800">
        {book.status === 'available' ? (
          <button 
            onClick={onLoan}
            className="w-full text-indigo-600 dark:text-indigo-400 font-bold text-[10px] uppercase tracking-[0.2em] hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors py-1"
          >
            Realizar Empréstimo
          </button>
        ) : (
          <div className="text-slate-300 dark:text-slate-600 font-bold text-[10px] uppercase tracking-[0.2em] text-center py-1">
            Indisponível
          </div>
        )}
      </div>
    </div>
  </motion.div>
));

// --- Modals ---

const ModalWrapper = ({ children, onClose, title }: { children: React.ReactNode, onClose: () => void, title: string }) => (
  <motion.div 
    initial={{ opacity: 0 }} 
    animate={{ opacity: 1 }} 
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
  >
    <motion.div 
      initial={{ scale: 0.95, opacity: 0, y: 30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.95, opacity: 0, y: 30 }}
      className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800"
    >
      <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <h2 className="text-lg font-display font-bold text-slate-800 dark:text-slate-100">{title}</h2>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
          <X size={20} />
        </button>
      </div>
      <div className="p-8 overflow-y-auto custom-scrollbar">
        {children}
      </div>
    </motion.div>
  </motion.div>
);

const BookModal = ({ book, onClose, onSave }: { book: Book | null, onClose: () => void, onSave: () => void }) => {
  const [formData, setFormData] = useState({
    title: book?.title || '',
    author: book?.author || '',
    isbn: book?.isbn || '',
    category: book?.category || '',
    cdeIndex: book?.cdeIndex || '',
    edition: book?.edition || '',
    year: book?.year || '',
    acquisitionType: book?.acquisitionType || '',
    supplier: book?.supplier || '',
    coverUrl: book?.coverUrl || '',
    description: book?.description || ''
  });
  const [loading, setLoading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const handleAutoFill = async () => {
    if (!formData.isbn || formData.isbn.length < 10) {
      alert('Por favor, informe um ISBN válido (10 ou 13 dígitos) para buscar.');
      return;
    }

    setIsAutoFilling(true);
    try {
      const bookInfo = await libraryService.fetchBookInfo(formData.isbn);
      if (bookInfo) {
        setFormData(prev => ({
          ...prev,
          title: bookInfo.title || prev.title,
          author: bookInfo.author || prev.author,
          description: bookInfo.description || prev.description,
          coverUrl: bookInfo.coverUrl || prev.coverUrl,
          year: bookInfo.year || prev.year,
          category: bookInfo.category || prev.category,
        }));
      } else {
        alert('Nenhum livro encontrado com este ISBN.');
      }
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (book?.id) {
        await libraryService.updateBook(book.id, formData);
      } else {
        await libraryService.addBook({ ...formData, status: 'available' });
      }
      onSave();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title={book?.id ? 'Editar Livro' : 'Novo Livro'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Título</label>
            <input 
              required 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors" 
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Autor</label>
            <input 
              required 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors" 
              value={formData.author}
              onChange={e => setFormData({ ...formData, author: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Índice CDE</label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors" 
              value={formData.cdeIndex}
              onChange={e => setFormData({ ...formData, cdeIndex: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Categoria</label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors" 
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1 flex items-center justify-between">
              <span>ISBN</span>
              <button 
                type="button"
                onClick={handleAutoFill}
                disabled={isAutoFilling || !formData.isbn}
                className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 hover:underline disabled:opacity-30 transition-all"
              >
                {isAutoFilling ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                <span>Auto-preencher</span>
              </button>
            </label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors" 
              value={formData.isbn}
              placeholder="Ex: 978..."
              onChange={e => setFormData({ ...formData, isbn: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Edição</label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors" 
              value={formData.edition}
              onChange={e => setFormData({ ...formData, edition: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Ano</label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors" 
              value={formData.year}
              onChange={e => setFormData({ ...formData, year: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Forma de Aquisição</label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors" 
              value={formData.acquisitionType}
              onChange={e => setFormData({ ...formData, acquisitionType: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Fornecedor</label>
            <input 
              type="text" 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors" 
              value={formData.supplier}
              onChange={e => setFormData({ ...formData, supplier: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1 flex items-center justify-between">
            <span>Imagem da Capa</span>
            <button 
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 hover:underline transition-all"
            >
              <Camera size={10} />
              <span>Tirar Foto</span>
            </button>
          </label>
          <div className="flex gap-2">
            <div className="w-14 h-20 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden shadow-inner flex items-center justify-center text-slate-400 flex-shrink-0 border border-slate-200 dark:border-slate-700">
              {formData.coverUrl ? (
                <img src={formData.coverUrl} alt="Capa" className="w-full h-full object-cover" />
              ) : (
                <RefreshCw size={16} className="opacity-20" />
              )}
            </div>
            <input 
              type="url" 
              placeholder="Cole a URL da capa aqui..."
              className="flex-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm text-slate-800 dark:text-slate-100 transition-colors self-center" 
              value={formData.coverUrl}
              onChange={e => setFormData({ ...formData, coverUrl: e.target.value })}
            />
          </div>
        </div>

        <AnimatePresence>
          {isCameraOpen && (
            <CameraCapture 
              onCapture={(dataUrl) => {
                // In a real app, you'd upload this to Firebase Storage. 
                // For this MVP, we use the base64 URL directly.
                setFormData({ ...formData, coverUrl: dataUrl });
                setIsCameraOpen(false);
              }}
              onClose={() => setIsCameraOpen(false)}
            />
          )}
        </AnimatePresence>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Descrição</label>
          <textarea 
            rows={2}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-medium text-sm resize-none text-slate-800 dark:text-slate-100 transition-colors" 
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <button 
          disabled={loading}
          type="submit" 
          className="w-full bg-slate-900 dark:bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-100 dark:shadow-indigo-950/20 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : (book?.id ? 'Salvar Alterações' : 'Adicionar ao Acervo')}
        </button>
      </form>
    </ModalWrapper>
  );
};

const LoanModal = ({ book, loan, onClose, onSave }: { book?: Book, loan?: Loan | null, onClose: () => void, onSave: () => void }) => {
  const [formData, setFormData] = useState({
    borrowerName: loan?.borrowerName || '',
    borrowerPhone: loan?.borrowerPhone || '',
    borrowerEmail: loan?.borrowerEmail || '',
    responsible: loan?.responsible || '',
    notes: loan?.notes || '',
    status: loan?.status || 'active',
    loanDate: loan?.loanDate?.toDate 
      ? format(loan.loanDate.toDate(), 'yyyy-MM-dd') 
      : loan?.loanDate instanceof Date 
        ? format(loan.loanDate, 'yyyy-MM-dd')
        : typeof loan?.loanDate === 'string' && loan?.loanDate.includes('-')
          ? loan.loanDate
          : format(new Date(), 'yyyy-MM-dd'),
    dueDate: loan?.dueDate?.toDate 
      ? format(loan.dueDate.toDate(), 'yyyy-MM-dd') 
      : loan?.dueDate instanceof Date 
        ? format(loan.dueDate, 'yyyy-MM-dd')
        : typeof loan?.dueDate === 'string' && loan?.dueDate.includes('-')
          ? loan.dueDate
          : format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  });
  const [loading, setLoading] = useState(false);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    libraryService.getBorrowers().then(setBorrowers);
  }, []);

  const suggestions = useMemo(() => {
    if (!formData.borrowerName || !showSuggestions) return [];
    return borrowers.filter(b => 
      (b.name || '').toLowerCase().includes(formData.borrowerName.toLowerCase())
    ).slice(0, 5);
  }, [borrowers, formData.borrowerName, showSuggestions]);

  const selectBorrower = (b: any) => {
    setFormData({
      ...formData,
      borrowerName: b.name,
      borrowerPhone: b.phone,
      borrowerEmail: b.email || ''
    });
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.borrowerName || !formData.borrowerPhone || !formData.loanDate) {
      alert('Por favor, preencha todos os campos obrigatórios (Nome, Telefone e Data do Empréstimo).');
      return;
    }

    setLoading(true);
    try {
      if (loan?.id) {
        await libraryService.updateLoanWithSync(loan.id, loan.bookId, {
          borrowerName: formData.borrowerName,
          borrowerPhone: formData.borrowerPhone,
          borrowerEmail: formData.borrowerEmail,
          responsible: formData.responsible,
          notes: formData.notes,
          status: formData.status as any,
          loanDate: new Date(formData.loanDate),
          dueDate: new Date(formData.dueDate)
        });
      } else if (book) {
        await libraryService.createLoan({
          bookId: book.id!,
          bookTitle: book.title,
          cdeIndex: book.cdeIndex,
          borrowerName: formData.borrowerName,
          borrowerPhone: formData.borrowerPhone,
          borrowerEmail: formData.borrowerEmail,
          responsible: formData.responsible,
          notes: formData.notes,
          loanDate: new Date(formData.loanDate),
          dueDate: new Date(formData.dueDate)
        });
      }
      onSave();
    } catch (error) {
      console.error('Error saving loan:', error);
      alert('Erro ao salvar o empréstimo. Verifique as permissões.');
    } finally {
      setLoading(false);
    }
  };

  const displayBook = loan ? { title: loan.bookTitle, author: 'ID: ' + loan.bookId.slice(-6), coverUrl: null } : book;

  return (
    <ModalWrapper title={loan ? "Editar Empréstimo" : "Novo Empréstimo"} onClose={onClose}>
      <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl mb-6 border border-neutral-100">
        <div className="w-12 h-16 bg-white rounded-lg flex items-center justify-center text-neutral-400 overflow-hidden shadow-sm border border-neutral-200">
          {displayBook?.coverUrl ? <img src={displayBook.coverUrl} alt="" className="w-full h-full object-cover" /> : <BookIcon size={20} />}
        </div>
        <div className="overflow-hidden">
          <h4 className="font-bold text-neutral-900 truncate">{displayBook?.title}</h4>
          <p className="text-xs text-neutral-500 font-medium truncate">{displayBook?.author}</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1 relative">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">Nome do Destinatário <span className="text-indigo-500">*</span></label>
            <input 
              required 
              type="text" 
              placeholder="Nome completo"
              autoComplete="off"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 font-medium text-sm" 
              value={formData.borrowerName}
              onFocus={() => setShowSuggestions(true)}
              onChange={e => setFormData({ ...formData, borrowerName: e.target.value })}
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {suggestions.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => selectBorrower(b)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 flex flex-col"
                  >
                    <span className="font-bold text-sm text-slate-800">{b.name}</span>
                    <span className="text-[10px] text-slate-400">{b.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">Telefone <span className="text-indigo-500">*</span></label>
            <input 
              required 
              type="tel" 
              placeholder="(00) 00000-0000"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 font-medium text-sm" 
              value={formData.borrowerPhone}
              onChange={e => setFormData({ ...formData, borrowerPhone: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">E-mail (opcional)</label>
            <input 
              type="email" 
              placeholder="seu@email.com"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 font-medium text-sm" 
              value={formData.borrowerEmail}
              onChange={e => setFormData({ ...formData, borrowerEmail: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">Responsável (opcional)</label>
            <input 
              type="text" 
              placeholder="Responsável pela entrega"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 font-medium text-sm" 
              value={formData.responsible}
              onChange={e => setFormData({ ...formData, responsible: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">Data de Empréstimo <span className="text-indigo-500">*</span></label>
            <input 
              required 
              type="date" 
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 font-medium text-sm" 
              value={formData.loanDate}
              onChange={e => {
                const newDate = new Date(e.target.value);
                if (!isNaN(newDate.getTime())) {
                  const newDue = new Date(newDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                  setFormData({ ...formData, loanDate: e.target.value, dueDate: format(newDue, 'yyyy-MM-dd') });
                } else {
                  setFormData({ ...formData, loanDate: e.target.value });
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">Data Prevista Devolução</label>
            <input 
              required 
              type="date" 
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 font-medium text-sm" 
              value={formData.dueDate}
              onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
            />
          </div>
        </div>

        {loan && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">Status do Empréstimo</label>
            <select 
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 font-bold text-sm"
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value as any })}
            >
              <option value="active">Em curso</option>
              <option value="returned">Devolvido</option>
              <option value="overdue">Atrasado</option>
              <option value="lost">Extraviado/Perdido</option>
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pl-1">Observações</label>
          <textarea 
            rows={3}
            placeholder="Alguma observação importante sobre este empréstimo..."
            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 font-medium text-sm resize-none" 
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>

        <button 
          disabled={loading}
          type="submit" 
          className="w-full bg-neutral-900 text-white font-bold py-4 rounded-xl hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-neutral-100 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : (loan ? 'Salvar Alterações' : 'Confirmar Empréstimo')}
        </button>
      </form>
    </ModalWrapper>
  );
}

const ImportModal = ({ onClose, onSave }: { onClose: () => void, onSave: () => void }) => {
  const [pastedData, setPastedData] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!pastedData.trim()) return;
    setLoading(true);
    try {
      const rows = pastedData.trim().split('\n');
      const booksToImport = rows.map(row => {
        const columns = row.split('\t'); // Google Sheets copy-paste is tab-separated
        return {
          cdeIndex: (columns[0] || '').trim(),
          author: (columns[1] || '').trim(),
          title: (columns[2] || '').trim(),
          edition: (columns[3] || '').trim(),
          year: (columns[4] || '').trim(),
          acquisitionType: (columns[5] || '').trim(),
          supplier: (columns[6] || '').trim(),
          status: 'available' as const
        };
      }).filter(b => b.title && b.author);

      if (booksToImport.length > 0) {
        await libraryService.bulkAddBooks(booksToImport);
        onSave();
      } else {
        alert('Nenhum dado válido encontrado. Certifique-se de que as colunas de Título e Autor estão preenchidas.');
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Erro ao importar. Verifique o formato dos dados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Importar da Planilha" onClose={onClose}>
      <div className="space-y-6">
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl text-xs text-indigo-800 leading-relaxed">
          <p className="font-bold mb-1">Como importar:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Abra sua planilha no Google Sheets.</li>
            <li>Selecione as colunas exatas: <b>CDE, Autor, Título, Edição, Ano, Aquisição, Fornecedor</b>.</li>
            <li>Copie as linhas (Ctrl+C) e cole no campo abaixo.</li>
          </ol>
        </div>
        
        <textarea 
          rows={10}
          placeholder="Cole aqui os dados da sua planilha (ex: selecione no Sheets e cole)..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-mono text-[10px] resize-none" 
          value={pastedData}
          onChange={e => setPastedData(e.target.value)}
        />

        <div className="flex flex-col gap-3">
          <button 
            onClick={handleImport}
            disabled={loading || !pastedData.trim()}
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (
              <>
                <Database size={18} />
                <span>Processar {pastedData.trim() ? pastedData.trim().split('\n').length : 0} Linhas</span>
              </>
            )}
          </button>
          <p className="text-[10px] text-center text-slate-400">Certifique-se de que cada linha representa um livro único.</p>
        </div>
      </div>
    </ModalWrapper>
  );
};

const ImportLoansModal = ({ onClose, onSave }: { onClose: () => void, onSave: () => void }) => {
  const [pastedData, setPastedData] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!pastedData.trim()) return;
    setLoading(true);
    try {
      // 1. Get all books to match by title
      const books = await libraryService.getBooks();
      const bookMap = new Map(books.map(b => [b.title.toLowerCase().trim(), b]));

      const rows = pastedData.trim().split('\n');
      const loansToImport = rows.map(row => {
        const columns = row.split('\t');
        const bookTitle = (columns[0] || '').trim();
        const matchingBook = bookMap.get(bookTitle.toLowerCase());
        
        if (!matchingBook && bookTitle) {
          console.warn(`Livro não encontrado no acervo: ${bookTitle}`);
        }

        // Map Status
        const rawStatus = (columns[7] || '').trim().toLowerCase();
        let status: 'active' | 'returned' | 'overdue' | 'lost' = 'active';
        if (rawStatus.includes('devolvido')) status = 'returned';
        if (rawStatus.includes('atrasado')) status = 'overdue';
        if (rawStatus.includes('extraviado')) status = 'lost';

        // Parse Dates (Basic dd/mm/yyyy parser)
        const parseDate = (dateStr: string, defaultDaysOffset = 0) => {
          if (!dateStr) {
            const d = new Date();
            if (defaultDaysOffset) d.setDate(d.getDate() + defaultDaysOffset);
            return d;
          }
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            if (!isNaN(d.getTime())) return d;
          }
          const d = new Date();
          if (defaultDaysOffset) d.setDate(d.getDate() + defaultDaysOffset);
          return d;
        };

        const loanDate = parseDate(columns[5] || '');
        const dueDate = parseDate(columns[6] || '', 30);
        const returnDate = status === 'returned' ? dueDate : null;

        return {
          bookId: matchingBook?.id || 'manual-import', // Fallback if book not found
          bookTitle: (bookTitle || matchingBook?.title || 'Livro Desconhecido').slice(0, 1000),
          cdeIndex: (columns[1] || matchingBook?.cdeIndex || '').trim().slice(0, 100),
          borrowerName: (columns[2] || 'Importado').trim().slice(0, 500),
          borrowerPhone: (columns[3] || 'Não Informado').trim().slice(0, 200),
          borrowerEmail: (columns[4] || '').trim().slice(0, 200),
          loanDate: loanDate,
          dueDate: dueDate,
          returnDate: returnDate,
          status: status,
          responsible: (columns[8] || '').trim().slice(0, 200),
          notes: (columns[9] || '').trim().slice(0, 10000)
        };
      }).filter(l => l.borrowerName);

      if (loansToImport.length > 0) {
        await libraryService.bulkAddLoans(loansToImport);
        onSave();
      } else {
        alert('Nenhum dado válido encontrado.');
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Erro ao importar. Verifique o formato dos dados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Importar Empréstimos" onClose={onClose}>
      <div className="space-y-6">
        <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-4 rounded-xl text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
          <p className="font-bold mb-1">Como importar empréstimos:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Selecione as colunas: <b>Título, CDE, Nome, Telefone, E-mail, Data Emp., Data Dev., Status, Responsável, Obs.</b></li>
            <li>Certifique-se de que o título do livro seja EXATAMENTE igual ao cadastrado no acervo.</li>
            <li>Copie e cole os dados abaixo.</li>
          </ol>
        </div>
        
        <textarea 
          rows={10}
          placeholder="Cole aqui os dados da sua planilha de empréstimos..."
          className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 font-mono text-[10px] resize-none text-slate-800 dark:text-slate-100 transition-colors" 
          value={pastedData}
          onChange={e => setPastedData(e.target.value)}
        />

        <div className="flex flex-col gap-3">
          <button 
            onClick={handleImport}
            disabled={loading || !pastedData.trim()}
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (
              <>
                <Database size={18} />
                <span>Importar {pastedData.trim() ? pastedData.trim().split('\n').length : 0} Registros</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};

// --- Views ---

const LibraryView = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    setLoading(true);
    try {
      const data = await libraryService.getBooks();
      setBooks(data);
    } finally {
      setLoading(false);
    }
  };

  const filteredBooks = useMemo(() => {
    const s = search.toLowerCase();
    return books.filter(b => 
      (b.title || '').toLowerCase().includes(s) || 
      (b.author || '').toLowerCase().includes(s) ||
      (b.isbn || '').includes(search) ||
      (b.cdeIndex || '').toLowerCase().includes(s)
    );
  }, [books, search]);

  const stats = useMemo(() => ({
    total: books.length,
    available: books.filter(b => b.status === 'available').length,
    loaned: books.filter(b => b.status === 'loaned').length
  }), [books]);

  if (loading && books.length === 0) return (
    <div className="h-[60vh] flex items-center justify-center">
      <Loader2 className="animate-spin text-slate-200" size={40} />
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight mb-2 text-slate-800 dark:text-slate-100">Acervo Geral</h1>
          <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">Controle total sobre seu estoque de títulos.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 px-5 py-3.5 rounded-xl font-bold text-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
          >
            <Database size={18} className="text-indigo-600 dark:text-indigo-400" />
            <span>Importar Planilha</span>
          </button>
          <button 
            onClick={() => { setSelectedBook(null); setIsModalOpen(true); }}
            className="btn-primary"
          >
            <Plus size={18} strokeWidth={3} />
            <span>Novo Exemplar</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" size={16} />
          <input 
            type="text" 
            placeholder="Buscar por título, autor ou ISBN..." 
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm text-slate-600 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs px-4 py-3">
            <Filter size={14} />
            Filtros
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" style={{ contentVisibility: 'auto' }}>
        <StatCard label="Total de Livros" value={stats.total} icon={Library} colorClass="bg-indigo-600" highlight />
        <StatCard label="Disponíveis agora" value={stats.available} icon={CheckCircle2} colorClass="bg-emerald-500" />
        <StatCard label="Em circulação" value={stats.loaned} icon={HandHeart} colorClass="bg-amber-500" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" style={{ contentVisibility: 'auto' }}>
        <AnimatePresence>
          {filteredBooks.map(book => (
            <BookCard 
              key={book.id} 
              book={book} 
              onLoan={() => { setSelectedBook(book); setIsLoanModalOpen(true); }}
              onEdit={() => { setSelectedBook(book); setIsModalOpen(true); }}
              onDelete={async () => { if(confirm('Remover exemplar do sistema?')) { await libraryService.deleteBook(book.id!); loadBooks(); } }}
            />
          ))}
        </AnimatePresence>
        
        {filteredBooks.length === 0 && !loading && (
          <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-200">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <Search size={32} strokeWidth={1.5} className="text-slate-300" />
            </div>
            <p className="font-bold text-slate-400 text-lg tracking-tight">Nenhum resultado encontrado</p>
            <p className="text-sm font-medium mt-1 text-slate-300">Refine sua busca ou adicione um novo exemplar.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <BookModal 
            book={selectedBook} 
            onClose={() => setIsModalOpen(false)} 
            onSave={() => { setIsModalOpen(false); loadBooks(); }} 
          />
        )}
        {isImportModalOpen && (
          <ImportModal 
            onClose={() => setIsImportModalOpen(false)} 
            onSave={() => { setIsImportModalOpen(false); loadBooks(); }} 
          />
        )}
        {isLoanModalOpen && selectedBook && (
          <LoanModal 
            book={selectedBook} 
            onClose={() => setIsLoanModalOpen(false)} 
            onSave={() => { setIsLoanModalOpen(false); loadBooks(); }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const LoansView = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadLoans();
  }, []);

  const loadLoans = async () => {
    setLoading(true);
    try {
      const data = await libraryService.getLoans();
      setLoans(data);
    } finally {
      setLoading(false);
    }
  };

  const sortedAndFilteredLoans = useMemo(() => {
    // 1. Filter
    let result = loans;
    if (!showHistory) {
      result = result.filter(l => l.status !== 'returned');
    }

    if (search) {
      result = result.filter(l => 
        (l.bookTitle || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.borrowerName || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.borrowerPhone || '').includes(search)
      );
    }

    // 2. Sort by urgency (due date ascending)
    return result.sort((a, b) => {
      const getVal = (date: any) => {
        try {
          if (date?.toDate) return date.toDate().getTime();
          if (date instanceof Date) return date.getTime();
          return new Date(date).getTime();
        } catch (e) {
          return Infinity;
        }
      };
      
      const valA = getVal(a.dueDate);
      const valB = getVal(b.dueDate);
      
      return valA - valB;
    });
  }, [loans, showHistory, search]);

  const handleReturn = async (loan: Loan) => {
    if (confirm(`Confirmar devolução de "${loan.bookTitle}"?`)) {
      try {
        await libraryService.returnBook(loan.id!, loan.bookId);
        alert('Livro devolvido com sucesso! O exemplar agora consta como disponível no acervo.');
        loadLoans();
      } catch (error: any) {
        console.error('Erro na devolução:', error);
        let message = 'Ocorreu um erro ao processar a devolução.';
        try {
          const errData = JSON.parse(error.message);
          if (errData.error.includes('permissions')) {
            message = 'Você não tem permissão para alterar este registro.';
          }
        } catch (e) {
          // not json
        }
        alert(message);
      }
    }
  };

  const overdueCount = useMemo(() => {
    return loans.filter(l => {
      if (l.status !== 'active') return false;
      try {
        const dueDate = l.dueDate?.toDate ? l.dueDate.toDate() : new Date(l.dueDate);
        if (isNaN(dueDate.getTime())) return false;
        return dueDate < new Date();
      } catch (e) {
        return false;
      }
    }).length;
  }, [loans]);

  if (loading && loans.length === 0) return (
    <div className="h-[60vh] flex items-center justify-center">
      <Loader2 className="animate-spin text-slate-200" size={40} />
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" size={16} />
          <input 
            type="text" 
            placeholder="Buscar por livro ou destinatário..." 
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm text-slate-600 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={`btn-secondary text-xs px-4 py-3 border ${showHistory ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400' : ''}`}
          >
            <History size={14} className={showHistory ? 'text-indigo-600 dark:text-indigo-400' : ''} />
            {showHistory ? 'Ocultar Histórico' : 'Ver Histórico'}
          </button>
        </div>
      </div>

      {overdueCount > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 p-4 rounded-xl flex items-center gap-4 text-rose-800 dark:text-rose-200 shadow-sm"
        >
          <div className="p-2 bg-rose-500 rounded-lg text-white">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-sm font-bold">Atenção: {overdueCount} {overdueCount === 1 ? 'empréstimo está' : 'empréstimos estão'} com a devolução atrasada!</p>
            <p className="text-xs font-medium opacity-80">Verifique a lista abaixo para gerenciar as pendências.</p>
          </div>
        </motion.div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight mb-2 text-slate-800 dark:text-slate-100">Histórico de Empréstimos</h1>
          <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">Veja quem está com seus livros e gerencie devoluções.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Ativos" value={loans.filter(l => l.status === 'active').length} icon={HandHeart} colorClass="bg-amber-500" />
        <StatCard label="Devolvidos" value={loans.filter(l => l.status === 'returned').length} icon={CheckCircle2} colorClass="bg-emerald-500" />
        <StatCard label="Atrasados" value={overdueCount} icon={Clock} colorClass="bg-rose-500" highlight={overdueCount > 0} />
        <StatCard label="Total Movimentações" value={loans.length} icon={History} colorClass="bg-slate-600" />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors duration-300">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Livro</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Pessoa</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Prazo Dev.</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Status</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {sortedAndFilteredLoans.map(loan => {
                let isOverdue = false;
                try {
                  if (loan.status === 'active') {
                    const dueDate = loan.dueDate?.toDate ? loan.dueDate.toDate() : new Date(loan.dueDate);
                    if (!isNaN(dueDate.getTime())) {
                      isOverdue = dueDate < new Date();
                    }
                  }
                } catch (e) {
                  isOverdue = false;
                }

                return (
                  <tr key={loan.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group ${isOverdue ? 'bg-rose-50/10 dark:bg-rose-950/10' : ''}`}>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-14 rounded-md flex items-center justify-center text-slate-300 dark:text-slate-700 shadow-sm overflow-hidden flex-shrink-0 border ${isOverdue ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/30' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-800'}`}>
                          {loan.cdeIndex ? (
                            <div className={`w-full h-full flex items-center justify-center text-[10px] font-bold ${isOverdue ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-500 dark:text-rose-400' : 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-400 dark:text-indigo-300'}`}>
                              {loan.cdeIndex}
                            </div>
                          ) : (
                            <BookIcon size={18} strokeWidth={1.5} className={isOverdue ? 'text-rose-300 dark:text-rose-700' : ''} />
                          )}
                        </div>
                        <div>
                          <p className={`font-bold text-sm line-clamp-1 ${isOverdue ? 'text-rose-900 dark:text-rose-100' : 'text-slate-800 dark:text-slate-100'}`}>{loan.bookTitle}</p>
                          <p className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest mt-0.5 whitespace-nowrap">ID: {loan.bookId.slice(-6)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{loan.borrowerName}</p>
                        {loan.borrowerPhone && (
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(loan.borrowerPhone);
                              setCopiedId(loan.id!);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold mt-0.5 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1 group/phone"
                            title="Clique para copiar"
                          >
                            <span>{copiedId === loan.id ? 'Copiado!' : loan.borrowerPhone}</span>
                            <Copy size={10} className="text-indigo-400 dark:text-indigo-500 opacity-60 group-hover/phone:opacity-100" />
                          </button>
                        )}
                        {loan.responsible && <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight italic">Resp: {loan.responsible}</p>}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className={`flex items-center gap-2 ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        <Clock size={14} className={isOverdue ? 'text-rose-400 animate-pulse' : 'text-slate-300 dark:text-slate-600'} />
                        <span className="text-sm font-bold">
                          {(() => {
                            try {
                              if (loan.dueDate?.toDate) return format(loan.dueDate.toDate(), "dd 'de' MMM", { locale: ptBR });
                              if (loan.dueDate instanceof Date && !isNaN(loan.dueDate.getTime())) return format(loan.dueDate, "dd 'de' MMM", { locale: ptBR });
                              if (typeof loan.dueDate === 'string' || typeof loan.dueDate === 'number') {
                                const d = new Date(loan.dueDate);
                                if (!isNaN(d.getTime())) return format(d, "dd 'de' MMM", { locale: ptBR });
                              }
                              return 'Pendente';
                            } catch (e) {
                              return 'Erro Data';
                            }
                          })()}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        loan.status === 'returned' 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                          : isOverdue
                            ? 'bg-rose-100 text-rose-700 border border-rose-200 shadow-sm animate-pulse'
                            : 'bg-amber-50 text-amber-600 border border-amber-100'
                      }`}>
                        {loan.status === 'returned' ? 'Devolvido' : 
                         isOverdue ? 'Atrasado' : 'Em curso'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        {loan.status === 'active' && (
                          <button 
                            onClick={() => handleReturn(loan)}
                            className={`font-bold text-xs hover:underline decoration-2 underline-offset-4 ${isOverdue ? 'text-rose-600 hover:text-rose-700' : 'text-indigo-600 hover:text-indigo-700'}`}
                          >
                            Devolver
                          </button>
                        )}
                        <button 
                          onClick={() => { setSelectedLoan(loan); setIsEditModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Editar Registro"
                        >
                          <Edit size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {loans.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-32 text-center text-slate-200">
                    <History size={48} strokeWidth={1} className="mx-auto mb-4 opacity-50" />
                    <p className="font-bold text-slate-400 text-lg">Histórico vazio</p>
                    <p className="text-sm font-medium text-slate-300 mt-1">Registros de empréstimos aparecerão aqui.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <AnimatePresence>
        {isImportModalOpen && (
          <ImportLoansModal 
            onClose={() => setIsImportModalOpen(false)} 
            onSave={() => { setIsImportModalOpen(false); loadLoans(); }} 
          />
        )}
        {isEditModalOpen && selectedLoan && (
          <LoanModal 
            loan={selectedLoan}
            onClose={() => setIsEditModalOpen(false)} 
            onSave={() => { setIsEditModalOpen(false); loadLoans(); }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- App Structure ---

const Login = ({ theme, toggleTheme }: { theme: 'light' | 'dark', toggleTheme: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = () => {
    setError(null);
    // Safari fix: Trigger popup in the absolute same tick as user click.
    // We avoid moving login behind any async boundaries or state-induced microtasks.
    loginWithGoogle()
      .then(() => {
        // Success handled by AuthContext
      })
      .catch((err: any) => {
        setLoading(false);
        if (err.code === 'auth/popup-blocked') {
          setError("O pop-up de login foi bloqueado. Por favor, habilite pop-ups nas configurações do Safari para este site.");
        } else {
          setError("Falha ao tentar entrar. Por favor, tente novamente.");
        }
      });
    
    setLoading(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[80%] h-[80%] bg-indigo-100/30 dark:bg-indigo-900/10 blur-[150px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[80%] h-[80%] bg-slate-200/40 dark:bg-slate-900/20 blur-[150px] rounded-full" />

      <div className="absolute top-8 right-8 z-20">
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "circOut" }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[40px] p-16 text-center shadow-2xl shadow-indigo-900/5 transition-colors duration-300">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-xl shadow-indigo-200 dark:shadow-indigo-900/40 rotate-3 hover:rotate-0 transition-all duration-500">
            <BookIcon size={36} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-4">BiblioLuz <span className="text-indigo-600 dark:text-indigo-400">Gestão</span></h1>
          <p className="text-slate-400 dark:text-slate-500 font-medium mb-12 px-6 leading-relaxed">
            Gestão moderna e inteligente para o acervo da biblioteca do Centro Espírita Pedra de Luz.
          </p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl text-xs text-red-600 dark:text-red-400 font-bold animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}
          
          <button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full h-16 flex items-center justify-center gap-4 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl font-bold hover:bg-slate-800 dark:hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 group shadow-xl shadow-slate-200 dark:shadow-indigo-950/20"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <>
                <div className="bg-white p-2 rounded-lg group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94L5.84 14.1z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </div>
                <span>Entrar com Google</span>
              </>
            )}
          </button>
          
          <div className="mt-12 pt-8 border-t border-slate-50 dark:border-slate-800">
            <p className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-[0.3em]">Ambiente Seguro & Criptografado</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const Dashboard = ({ theme, toggleTheme }: { theme: 'light' | 'dark', toggleTheme: () => void }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'inventory' | 'loans'>('inventory');

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 justify-between shrink-0 transition-colors duration-300">
        <div className="space-y-12">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20">
                <BookIcon size={18} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-display font-bold tracking-tight text-slate-800 dark:text-slate-100 leading-none">BiblioLuz</span>
                <span className="text-[8px] font-bold text-indigo-500/60 dark:text-indigo-400/50 uppercase tracking-widest mt-0.5">v2.2.0</span>
              </div>
            </div>
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>

          <nav className="space-y-2">
            <div className="px-3 mb-4">
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Principal</h3>
            </div>
            <SidebarItem 
              icon={Library} 
              label="Gestão de Acervo" 
              active={activeTab === 'inventory'} 
              onClick={() => setActiveTab('inventory')} 
            />
            <SidebarItem 
              icon={HandHeart} 
              label="Empréstimos" 
              active={activeTab === 'loans'} 
              onClick={() => setActiveTab('loans')} 
            />
          </nav>
        </div>

        <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl mb-6 border border-slate-100 dark:border-slate-800">
            {user?.photoURL ? (
              <img src={user.photoURL} className="w-10 h-10 rounded-xl border-2 border-white dark:border-slate-700 pro-shadow" alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center pro-shadow">
                <UserIcon size={16} className="text-slate-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{user?.displayName}</p>
              <p className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.1em] mt-0.5">Administrador</p>
            </div>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-red-500 transition-all font-bold text-sm"
          >
            <LogOut size={16} />
            <span>Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 p-5 sticky top-0 z-40 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <BookIcon size={16} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold tracking-tight text-slate-800 dark:text-slate-100 leading-none">BiblioLuz</span>
              <span className="text-[7px] font-bold text-indigo-500/60 dark:text-indigo-400/50 uppercase tracking-widest">v2.2.0</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
             <button 
               onClick={() => setActiveTab('inventory')} 
               className={`p-2.5 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
             >
               <Library size={18} />
             </button>
             <button 
               onClick={() => setActiveTab('loans')} 
               className={`p-2.5 rounded-xl transition-all ${activeTab === 'loans' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
             >
               <HandHeart size={18} />
             </button>
             <button onClick={() => auth.signOut()} className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 border border-red-100 dark:border-red-900/30">
               <LogOut size={18} />
             </button>
          </div>
        </header>

        <div className="max-w-[1400px] mx-auto w-full px-6 md:px-12 py-10 md:py-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'inventory' ? <LibraryView /> : <LoansView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      if (typeof window !== 'undefined') {
        return (localStorage.getItem('biblio-theme') as 'light' | 'dark') || 'light';
      }
    } catch (e) {
      console.error('LocalStorage not available');
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    try {
      localStorage.setItem('biblio-theme', theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  if (loading) return (
    <div className={theme}>
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <div className="relative">
          <Loader2 className="animate-spin text-slate-200 dark:text-slate-800" size={64} strokeWidth={1} />
          <BookIcon className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600 dark:text-indigo-500" size={24} />
        </div>
      </div>
    </div>
  );

  return (
    <div className={`${theme} min-h-screen`}>
      <AnimatePresence mode="wait">
        {user ? (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Dashboard theme={theme} toggleTheme={toggleTheme} />
          </motion.div>
        ) : (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Login theme={theme} toggleTheme={toggleTheme} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
