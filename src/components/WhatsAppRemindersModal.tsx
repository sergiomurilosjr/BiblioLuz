import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  MessageCircle,
  Clock,
  CheckCircle2,
  Copy,
  Check,
  SkipForward,
  SlidersHorizontal,
  AlertTriangle,
  RotateCcw,
  Send,
  Loader2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loan } from '../services/libraryService';
import {
  ReminderTemplates,
  DEFAULT_REMINDER_TEMPLATES,
  classifyLoanUrgency,
  normalizeWhatsAppPhone,
  buildReminderMessage,
  buildWhatsAppUrl,
  wasRemindedToday,
  parseLoanDate,
  ADMIN_WHATSAPP_DISPLAY,
  loadPublicOrigin,
  savePublicOrigin,
  getDefaultPublicOrigin,
} from '../lib/whatsappReminder';

interface WhatsAppRemindersModalProps {
  loans: Loan[];
  dueSoonDays: number;
  onChangeDueSoonDays: (days: number) => void;
  templates: ReminderTemplates;
  onSaveTemplates: (templates: ReminderTemplates) => void;
  onMarkSent: (loan: Loan) => Promise<void>;
  onClose: () => void;
}

type FilterScope = 'all' | 'overdue' | 'due_soon' | 'scheduled';

export const WhatsAppRemindersModal = ({
  loans,
  dueSoonDays,
  onChangeDueSoonDays,
  templates,
  onSaveTemplates,
  onMarkSent,
  onClose,
}: WhatsAppRemindersModalProps) => {
  const [scope, setScope] = useState<FilterScope>('all');
  const [hideRemindedToday, setHideRemindedToday] = useState(true);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [sentSessionIds, setSentSessionIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [draftTemplates, setDraftTemplates] = useState<ReminderTemplates>(templates);
  const [templatesSavedNotice, setTemplatesSavedNotice] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [adminPhoneLabel, setAdminPhoneLabel] = useState(ADMIN_WHATSAPP_DISPLAY);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [apiFeedback, setApiFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [publicOrigin, setPublicOrigin] = useState<string>(() => loadPublicOrigin());
  const [draftPublicOrigin, setDraftPublicOrigin] = useState<string>(() => loadPublicOrigin());

  useEffect(() => {
    fetch('/api/whatsapp/status')
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) {
          setApiConfigured(Boolean(data.configured));
          if (data.adminPhone) setAdminPhoneLabel(data.adminPhone);
        }
      })
      .catch(() => {
        setApiConfigured(false);
      });
  }, []);

  const classifiedLoans = useMemo(() => {
    return loans
      .map((loan) => {
        const urgency = classifyLoanUrgency(loan, dueSoonDays);
        const phoneDigits = normalizeWhatsAppPhone(loan.borrowerPhone);
        const remindedToday = wasRemindedToday(loan) || (loan.id ? sentSessionIds.includes(loan.id) : false);
        const scheduledDate = parseLoanDate(loan.reminderScheduledFor);
        return {
          loan,
          urgency,
          phoneDigits,
          remindedToday,
          scheduledDate,
        };
      })
      .filter((item) => item.urgency.category === 'overdue' || item.urgency.category === 'due_soon')
      .sort((a, b) => a.urgency.daysDiff - b.urgency.daysDiff);
  }, [loans, dueSoonDays, sentSessionIds]);

  const scheduledLoans = useMemo(() => {
    return loans
      .filter(
        (l) =>
          l.status !== 'returned' &&
          l.status !== 'lost' &&
          l.reminderStatus === 'scheduled' &&
          parseLoanDate(l.reminderScheduledFor) !== null
      )
      .map((loan) => ({
        loan,
        urgency: classifyLoanUrgency(loan, dueSoonDays),
        phoneDigits: normalizeWhatsAppPhone(loan.borrowerPhone),
        remindedToday: wasRemindedToday(loan) || (loan.id ? sentSessionIds.includes(loan.id) : false),
        scheduledDate: parseLoanDate(loan.reminderScheduledFor)!,
      }))
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }, [loans, dueSoonDays, sentSessionIds]);

  const overdueTotal = useMemo(
    () => classifiedLoans.filter((i) => i.urgency.category === 'overdue').length,
    [classifiedLoans]
  );

  const dueSoonTotal = useMemo(
    () => classifiedLoans.filter((i) => i.urgency.category === 'due_soon').length,
    [classifiedLoans]
  );

  const filteredItems = useMemo(() => {
    if (scope === 'scheduled') {
      return scheduledLoans;
    }
    return classifiedLoans.filter((item) => {
      if (scope === 'overdue' && item.urgency.category !== 'overdue') return false;
      if (scope === 'due_soon' && item.urgency.category !== 'due_soon') return false;
      if (hideRemindedToday && item.remindedToday) return false;
      return true;
    });
  }, [classifiedLoans, scheduledLoans, scope, hideRemindedToday]);

  const queueItems = useMemo(
    () =>
      (scope === 'scheduled'
        ? filteredItems.filter((item) => item.urgency.category === 'overdue' || item.urgency.category === 'due_soon')
        : filteredItems
      ).filter(
        (item) => item.phoneDigits !== null && (!item.loan.id || !skippedIds.includes(item.loan.id))
      ),
    [filteredItems, skippedIds, scope]
  );

  const activeQueueItem = queueItems[0] || null;

  const [editableMessage, setEditableMessage] = useState('');

  useEffect(() => {
    if (activeQueueItem) {
      setEditableMessage(
        buildReminderMessage(
          activeQueueItem.loan,
          activeQueueItem.urgency,
          templates,
          publicOrigin
        )
      );
    } else {
      setEditableMessage('');
    }
  }, [activeQueueItem?.loan.id, activeQueueItem?.urgency.category, templates, publicOrigin]);

  const handleMarkAndAdvance = async (loan: Loan) => {
    if (!loan.id) return;
    setSentSessionIds((prev) => (prev.includes(loan.id!) ? prev : [...prev, loan.id!]));
    await onMarkSent(loan);
  };

  const handleSendViaApi = async (loan: Loan, phoneDigits: string, message: string) => {
    if (!loan.id) return;
    setSendingId(loan.id);
    setApiFeedback(null);
    try {
      const response = await fetch('/api/whatsapp/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneDigits,
          loanId: loan.id,
          message,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        setApiFeedback({
          type: 'error',
          text: data?.reason || data?.error || 'Falha no envio pela API WhatsApp. Use o botão "Abrir no WhatsApp".',
        });
        return;
      }
      await handleMarkAndAdvance(loan);
      setApiFeedback({
        type: 'success',
        text: `Lembrete interativo enviado via API WhatsApp para ${loan.borrowerName}.`,
      });
    } catch {
      setApiFeedback({
        type: 'error',
        text: 'Erro de conexão com a API WhatsApp. Use o link direto abaixo.',
      });
    } finally {
      setSendingId(null);
    }
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const formatUrgencyText = (category: 'overdue' | 'due_soon', daysDiff: number) => {
    if (category === 'overdue') {
      const days = Math.abs(daysDiff);
      if (days <= 0) return 'Em atraso';
      return days === 1 ? 'Atrasado há 1 dia' : `Atrasado há ${days} dias`;
    }
    if (daysDiff <= 0) return 'Vence hoje';
    if (daysDiff === 1) return 'Vence amanhã';
    return `Vence em ${daysDiff} dias`;
  };

  const formatRemindedAt = (loan: Loan) => {
    if (loan.id && sentSessionIds.includes(loan.id)) return 'Enviado agora';
    const d = parseLoanDate(loan.lastReminderAt);
    if (!d) return null;
    if (wasRemindedToday(loan)) return `Enviado hoje às ${format(d, 'HH:mm')}`;
    return `Último envio em ${format(d, 'dd/MM', { locale: ptBR })}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 20 }}
        className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800"
      >
        {/* Modal Header */}
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <MessageCircle size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-display font-bold text-slate-800 dark:text-slate-100 truncate">
                Notificações por WhatsApp
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {overdueTotal} {overdueTotal === 1 ? 'atrasado' : 'atrasados'} · {dueSoonTotal}{' '}
                {dueSoonTotal === 1 ? 'próximo do vencimento' : 'próximos do vencimento'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowTemplateEditor((prev) => !prev)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                showTemplateEditor
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal size={14} />
              <span className="hidden sm:inline">Modelos</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
          {/* Integration & Interactive Options Info */}
          <div className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span>
              Opções na mensagem: <strong>Preciso de mais tempo (+15 dias)</strong> e{' '}
              <strong>Já devolvi</strong> (notifica administrador{' '}
              <span className="tabular-nums font-semibold">{adminPhoneLabel}</span>).
            </span>
            <span
              className={`font-semibold tabular-nums ${
                apiConfigured
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {apiConfigured ? 'API WhatsApp conectada' : 'Modo Direto (WhatsApp Web / App)'}
            </span>
          </div>

          {apiFeedback && (
            <div
              className={`px-4 py-3 rounded-xl border text-xs font-medium ${
                apiFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
              }`}
            >
              {apiFeedback.text}
            </div>
          )}
          {/* Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  scope === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Todos ({classifiedLoans.length})
              </button>
              <button
                type="button"
                onClick={() => setScope('overdue')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  scope === 'overdue'
                    ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Atrasados ({overdueTotal})
              </button>
              <button
                type="button"
                onClick={() => setScope('due_soon')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  scope === 'due_soon'
                    ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Próx. vencimento ({dueSoonTotal})
              </button>
              <button
                type="button"
                onClick={() => setScope('scheduled')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  scope === 'scheduled'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Programados ({scheduledLoans.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                <span>Avisar até</span>
                <select
                  value={dueSoonDays}
                  onChange={(e) => onChangeDueSoonDays(Number(e.target.value))}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value={1}>1 dia antes</option>
                  <option value={3}>3 dias antes</option>
                  <option value={5}>5 dias antes</option>
                  <option value={7}>7 dias antes</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setHideRemindedToday((prev) => !prev)}
                className={`px-3 py-1.5 rounded-lg font-medium border transition-colors whitespace-nowrap ${
                  hideRemindedToday
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {hideRemindedToday ? 'Ocultando enviados hoje' : 'Mostrando todos'}
              </button>
            </div>
          </div>

          {/* Template Editor */}
          {showTemplateEditor && (
            <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Modelos Automáticos de Mensagem
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Variáveis disponíveis: <code className="font-mono">{'{nome}'}</code>,{' '}
                    <code className="font-mono">{'{livro}'}</code>,{' '}
                    <code className="font-mono">{'{prazo}'}</code>,{' '}
                    <code className="font-mono">{'{detalhe}'}</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDraftTemplates(DEFAULT_REMINDER_TEMPLATES);
                    setDraftPublicOrigin(getDefaultPublicOrigin());
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
                >
                  <RotateCcw size={12} />
                  <span>Restaurar padrão</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Link base do Autoatendimento (usado nos botões de resposta da mensagem)
                </label>
                <input
                  type="url"
                  value={draftPublicOrigin}
                  onChange={(e) => setDraftPublicOrigin(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Deve apontar para a URL pública/compartilhada do aplicativo para que os leitores abram sem precisar de login.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                  Mensagem para empréstimos em atraso
                </label>
                <textarea
                  rows={3}
                  value={draftTemplates.overdue}
                  onChange={(e) =>
                    setDraftTemplates((prev) => ({ ...prev, overdue: e.target.value }))
                  }
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Mensagem para empréstimos próximos do vencimento
                </label>
                <textarea
                  rows={3}
                  value={draftTemplates.dueSoon}
                  onChange={(e) =>
                    setDraftTemplates((prev) => ({ ...prev, dueSoon: e.target.value }))
                  }
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                {templatesSavedNotice && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Configurações salvas!
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onSaveTemplates(draftTemplates);
                    savePublicOrigin(draftPublicOrigin);
                    setPublicOrigin(draftPublicOrigin.trim().replace(/\/+$/, '') || getDefaultPublicOrigin());
                    setTemplatesSavedNotice(true);
                    setTimeout(() => setTemplatesSavedNotice(false), 2000);
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                >
                  Salvar Modelos e Link
                </button>
              </div>
            </div>
          )}

          {/* Sequential Queue Card */}
          {activeQueueItem && activeQueueItem.phoneDigits ? (
            <div className="p-5 sm:p-6 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                      Fila de envio · 1 de {queueItems.length}
                    </span>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                    <span
                      className={
                        activeQueueItem.urgency.category === 'overdue'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }
                    >
                      {formatUrgencyText(
                        activeQueueItem.urgency.category as 'overdue' | 'due_soon',
                        activeQueueItem.urgency.daysDiff
                      )}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {activeQueueItem.loan.borrowerName}{' '}
                    <span className="font-normal text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                      · {activeQueueItem.loan.borrowerPhone}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Livro: <strong>{activeQueueItem.loan.bookTitle}</strong>
                    {activeQueueItem.urgency.dueDate && (
                      <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {' '}
                        · Prazo {format(activeQueueItem.urgency.dueDate, 'dd/MM/yyyy')}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Mensagem preparada automaticamente (você pode ajustar antes de enviar)
                </label>
                <textarea
                  rows={5}
                  value={editableMessage}
                  onChange={(e) => setEditableMessage(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {apiConfigured && (
                  <button
                    type="button"
                    disabled={sendingId === activeQueueItem.loan.id}
                    onClick={() =>
                      handleSendViaApi(
                        activeQueueItem.loan,
                        activeQueueItem.phoneDigits!,
                        editableMessage
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {sendingId === activeQueueItem.loan.id ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <Send size={17} />
                    )}
                    <span>Enviar via API WhatsApp</span>
                  </button>
                )}

                <a
                  href={buildWhatsAppUrl(activeQueueItem.phoneDigits, editableMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleMarkAndAdvance(activeQueueItem.loan)}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors whitespace-nowrap ${
                    apiConfigured
                      ? 'btn-secondary'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <MessageCircle size={17} />
                  <span>{apiConfigured ? 'Abrir no WhatsApp' : 'Enviar no WhatsApp e Avançar'}</span>
                </a>

                <button
                  type="button"
                  onClick={() =>
                    handleCopyMessage(activeQueueItem.loan.id || 'queue', editableMessage)
                  }
                  className="btn-secondary text-sm py-3 px-4 whitespace-nowrap"
                >
                  {copiedId === (activeQueueItem.loan.id || 'queue') ? (
                    <>
                      <Check size={16} className="text-emerald-600" />
                      <span>Copiada</span>
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      <span>Copiar texto</span>
                    </>
                  )}
                </button>

                {queueItems.length > 1 && activeQueueItem.loan.id && (
                  <button
                    type="button"
                    onClick={() =>
                      setSkippedIds((prev) => [...prev, activeQueueItem.loan.id!])
                    }
                    className="btn-secondary text-sm py-3 px-4 whitespace-nowrap"
                  >
                    <SkipForward size={16} />
                    <span>Pular</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 text-center space-y-2">
              <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
              <p className="font-bold text-sm text-slate-800 dark:text-slate-100">
                {classifiedLoans.length === 0
                  ? 'Nenhum empréstimo atrasado ou próximo do vencimento'
                  : 'Todos os lembretes desta fila já foram enviados hoje'}
              </p>
              {skippedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSkippedIds([])}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Reexibir {skippedIds.length} pulado(s)
                </button>
              )}
            </div>
          )}

          {/* Full List of Eligible Loans */}
          {filteredItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Lista de destinatários ({filteredItems.length})
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {filteredItems.map(({ loan, urgency, phoneDigits, scheduledDate }) => {
                  const message = buildReminderMessage(loan, urgency, templates, publicOrigin);
                  const remindedText = formatRemindedAt(loan);
                  const isOverdue = urgency.category === 'overdue';
                  const isDueSoon = urgency.category === 'due_soon';

                  return (
                    <div
                      key={loan.id}
                      className="p-4 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                            {loan.borrowerName}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                          <span
                            className={`text-xs font-semibold inline-flex items-center gap-1 ${
                              isOverdue
                                ? 'text-rose-600 dark:text-rose-400'
                                : isDueSoon
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {isOverdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
                            <span>
                              {isOverdue || isDueSoon
                                ? formatUrgencyText(
                                    urgency.category as 'overdue' | 'due_soon',
                                    urgency.daysDiff
                                  )
                                : scheduledDate
                                  ? `Disparo programado para ${format(scheduledDate, 'dd/MM/yyyy')}`
                                  : 'Programado'}
                            </span>
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {loan.bookTitle}
                          {loan.borrowerPhone ? ` · ${loan.borrowerPhone}` : ''}
                          {remindedText ? ` · ${remindedText}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {phoneDigits ? (
                          <>
                            {apiConfigured && (
                              <button
                                type="button"
                                disabled={sendingId === loan.id}
                                onClick={() => handleSendViaApi(loan, phoneDigits, message)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
                              >
                                {sendingId === loan.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Send size={13} />
                                )}
                                <span>Via API</span>
                              </button>
                            )}
                            <a
                              href={buildWhatsAppUrl(phoneDigits, message)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleMarkAndAdvance(loan)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-300 hover:text-white border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold transition-colors whitespace-nowrap"
                            >
                              <MessageCircle size={14} />
                              <span>{apiConfigured ? 'WhatsApp' : 'Enviar'}</span>
                            </a>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500 px-2">
                            Telefone inválido
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
