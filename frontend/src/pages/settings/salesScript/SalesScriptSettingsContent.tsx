import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog/ConfirmDialog';
import { RichTextField } from '../../../components/ui/RichTextField';
import { SalesScriptContent } from '../../../components/salesScript/SalesScriptContent';
import { scriptSections } from '../../../components/salesScript/scriptSections';
import { salesScriptService, type ScriptVersion, type ScriptVersionList } from '../../../services/salesScriptService';
import { useDateFormat } from '../../../hooks/useDateFormat';
import type { RichTextDoc } from '../../../types/form';
import styles from './SalesScriptSettings.module.css';

type Language = 'Sq' | 'En';
type Content = { contentSq: RichTextDoc | null; contentEn: RichTextDoc | null };

const contentOf = (script: ScriptVersion | null): Content => ({
  contentSq: script?.contentSq.content.length ? script.contentSq : null,
  contentEn: script?.contentEn?.content.length ? script.contentEn : null,
});

const EMPTY: RichTextDoc = { type: 'doc', content: [] };

/** The code the server refused the request with, if any. */
const errorCode = (err: unknown) => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

/**
 * Settings → Sales script (M2 Slice 5: FR-SCR-04..06). The Administrator
 * edits the script in Albanian and English, previews it as salespeople will
 * see it, saves drafts without changing what salespeople read, and publishes.
 * Every publish is a version; earlier ones can be viewed and restored as the
 * draft. Only for `script.edit`; the route checks.
 */
export const SalesScriptSettingsContent = () => {
  const { t } = useTranslation('settings');
  const { tenantSlug = '' } = useParams();
  const dates = useDateFormat();
  const [draft, setDraft] = useState<ScriptVersion | null>(null);
  const [published, setPublished] = useState<ScriptVersion | null>(null);
  const [history, setHistory] = useState<ScriptVersionList | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [edited, setEdited] = useState<Content | null>(null);
  const [language, setLanguage] = useState<Language>('Sq');
  const [previewing, setPreviewing] = useState(false);
  // Re-mounts the editors when the text comes from the server (load, save, restore).
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [confirming, setConfirming] = useState<{ kind: 'publish' } | { kind: 'restore'; version: number } | null>(null);
  const [viewing, setViewing] = useState<ScriptVersion | null>(null);

  const load = useCallback(async () => {
    try {
      const [current, list] = await Promise.all([salesScriptService.draft(tenantSlug), salesScriptService.versions(tenantSlug)]);
      setDraft(current.draft);
      setPublished(current.published);
      setHistory(list);
      setEdited(null);
      setEditorKey((key) => key + 1);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const saved = contentOf(draft ?? published);
  const content = edited ?? saved;
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(saved);
  const field = `content${language}` as keyof Content;

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await load();
      setMessage({ text: done, failed: false });
    } catch (err) {
      const code = errorCode(err);
      setMessage({ text: t(`salesScript.errors.${code ?? 'generic'}`, { defaultValue: t('salesScript.errors.generic') }), failed: true });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => salesScriptService.saveDraft(tenantSlug, content).then(() => undefined);

  const publish = () =>
    run(async () => {
      // What is on screen is what gets published: unsaved changes are saved first.
      if (dirty || !draft) await saveDraft();
      await salesScriptService.publish(tenantSlug);
    }, t('salesScript.published'));

  const restore = (version: number) =>
    run(async () => {
      await salesScriptService.restore(tenantSlug, version);
      setViewing(null);
    }, t('salesScript.restored', { version }));

  const view = async (version: number) => {
    try {
      setViewing(await salesScriptService.version(tenantSlug, version));
    } catch {
      setMessage({ text: t('salesScript.errors.generic'), failed: true });
    }
  };

  if (loadFailed) {
    return (
      <p className={styles.errorText} role="alert">
        {t('salesScript.loadFailed')}
      </p>
    );
  }
  if (!history) return <p className={styles.mutedText}>{t('salesScript.loading')}</p>;

  const previewContent = (field === 'contentEn' ? content.contentEn ?? content.contentSq : content.contentSq) ?? EMPTY;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>{t('salesScript.title')}</h2>
        <p className={styles.headerSubtitle}>{t('salesScript.subtitle')}</p>
      </div>

      <Card padding="md" className={styles.stack}>
        <p className={styles.mutedText} role="status">
          {draft
            ? t('salesScript.draftStatus', { version: draft.version, date: dates.dateTime(draft.updatedAt) })
            : published
              ? t('salesScript.publishedStatus', {
                  version: published.version,
                  date: published.publishedAt ? dates.dateTime(published.publishedAt) : '',
                })
              : t('salesScript.noScript')}
        </p>

        <div className={styles.controls}>
          <div className={styles.languageSwitch} role="group" aria-label={t('salesScript.language')}>
            {(['Sq', 'En'] as const).map((lang) => (
              <button key={lang} type="button" aria-pressed={language === lang} onClick={() => setLanguage(lang)}>
                {t(`salesScript.languages.${lang}`)}
              </button>
            ))}
          </div>
          <div className={styles.languageSwitch} role="group" aria-label={t('salesScript.mode')}>
            <button type="button" aria-pressed={!previewing} onClick={() => setPreviewing(false)}>
              {t('salesScript.edit')}
            </button>
            <button type="button" aria-pressed={previewing} onClick={() => setPreviewing(true)}>
              {t('salesScript.preview')}
            </button>
          </div>
        </div>

        {language === 'En' && <p className={styles.mutedText}>{t('salesScript.englishHint')}</p>}

        {previewing ? (
          <div className={styles.preview} aria-label={t('salesScript.previewLabel')} role="region">
            <SalesScriptContent content={previewContent} sections={scriptSections(previewContent)} idPrefix="sales-script-preview" />
          </div>
        ) : (
          <RichTextField
            key={`${field}-${editorKey}`}
            label={t('salesScript.textLabel', { language: t(`salesScript.languages.${language}`) })}
            helperText={t('salesScript.editorHint')}
            value={content[field]}
            onChange={(value) => setEdited({ ...content, [field]: value })}
            headings
          />
        )}

        <div className={styles.toolbar}>
          <Button size="sm" variant="outline" isLoading={busy} disabled={!dirty} onClick={() => void run(saveDraft, t('salesScript.draftSaved'))}>
            {t('salesScript.saveDraft')}
          </Button>
          <Button size="sm" disabled={busy || (!dirty && !draft)} onClick={() => setConfirming({ kind: 'publish' })}>
            {t('salesScript.publish')}
          </Button>
        </div>
        {message && (
          <p className={message.failed ? styles.errorText : styles.successText} role={message.failed ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </Card>

      <Card padding="md" className={styles.stack}>
        <h3 className={styles.sectionTitle}>{t('salesScript.versions')}</h3>
        <p className={styles.mutedText}>{t('salesScript.versionsHint')}</p>
        {history.versions.length === 0 ? (
          <p className={styles.mutedText}>{t('salesScript.noVersions')}</p>
        ) : (
          <ul className={styles.versionList}>
            {history.versions.map((entry) => (
              <li key={entry.version} className={styles.versionRow}>
                <div className={styles.versionInfo}>
                  <span className={styles.versionName}>
                    {t('salesScript.versionName', { version: entry.version })}
                    {entry.status === 'PUBLISHED' && <span className={styles.badge}>{t('salesScript.current')}</span>}
                  </span>
                  <span className={styles.mutedText}>
                    {entry.publishedAt
                      ? t('salesScript.publishedBy', {
                          date: dates.dateTime(entry.publishedAt),
                          name: entry.publishedBy?.name ?? t('salesScript.system'),
                        })
                      : ''}
                  </span>
                </div>
                <div className={styles.toolbar}>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('salesScript.viewVersion', { version: entry.version })}
                    onClick={() => void view(entry.version)}
                  >
                    {t('salesScript.view')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t('salesScript.restoreVersion', { version: entry.version })}
                    disabled={busy}
                    onClick={() => setConfirming({ kind: 'restore', version: entry.version })}
                  >
                    {t('salesScript.restore')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? t('salesScript.versionName', { version: viewing.version }) : ''}
        maxWidth="lg"
      >
        {viewing && (
          <div className={styles.stack}>
            {(['Sq', 'En'] as const).map((lang) => {
              const doc = lang === 'Sq' ? viewing.contentSq : viewing.contentEn;
              return (
                <section key={lang} className={styles.stack} aria-label={t(`salesScript.languages.${lang}`)}>
                  <h3 className={styles.sectionTitle}>{t(`salesScript.languages.${lang}`)}</h3>
                  {doc?.content.length ? (
                    <SalesScriptContent content={doc} sections={[]} idPrefix={`sales-script-v${viewing.version}-${lang}`} />
                  ) : (
                    <p className={styles.mutedText}>{t('salesScript.emptyLanguage')}</p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        tone="primary"
        title={confirming?.kind === 'restore' ? t('salesScript.restoreTitle', { version: confirming.version }) : t('salesScript.publishTitle')}
        message={
          confirming?.kind === 'restore'
            ? t('salesScript.restoreMessage', { version: confirming.version })
            : t('salesScript.publishMessage')
        }
        confirmLabel={confirming?.kind === 'restore' ? t('salesScript.restore') : t('salesScript.publish')}
        onConfirm={async () => {
          const action = confirming;
          setConfirming(null);
          if (action?.kind === 'restore') await restore(action.version);
          else await publish();
        }}
      />
    </div>
  );
};
