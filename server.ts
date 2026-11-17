import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTO_MESSAGE_NOTICE =
  'Esta é uma mensagem automática gerada pelo sistema de empréstimos de livros do Centro Espírita Pedra de Luz.';

const DEFAULT_ADMIN_PHONE = '+5548996478449';

function normalizeWhatsAppPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

function getWhatsAppConfig() {
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const webhookVerifyToken = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
  const apiVersion = (process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
  const adminPhoneRaw = (process.env.WHATSAPP_ADMIN_PHONE || DEFAULT_ADMIN_PHONE).trim();
  const adminPhoneDigits = normalizeWhatsAppPhone(adminPhoneRaw) || '5548996478449';

  return {
    accessToken,
    phoneNumberId,
    webhookVerifyToken,
    apiVersion,
    adminPhoneRaw,
    adminPhoneDigits,
    configured: Boolean(accessToken && phoneNumberId),
  };
}

// Initialize Firebase Web SDK cleanly for server-side webhook/API updates
const firebaseConfigRaw = fs.readFileSync(
  path.resolve(__dirname, 'firebase-applet-config.json'),
  'utf-8'
);
const firebaseConfig = JSON.parse(firebaseConfigRaw) as {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  firestoreDatabaseId?: string;
};

const firebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
  : getFirestore(firebaseApp);

function parseFirestoreDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}

async function sendMetaWhatsAppPayload(payload: Record<string, unknown>) {
  const cfg = getWhatsAppConfig();
  if (!cfg.configured) {
    return {
      ok: false,
      configured: false,
      reason:
        'Credenciais da API WhatsApp Cloud (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) não configuradas no ambiente.',
    };
  }

  const endpoint = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...payload,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errObj = data?.error as { message?: string } | undefined;
    throw new Error(errObj?.message || `Meta Graph API HTTP ${response.status}`);
  }

  return {
    ok: true,
    configured: true,
    data,
  };
}

async function sendMetaTextMessage(toDigits: string, body: string) {
  return sendMetaWhatsAppPayload({
    to: toDigits,
    type: 'text',
    text: {
      preview_url: false,
      body,
    },
  });
}

async function sendMetaInteractiveReminder(
  toDigits: string,
  loanId: string,
  bodyText: string
) {
  // Meta interactive list allows row titles up to 24 characters:
  // "Preciso de mais tempo" = 21 chars | "Já devolvi" = 10 chars
  return sendMetaWhatsAppPayload({
    to: toDigits,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: 'BiblioLuz · Lembrete',
      },
      body: {
        text: bodyText.slice(0, 1024),
      },
      footer: {
        text: 'Centro Espírita Pedra de Luz',
      },
      action: {
        button: 'Responder',
        sections: [
          {
            title: 'Opções do Empréstimo',
            rows: [
              {
                id: `MORE_TIME:${loanId}`,
                title: 'Preciso de mais tempo',
                description: 'Adiciona automaticamente +15 dias ao prazo de devolução.',
              },
              {
                id: `ALREADY_RETURNED:${loanId}`,
                title: 'Já devolvi',
                description: 'Envia confirmação automática para o administrador da biblioteca.',
              },
            ],
          },
        ],
      },
    },
  });
}

async function applyExtendLoan15Days(loanId: string) {
  const loanRef = doc(db, 'loans', loanId);
  const snap = await getDoc(loanRef);
  if (!snap.exists()) {
    throw new Error('Empréstimo não encontrado.');
  }

  const loanData = snap.data() as Record<string, unknown>;
  if (loanData.status === 'returned' || loanData.status === 'lost') {
    return { alreadyClosed: true, newDueDate: null, loanData };
  }

  const now = new Date();
  const currentDue = parseFirestoreDate(loanData.dueDate);
  const extendedFromDue = currentDue ? addDays(currentDue, 15) : addDays(now, 15);
  const minNewDue = addDays(now, 15);
  const newDueDate =
    extendedFromDue.getTime() < minNewDue.getTime() ? minNewDue : extendedFromDue;
  const newReminderDate = addDays(newDueDate, -3);
  const prevCount =
    typeof loanData.extensionCount === 'number' ? loanData.extensionCount : 0;

  await updateDoc(loanRef, {
    dueDate: Timestamp.fromDate(newDueDate),
    status: 'active',
    reminderScheduledFor: Timestamp.fromDate(newReminderDate),
    reminderStatus: 'scheduled',
    extensionCount: prevCount + 1,
    lastExtensionAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { alreadyClosed: false, newDueDate, loanData };
}

async function applyReportAlreadyReturned(loanId: string) {
  const loanRef = doc(db, 'loans', loanId);
  const snap = await getDoc(loanRef);
  if (!snap.exists()) {
    throw new Error('Empréstimo não encontrado.');
  }

  const loanData = snap.data() as Record<string, unknown>;
  if (loanData.status === 'returned') {
    return { alreadyReturned: true, loanData };
  }

  await updateDoc(loanRef, {
    returnClaimedAt: serverTimestamp(),
    returnClaimStatus: 'pending_verification',
    updatedAt: serverTimestamp(),
  });

  return { alreadyReturned: false, loanData };
}

async function findMostRecentLoanByPhone(phoneDigits: string): Promise<string | null> {
  const snap = await getDocs(collection(db, 'loans'));
  let bestId: string | null = null;
  let bestTime = -1;

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    if (data.status === 'returned' || data.status === 'lost') return;
    const rawPhone = String(data.borrowerPhoneNormalized || data.borrowerPhone || '');
    const normalized = normalizeWhatsAppPhone(rawPhone);
    if (normalized !== phoneDigits) return;

    const due = parseFirestoreDate(data.dueDate)?.getTime() ?? 0;
    const reminded = parseFirestoreDate(data.lastReminderAt)?.getTime() ?? 0;
    const score = Math.max(reminded, due);
    if (score >= bestTime) {
      bestTime = score;
      bestId = docSnap.id;
    }
  });

  return bestId;
}

function buildAdminMessageText(params: {
  loanId?: string;
  bookTitle: string;
  borrowerName: string;
  borrowerPhone?: string;
}) {
  const idSuffix = params.loanId ? ` (Ref: ${params.loanId.slice(-6)})` : '';
  const phoneText = params.borrowerPhone ? ` · Tel: ${params.borrowerPhone}` : '';
  return `${AUTO_MESSAGE_NOTICE}\n\nOlá, Administrador! O(A) leitor(a) *${params.borrowerName}*${phoneText} selecionou a opção "Já devolvi" para o livro "${params.bookTitle}"${idSuffix}. Por favor, verifique a devolução no acervo do BiblioLuz.`;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/whatsapp/status', (_req: Request, res: Response) => {
    const cfg = getWhatsAppConfig();
    res.json({
      ok: true,
      configured: cfg.configured,
      adminPhone: '+55 48 99647-8449',
      adminPhoneDigits: cfg.adminPhoneDigits,
      webhookConfigured: Boolean(cfg.webhookVerifyToken),
    });
  });

  app.post('/api/whatsapp/send-verification', async (req: Request, res: Response) => {
    try {
      const toDigits = normalizeWhatsAppPhone(String(req.body?.to || ''));
      const name = String(req.body?.name || 'leitor(a)').trim();
      const code = String(req.body?.code || '').trim();

      if (!toDigits || !code) {
        res.status(400).json({ ok: false, error: 'Telefone ou código inválido.' });
        return;
      }

      const message = `${AUTO_MESSAGE_NOTICE}\n\nOlá, ${name}! Seu código de confirmação para cadastro no autoatendimento da biblioteca BiblioLuz é: *${code}*.`;
      const result = await sendMetaTextMessage(toDigits, message);
      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar verificação WhatsApp:', error);
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao enviar verificação.',
      });
    }
  });

  app.post('/api/whatsapp/send-reminder', async (req: Request, res: Response) => {
    try {
      const cfg = getWhatsAppConfig();
      if (!cfg.configured) {
        res.status(503).json({
          ok: false,
          configured: false,
          reason:
            'API do WhatsApp Cloud ainda não configurada no servidor (defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID).',
        });
        return;
      }

      const toDigits = normalizeWhatsAppPhone(String(req.body?.to || ''));
      const loanId = String(req.body?.loanId || '').trim();
      const rawMessage = String(req.body?.message || '').trim();

      if (!toDigits || !rawMessage) {
        res.status(400).json({ ok: false, error: 'Destinatário e mensagem são obrigatórios.' });
        return;
      }

      const finalBody = rawMessage.toLowerCase().includes('mensagem automática')
        ? rawMessage
        : `${rawMessage}\n\n${AUTO_MESSAGE_NOTICE}`;

      const result = loanId
        ? await sendMetaInteractiveReminder(toDigits, loanId, finalBody)
        : await sendMetaTextMessage(toDigits, finalBody);

      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar lembrete WhatsApp via API:', error);
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao enviar via API WhatsApp.',
      });
    }
  });

  app.post('/api/whatsapp/notify-admin', async (req: Request, res: Response) => {
    try {
      const cfg = getWhatsAppConfig();
      const loanId = String(req.body?.loanId || '').trim();
      const bookTitle = String(req.body?.bookTitle || 'Livro da biblioteca').trim();
      const borrowerName = String(req.body?.borrowerName || 'Leitor(a)').trim();
      const borrowerPhone = String(req.body?.borrowerPhone || '').trim();

      const adminMessage = buildAdminMessageText({
        loanId: loanId || undefined,
        bookTitle,
        borrowerName,
        borrowerPhone,
      });

      if (!cfg.configured) {
        res.json({
          ok: false,
          configured: false,
          adminPhone: '+55 48 99647-8449',
          adminPhoneDigits: cfg.adminPhoneDigits,
          message: adminMessage,
        });
        return;
      }

      const result = await sendMetaTextMessage(cfg.adminPhoneDigits, adminMessage);
      res.json({
        ...result,
        adminPhone: '+55 48 99647-8449',
        adminPhoneDigits: cfg.adminPhoneDigits,
      });
    } catch (error) {
      console.error('Erro ao notificar administrador via WhatsApp:', error);
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao notificar administrador.',
      });
    }
  });

  // Meta WhatsApp Webhook Verification
  app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const cfg = getWhatsAppConfig();
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (
      mode === 'subscribe' &&
      cfg.webhookVerifyToken &&
      token === cfg.webhookVerifyToken
    ) {
      res.status(200).send(challenge);
      return;
    }

    res.sendStatus(403);
  });

  // Meta WhatsApp Webhook Incoming Replies
  app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              messages?: Array<{
                from?: string;
                type?: string;
                text?: { body?: string };
                interactive?: {
                  type?: string;
                  list_reply?: { id?: string; title?: string };
                  button_reply?: { id?: string; title?: string };
                };
              }>;
            };
          }>;
        }>;
      };

      const entries = body?.entry || [];
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          const messages = change?.value?.messages || [];
          for (const msg of messages) {
            const fromDigits = normalizeWhatsAppPhone(msg.from || '');
            if (!fromDigits) continue;

            let action: 'MORE_TIME' | 'ALREADY_RETURNED' | null = null;
            let loanId: string | null = null;

            const interactiveId =
              msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id || '';

            if (interactiveId.startsWith('MORE_TIME:')) {
              action = 'MORE_TIME';
              loanId = interactiveId.slice('MORE_TIME:'.length).trim();
            } else if (interactiveId.startsWith('ALREADY_RETURNED:')) {
              action = 'ALREADY_RETURNED';
              loanId = interactiveId.slice('ALREADY_RETURNED:'.length).trim();
            } else if (msg.type === 'text' && msg.text?.body) {
              const lower = msg.text.body.trim().toLowerCase();
              if (
                lower === '1' ||
                lower.includes('preciso de mais tempo') ||
                lower.includes('mais tempo')
              ) {
                action = 'MORE_TIME';
                loanId = await findMostRecentLoanByPhone(fromDigits);
              } else if (
                lower === '2' ||
                lower.includes('já devolvi') ||
                lower.includes('ja devolvi')
              ) {
                action = 'ALREADY_RETURNED';
                loanId = await findMostRecentLoanByPhone(fromDigits);
              }
            }

            if (!action || !loanId) continue;

            if (action === 'MORE_TIME') {
              const result = await applyExtendLoan15Days(loanId);
              if (result.alreadyClosed) {
                await sendMetaTextMessage(
                  fromDigits,
                  `${AUTO_MESSAGE_NOTICE}\n\nEste empréstimo já consta como devolvido no sistema.`
                );
              } else if (result.newDueDate) {
                const formatted = format(result.newDueDate, "dd 'de' MMMM 'de' yyyy", {
                  locale: ptBR,
                });
                const title = String(result.loanData.bookTitle || 'seu livro');
                await sendMetaTextMessage(
                  fromDigits,
                  `${AUTO_MESSAGE_NOTICE}\n\nPrazo prorrogado com sucesso! Você ganhou +15 dias para o livro "${title}". Nova data de devolução: ${formatted}.`
                );
              }
            } else if (action === 'ALREADY_RETURNED') {
              const cfg = getWhatsAppConfig();
              const result = await applyReportAlreadyReturned(loanId);
              const title = String(result.loanData.bookTitle || 'livro');
              const borrowerName = String(result.loanData.borrowerName || 'Leitor(a)');
              const borrowerPhone = String(result.loanData.borrowerPhone || fromDigits);

              if (!result.alreadyReturned) {
                await sendMetaTextMessage(
                  cfg.adminPhoneDigits,
                  buildAdminMessageText({
                    loanId,
                    bookTitle: title,
                    borrowerName,
                    borrowerPhone,
                  })
                );
              }

              await sendMetaTextMessage(
                fromDigits,
                `${AUTO_MESSAGE_NOTICE}\n\nObrigado por avisar! Enviamos uma notificação automática ao administrador da biblioteca para confirmar a devolução do livro "${title}".`
              );
            }
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Erro ao processar webhook WhatsApp:', error);
      res.sendStatus(200);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        next();
        return;
      }

      try {
        const isSelfService = req.path === '/autoatendimento' || req.path.startsWith('/autoatendimento/');
        const templateFile = isSelfService
          ? path.resolve(__dirname, 'autoatendimento', 'index.html')
          : path.resolve(__dirname, 'index.html');
        const rawHtml = fs.readFileSync(templateFile, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));

    app.get('/autoatendimento*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'autoatendimento', 'index.html'));
    });

    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`BiblioLuz server running on http://0.0.0.0:${port}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
