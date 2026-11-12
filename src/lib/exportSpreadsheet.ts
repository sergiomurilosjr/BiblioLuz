import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { Book, Loan } from '../services/libraryService';

function parseFirestoreDate(value: any): Date | null {
  if (!value) return null;
  try {
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatDateBr(value: any): string {
  const date = parseFirestoreDate(value);
  return date ? format(date, 'dd/MM/yyyy') : '';
}

function buildAutoColumnWidths(rows: Record<string, any>[]): XLSX.ColInfo[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map((key) => {
    const maxCellLength = rows.reduce((max, row) => {
      const val = row[key] == null ? '' : String(row[key]);
      return Math.max(max, val.length);
    }, key.length);
    return { wch: Math.min(Math.max(maxCellLength + 3, 12), 48) };
  });
}

export function exportBooksToSpreadsheet(books: Book[]) {
  const rows = books.map((book) => ({
    CDE: book.cdeIndex || '',
    Título: book.title || '',
    Autor: book.author || '',
    Categoria: book.category || '',
    ISBN: book.isbn || '',
    Edição: book.edition || '',
    Ano: book.year || '',
    'Forma de Aquisição': book.acquisitionType || '',
    Fornecedor: book.supplier || '',
    Status: book.status === 'available' ? 'Disponível' : 'Emprestado',
    Descrição: book.description || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = buildAutoColumnWidths(rows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Acervo');

  const dateTag = format(new Date(), 'yyyy-MM-dd');
  XLSX.writeFile(workbook, `acervo-biblioluz-${dateTag}.xlsx`);
}

export function exportLoansToSpreadsheet(loans: Loan[]) {
  const now = new Date();

  const rows = loans.map((loan) => {
    const dueDate = parseFirestoreDate(loan.dueDate);
    const isOverdue = loan.status === 'active' && dueDate !== null && dueDate < now;

    let statusLabel = 'Em curso';
    if (loan.status === 'returned') statusLabel = 'Devolvido';
    else if (loan.status === 'lost') statusLabel = 'Extraviado/Perdido';
    else if (loan.status === 'overdue' || isOverdue) statusLabel = 'Atrasado';

    return {
      Livro: loan.bookTitle || '',
      CDE: loan.cdeIndex || '',
      Destinatário: loan.borrowerName || '',
      Telefone: loan.borrowerPhone || '',
      'E-mail': loan.borrowerEmail || '',
      'Data do Empréstimo': formatDateBr(loan.loanDate),
      'Prazo de Devolução': formatDateBr(loan.dueDate),
      'Data da Devolução': formatDateBr(loan.returnDate),
      Status: statusLabel,
      Responsável: loan.responsible || '',
      Observações: loan.notes || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = buildAutoColumnWidths(rows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Empréstimos');

  const dateTag = format(new Date(), 'yyyy-MM-dd');
  XLSX.writeFile(workbook, `emprestimos-biblioluz-${dateTag}.xlsx`);
}
