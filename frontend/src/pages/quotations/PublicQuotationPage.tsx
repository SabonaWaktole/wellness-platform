import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, FileWarning, CheckCircle2, XCircle, MessageSquareText } from 'lucide-react';
import styles from './PublicQuotationPage.module.css';
import { API_BASE_URL } from '../../api/baseUrl';
import { formatDatePattern } from '../../utils/dateFormatPattern';

interface PublicLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface PublicQuotation {
  reference: string;
  status: string;
  issuedAt: string;
  sentAt: string | null;
  clientName: string;
  company: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  currency: string;
  locale: string;
  dateFormat: string;
  lines: PublicLine[];
  subtotal: number;
}

const apiBase = API_BASE_URL;

type PendingAction = 'accept' | 'reject' | 'requote' | null;

/**
 * The quotation as the customer sees it (§6.5).
 *
 * Deliberately outside the authenticated app shell — no sidebar, no tenant
 * routing, no auth store. The person opening this has no account and never
 * will; rendering them a chrome they cannot use, or bouncing them to a login
 * they cannot pass, is what "Sent" meant before this page existed.
 *
 * It fetches with plain `fetch` rather than the shared `apiClient` for the same
 * reason: that client sends credentials and carries interceptors that redirect
 * on 401. Neither is wanted here, and a customer must never be logged out of
 * something by viewing a quotation.
 */
export const PublicQuotationPage = () => {
  const { token } = useParams();
  const { t } = useTranslation('quotations');

  const [quotation, setQuotation] = useState<PublicQuotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [requoteNote, setRequoteNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`${apiBase}/public/quotations/${token}`);
        if (!response.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = (await response.json()) as PublicQuotation;
        if (!cancelled) setQuotation(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    // Guards against a state update after the customer navigates away mid-fetch.
    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * Accept / Reject / Re-quote all resolve to the same two server routes —
   * "Re-quote" is Reject with a required note (RespondToPublicQuotationUseCase).
   *
   * 200 and 409 both carry a quotation view: the call either succeeded, or
   * arrived after the quotation had already moved on (another tab, a race),
   * and either way the page reconciles to whatever state comes back rather
   * than trusting its own guess. 422 is a real failure — e.g. Accept refused
   * because the quoted quantity is no longer in stock — and carries an error
   * message instead; this must NOT be treated as success. Earlier code only
   * special-cased 404 and blindly parsed everything else as the quotation
   * body, so a 422 silently "succeeded" into the same, unchanged Sent state
   * with no explanation — Confirm appeared to do nothing.
   */
  const respond = async (decision: 'accept' | 'reject', note?: string) => {
    setSubmitting(true);
    setActionError(null);
    try {
      const response = await fetch(`${apiBase}/public/quotations/${token}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'reject' ? { note } : {}),
      });

      if (response.status === 404) {
        setNotFound(true);
        return;
      }

      const body = await response.json();

      if (!response.ok && response.status !== 409) {
        setActionError(body.error || t('public.actions.error'));
        return;
      }

      const data = body as PublicQuotation;
      setQuotation(data);
      setPendingAction(null);
      setRequoteNote('');
    } catch {
      setActionError(t('public.actions.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.centered}>{t('public.loading')}</div>;
  }

  if (notFound || !quotation) {
    /*
     * One message for every failure — unknown token, withdrawn quotation, still
     * a draft. The server deliberately does not distinguish them (telling a
     * probing caller which tokens are real defeats the token length), so the
     * page must not invent a distinction the API refused to make.
     */
    return (
      <div className={styles.centered}>
        <FileWarning size={32} strokeWidth={1.5} />
        <h1 className={styles.errorTitle}>{t('public.notFound')}</h1>
        <p className={styles.errorHint}>{t('public.notFoundHint')}</p>
      </div>
    );
  }

  const money = (amount: number) => formatMoney(amount, quotation.currency, quotation.locale);
  const date = (value: string) => formatDatePattern(new Date(value), quotation.locale, quotation.dateFormat);

  return (
    <div className={styles.page}>
      <article className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.issuer}>
            {quotation.company.logoUrl && (
              <img
                src={quotation.company.logoUrl}
                alt={quotation.company.name}
                className={styles.logo}
              />
            )}
            <div>
              <h1 className={styles.companyName}>{quotation.company.name}</h1>
              {quotation.company.address && (
                <p className={styles.meta}>{quotation.company.address}</p>
              )}
              {(quotation.company.contactEmail || quotation.company.contactPhone) && (
                <p className={styles.meta}>
                  {[quotation.company.contactEmail, quotation.company.contactPhone]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
          </div>

          <a
            className={styles.downloadButton}
            href={`${apiBase}/public/quotations/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={16} />
            {t('public.download')}
          </a>
        </header>

        <section className={styles.summary}>
          <div>
            <span className={styles.label}>{t('public.reference')}</span>
            <span className={styles.value}>{quotation.reference}</span>
          </div>
          <div>
            <span className={styles.label}>{t('public.preparedFor')}</span>
            <span className={styles.value}>{quotation.clientName}</span>
          </div>
          <div>
            <span className={styles.label}>{t('public.issued')}</span>
            <span className={styles.value}>{date(quotation.issuedAt)}</span>
          </div>
          {quotation.sentAt && (
            <div>
              <span className={styles.label}>{t('public.sent')}</span>
              <span className={styles.value}>{date(quotation.sentAt)}</span>
            </div>
          )}
        </section>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('public.description')}</th>
                <th scope="col">{t('public.quantity')}</th>
                <th scope="col">{t('public.unitPrice')}</th>
                <th scope="col">{t('public.lineTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((line, index) => (
                // Index keys are safe here: the list is read-only, never
                // reordered and never filtered.
                <tr key={index}>
                  <td>{line.description}</td>
                  <td>{line.quantity}</td>
                  <td>{money(line.unitPrice)}</td>
                  <td>{money(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{t('public.subtotal')}</td>
                <td>
                  <strong>{money(quotation.subtotal)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {quotation.status === 'SENT' && (
          <section className={styles.responseSection}>
            {pendingAction === null && (
              <div className={styles.actionButtons}>
                <button
                  type="button"
                  className={styles.acceptButton}
                  disabled={submitting}
                  onClick={() => setPendingAction('accept')}
                >
                  <CheckCircle2 size={16} />
                  {t('public.actions.accept')}
                </button>
                <button
                  type="button"
                  className={styles.rejectButton}
                  disabled={submitting}
                  onClick={() => setPendingAction('reject')}
                >
                  <XCircle size={16} />
                  {t('public.actions.reject')}
                </button>
                <button
                  type="button"
                  className={styles.requoteButton}
                  disabled={submitting}
                  onClick={() => setPendingAction('requote')}
                >
                  <MessageSquareText size={16} />
                  {t('public.actions.requote')}
                </button>
              </div>
            )}

            {(pendingAction === 'accept' || pendingAction === 'reject') && (
              <div className={styles.confirmPanel}>
                <p>
                  {pendingAction === 'accept'
                    ? t('public.actions.confirmAccept')
                    : t('public.actions.confirmReject')}
                </p>
                <div className={styles.confirmButtons}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={submitting}
                    onClick={() => setPendingAction(null)}
                  >
                    {t('public.actions.cancel')}
                  </button>
                  <button
                    type="button"
                    className={pendingAction === 'accept' ? styles.acceptButton : styles.rejectButton}
                    disabled={submitting}
                    onClick={() => respond(pendingAction, pendingAction === 'reject' ? '' : undefined)}
                  >
                    {t('public.actions.confirm')}
                  </button>
                </div>
              </div>
            )}

            {pendingAction === 'requote' && (
              <div className={styles.confirmPanel}>
                <label htmlFor="requote-note">{t('public.actions.requotePrompt')}</label>
                <textarea
                  id="requote-note"
                  className={styles.requoteInput}
                  value={requoteNote}
                  onChange={(event) => setRequoteNote(event.target.value)}
                  placeholder={t('public.actions.requotePlaceholder')}
                  rows={3}
                />
                <div className={styles.confirmButtons}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={submitting}
                    onClick={() => {
                      setPendingAction(null);
                      setRequoteNote('');
                    }}
                  >
                    {t('public.actions.cancel')}
                  </button>
                  <button
                    type="button"
                    className={styles.requoteButton}
                    disabled={submitting || requoteNote.trim() === ''}
                    onClick={() => respond('reject', requoteNote.trim())}
                  >
                    {t('public.actions.send')}
                  </button>
                </div>
              </div>
            )}

            {actionError && <p className={styles.actionError}>{actionError}</p>}
          </section>
        )}

        {quotation.status === 'ACCEPTED' && (
          <section className={styles.responseSection}>
            <p className={styles.responseBanner}>{t('public.actions.accepted')}</p>
          </section>
        )}

        {quotation.status === 'REJECTED' && (
          <section className={styles.responseSection}>
            <p className={styles.responseBanner}>{t('public.actions.rejected')}</p>
          </section>
        )}

        <footer className={styles.footer}>{t('public.privateNotice')}</footer>
      </article>
    </div>
  );
};

/**
 * Formats in the issuing workspace's currency and locale — not the viewer's.
 *
 * A quotation priced in EUR must read as EUR to a customer whose browser is set
 * to en-US. This page cannot use `useMoneyFormat`, which reads the *logged-in
 * tenant's* settings from the auth store; there is no logged-in tenant here.
 */
function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    // An unknown locale or currency code must not blank the customer's total.
    return amount.toFixed(2);
  }
}
