import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loan } from '../services/libraryService';

export const ADMIN_WHATSAPP_DISPLAY = '+55 48 99647-8449';
export const ADMIN_WHATSAPP_DIGITS = '5548996478449';
export const AUTO_MESSAGE_NOTICE =
  'Esta é uma mensagem automática gerada pelo sistema de empréstimos de livros do Centro Espírita Pedra de Luz.';

export type LoanUrgencyCategory = 'overdue' | 'due_soon' | 'ok' | 'closed';

export interface LoanUrgencyInfo {
  category: LoanUrgencyCategory;
  daysDiff: number;
  dueDate: Date | null;
}

export interface ReminderTemplates {
  overdue: string;
  dueSoon: string;
}

export const DEFAULT_REMINDER_TEMPLATES: ReminderTemplates = {
  overdue:
    'Olá, {nome}! Tudo bem? Passando para lembrar com carinho sobre o livro "{livro}", cujo prazo de devolução foi em {prazo} ({detalhe}). Quando puder, aguardamos a devolução para que outros leitores também possam aproveitá-lo.\n\nEsta é uma mensagem automática gerada pelo sistema de empréstimos de livros do Centro Espírita Pedra de Luz.',
  dueSoon:
    'Olá, {nome}! Tudo bem? Este é um lembrete amigável de que o prazo de devolução do livro "{livro}" vence {detalhe} ({prazo}).\n\nEsta é uma mensagem automática gerada pelo sistema de empréstimos de livros do Centro Espírita Pedra de Luz.',
};

const TEMPLATES_STORAGE_KEY = 'biblioluz-whatsapp-templates-v2';
const DUE_SOON_DAYS_STORAGE_KEY = 'biblioluz-due-soon-days-v1';
const PUBLIC_ORIGIN_STORAGE_KEY = 'biblioluz-public-origin-v1';

export function loadReminderTemplates(): ReminderTemplates {
  try {
    if (typeof window === 'undefined') return DEFAULT_REMINDER_TEMPLATES;
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return DEFAULT_REMINDER_TEMPLATES;
    const parsed = JSON.parse(raw);
    return {
      overdue:
        typeof parsed?.overdue === 'string' && parsed.overdue.trim()
          ? parsed.overdue
          : DEFAULT_REMINDER_TEMPLATES.overdue,
      dueSoon:
        typeof parsed?.dueSoon === 'string' && parsed.dueSoon.trim()
          ? parsed.dueSoon
          : DEFAULT_REMINDER_TEMPLATES.dueSoon,
    };
  } catch {
    return DEFAULT_REMINDER_TEMPLATES;
  }
}

export function saveReminderTemplates(templates: ReminderTemplates) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    }
  } catch {
    // ignore storage quota errors
  }
}

export function loadDueSoonDays(): number {
  try {
    if (typeof window === 'undefined') return 3;
    const raw = localStorage.getItem(DUE_SOON_DAYS_STORAGE_KEY);
    const num = raw ? parseInt(raw, 10) : 3;
    return Number.isFinite(num) && num >= 1 && num <= 14 ? num : 3;
  } catch {
    return 3;
  }
}

export function saveDueSoonDays(days: number) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DUE_SOON_DAYS_STORAGE_KEY, String(days));
    }
  } catch {
    // ignore
  }
}

export function getDefaultPublicOrigin(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin.includes('://ais-dev-')) {
    return origin.replace('://ais-dev-', '://ais-pre-');
  }
  return origin;
}

export function loadPublicOrigin(): string {
  try {
    if (typeof window === 'undefined') return '';
    const saved = localStorage.getItem(PUBLIC_ORIGIN_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
    return getDefaultPublicOrigin();
  } catch {
    return getDefaultPublicOrigin();
  }
}

export function savePublicOrigin(origin: string) {
  try {
    if (typeof window === 'undefined') return;
    const clean = origin.trim().replace(/\/+$/, '');
    if (!clean) {
      localStorage.removeItem(PUBLIC_ORIGIN_STORAGE_KEY);
    } else {
      localStorage.setItem(PUBLIC_ORIGIN_STORAGE_KEY, clean);
    }
  } catch {
    // ignore
  }
}

export function parseLoanDate(value: any): Date | null {
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

export function classifyLoanUrgency(loan: Loan, dueSoonDays = 3): LoanUrgencyInfo {
  if (loan.status === 'returned' || loan.status === 'lost') {
    return { category: 'closed', daysDiff: 0, dueDate: parseLoanDate(loan.dueDate) };
  }

  const dueDate = parseLoanDate(loan.dueDate);
  if (!dueDate) {
    return {
      category: loan.status === 'overdue' ? 'overdue' : 'ok',
      daysDiff: 0,
      dueDate: null,
    };
  }

  const daysDiff = differenceInCalendarDays(dueDate, new Date());

  if (loan.status === 'overdue' || daysDiff < 0) {
    return { category: 'overdue', daysDiff, dueDate };
  }

  if (daysDiff <= dueSoonDays) {
    return { category: 'due_soon', daysDiff, dueDate };
  }

  return { category: 'ok', daysDiff, dueDate };
}

/**
 * Normalizes a Brazilian or international phone string to digits suitable for wa.me & Meta Cloud API.
 * Returns null if the phone does not contain enough digits to be valid.
 */
export function normalizeWhatsAppPhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 8 || digits.length > 15) return null;

  // Brazilian numbers with DDD (10 or 11 digits) -> prepend country code 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

export function buildLoanActionUrls(loanId?: string, originOverride?: string) {
  const origin = originOverride || loadPublicOrigin();
  const encodedId = loanId ? encodeURIComponent(loanId) : '';
  const base = origin ? `${origin}/autoatendimento/` : '/autoatendimento/';

  return {
    moreTimeUrl: encodedId ? `${base}?acao=estender&loanId=${encodedId}` : base,
    alreadyReturnedUrl: encodedId ? `${base}?acao=ja-devolvi&loanId=${encodedId}` : base,
  };
}

export function buildReminderMessage(
  loan: Loan,
  urgency: LoanUrgencyInfo,
  templates: ReminderTemplates,
  originOverride?: string
): string {
  const firstName = (loan.borrowerName || 'leitor(a)').trim().split(/\s+/)[0];
  const bookTitle = loan.bookTitle || 'seu livro';
  const formattedDue = urgency.dueDate
    ? format(urgency.dueDate, "dd 'de' MMMM", { locale: ptBR })
    : 'prazo combinado';

  let detail = '';
  if (urgency.category === 'overdue') {
    const overdueDays = Math.abs(urgency.daysDiff);
    detail =
      overdueDays <= 0
        ? 'com devolução em atraso'
        : overdueDays === 1
          ? '1 dia em atraso'
          : `${overdueDays} dias em atraso`;
  } else {
    if (urgency.daysDiff <= 0) {
      detail = 'hoje';
    } else if (urgency.daysDiff === 1) {
      detail = 'amanhã';
    } else {
      detail = `em ${urgency.daysDiff} dias`;
    }
  }

  const template =
    urgency.category === 'overdue' ? templates.overdue : templates.dueSoon;

  let body = template
    .replace(/\{nome\}/gi, firstName)
    .replace(/\{nome_completo\}/gi, loan.borrowerName || firstName)
    .replace(/\{livro\}/gi, bookTitle)
    .replace(/\{prazo\}/gi, formattedDue)
    .replace(/\{detalhe\}/gi, detail)
    .trim();

  if (!body.toLowerCase().includes('mensagem automática')) {
    body = `${body}\n\n${AUTO_MESSAGE_NOTICE}`;
  }

  if (loan.id) {
    const { moreTimeUrl, alreadyReturnedUrl } = buildLoanActionUrls(loan.id, originOverride);
    const optionsBlock = [
      'Escolha uma opção:',
      `1) Preciso de mais tempo (+15 dias): ${moreTimeUrl}`,
      `2) Já devolvi (avisar administrador): ${alreadyReturnedUrl}`,
    ].join('\n');

    return `${body}\n\n${optionsBlock}`;
  }

  return body;
}

export function buildAdminReturnClaimMessage(loan: {
  id?: string;
  bookTitle: string;
  borrowerName: string;
  borrowerPhone?: string;
}): string {
  const idSuffix = loan.id ? ` (Ref: ${loan.id.slice(-6)})` : '';
  const phoneText = loan.borrowerPhone ? ` · Tel: ${loan.borrowerPhone}` : '';
  return `${AUTO_MESSAGE_NOTICE}\n\nOlá, Administrador! O(A) leitor(a) *${loan.borrowerName}*${phoneText} selecionou a opção "Já devolvi" para o livro "${loan.bookTitle}"${idSuffix}. Por favor, verifique a devolução no acervo do BiblioLuz.`;
}

export function buildVerificationWhatsAppMessage(name: string, code: string): string {
  return `${AUTO_MESSAGE_NOTICE}\n\nOlá, ${name.trim()}! Seu código de confirmação para cadastro no autoatendimento da biblioteca BiblioLuz é: *${code}*.`;
}

export function buildWhatsAppUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

export function wasRemindedToday(loan: Loan): boolean {
  const remindedAt = parseLoanDate(loan.lastReminderAt);
  if (!remindedAt) return false;
  return differenceInCalendarDays(new Date(), remindedAt) === 0;
}
