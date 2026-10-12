import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button/Button';
import { placePopover, type Side } from '../../lib/support/popoverPlacement';
import type { StepCopy, TargetRect, TargetStatus } from '../../lib/support/types';
import styles from './TourPopover.module.css';

export type PopoverVariant = 'step' | 'waiting' | 'lost' | 'completed';

export interface TourPopoverProps {
  variant: PopoverVariant;
  /** The step's text; unused by the waiting, lost and completed variants. */
  copy: StepCopy | null;
  /** Zero based position among the steps eligible right now. */
  index: number;
  total: number;
  status: TargetStatus | null;
  /** Where the highlighted control is; null centres the card at the bottom. */
  targetRect: TargetRect | null;
  preferredSide?: Side;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onExit: () => void;
  onFinish: () => void;
  onReplay: () => void;
  onClose: () => void;
  /** What a `waiting` card waits for: the page to load (default), the user to open a layer, or to close it. */
  waitingFor?: 'loading' | 'open' | 'close';
  /** Leave the part of the tour that sits inside a layer the user has not opened. */
  onSkipPart?: () => void;
  /** `again`: the user closed the layer before the part was over, so offer it a second time. */
  note?: 'again';
  /** The last step of a layer says Continue; the last step of the tour says Finish. */
  lastLabel?: 'finish' | 'continue';
  /** A line of text shown under the body, for example that a control cannot be used during the tour. */
  notice?: string;
  rootRef?: Ref<HTMLDivElement>;
  headingRef?: Ref<HTMLHeadingElement>;
  /** Called with the card's height when it docks as a bottom sheet (0 otherwise), so the host can keep the target clear of it. */
  onSheetHeight?: (height: number) => void;
}

const FALLBACK_SIZE = { width: 360, height: 240 };

const useViewport = () => {
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  useLayoutEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return viewport;
};

/**
 * The card that explains the current step. One element serves every variant
 * (step, waiting, lost, completed), so a target that vanishes mid-step changes
 * the card's contents in place and focus is not dropped.
 */
export const TourPopover = ({
  variant,
  copy,
  index,
  total,
  status,
  targetRect,
  preferredSide,
  onNext,
  onBack,
  onSkip,
  onExit,
  onFinish,
  onReplay,
  onClose,
  waitingFor = 'loading',
  onSkipPart,
  note,
  lastLabel = 'finish',
  notice,
  rootRef,
  headingRef,
  onSheetHeight,
}: TourPopoverProps) => {
  const { t } = useTranslation('support');
  const titleId = useId();
  const bodyId = useId();
  const ownRef = useRef<HTMLDivElement | null>(null);
  const viewport = useViewport();
  const [size, setSize] = useState(FALLBACK_SIZE);

  // Measured after every render: the contents differ per variant. jsdom has no layout and reports 0.
  useLayoutEffect(() => {
    const node = ownRef.current;
    if (!node) return;
    const width = node.offsetWidth || FALLBACK_SIZE.width;
    const height = node.offsetHeight || FALLBACK_SIZE.height;
    setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
  }, [variant, status, copy, viewport.width]);

  const placement = targetRect ? placePopover(targetRect, size, viewport, preferredSide) : null;
  const mode = viewport.width < 768 ? 'sheet' : placement ? 'floating' : 'centred';

  useLayoutEffect(() => {
    onSheetHeight?.(mode === 'sheet' ? size.height : 0);
  }, [mode, size.height, onSheetHeight]);

  const setRoot = (node: HTMLDivElement | null) => {
    ownRef.current = node;
    if (typeof rootRef === 'function') rootRef(node);
    else if (rootRef) rootRef.current = node;
  };

  const floating = placement && placement.mode === 'floating' ? placement : null;
  const style: CSSProperties | undefined = floating ? { top: floating.top, left: floating.left } : undefined;
  const isLast = index >= total - 1;

  // A card that waits for the user to open something is the step itself, with a hint; one that waits for
  // a layer to close, or for the page to load, has copy of its own.
  const waitingOnOpen = variant === 'waiting' && waitingFor === 'open';
  const waitingOnClose = variant === 'waiting' && waitingFor === 'close';
  const title =
    variant === 'step' || waitingOnOpen
      ? (copy?.title ?? '')
      : waitingOnClose
        ? t('popover.closeWait.title')
        : t(`popover.${variant}.title`);
  const body =
    variant === 'step' || waitingOnOpen
      ? (copy?.body ?? '')
      : waitingOnClose
        ? t('popover.closeWait.body')
        : t(`popover.${variant}.body`);

  return (
    <div
      ref={setRoot}
      className={styles.popover}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-support-ui=""
      data-mode={mode}
      data-variant={variant}
      data-side={floating?.side}
      style={style}
      // A press on the card is not a click "outside" a menu or dialog the tour is explaining.
      onMouseDown={(event) => event.stopPropagation()}
    >
      {floating && (
        <span
          className={styles.arrow}
          aria-hidden="true"
          style={floating.side === 'top' || floating.side === 'bottom' ? { left: floating.arrow } : { top: floating.arrow }}
        />
      )}

      <h2 id={titleId} className={styles.title} tabIndex={-1} ref={headingRef}>
        {title}
      </h2>
      <p id={bodyId} className={styles.body}>
        {body}
      </p>

      {notice && <p className={styles.notice}>{notice}</p>}
      {waitingOnOpen && <p className={styles.hint}>{t('popover.openHint')}</p>}
      {waitingOnOpen && note === 'again' && <p className={styles.hint}>{t('popover.seeAgain')}</p>}
      {variant === 'step' && copy?.when && (
        <section className={styles.when}>
          <h3 className={styles.whenLabel}>{t('popover.when')}</h3>
          <p>{copy.when}</p>
        </section>
      )}
      {variant === 'step' && copy?.warning && (
        <div className={styles.warning} role="note">
          <TriangleAlert size={16} aria-hidden="true" />
          <div>
            <strong>{t('popover.warningLabel')}</strong>
            <p>{copy.warning}</p>
          </div>
        </div>
      )}
      {variant === 'step' && status === 'disabled' && (
        <p className={styles.hint}>{copy?.disabled ?? t('popover.disabledFallback')}</p>
      )}

      {(variant === 'step' || variant === 'lost') && total > 0 && (
        <div className={styles.progress}>
          <span className={styles.progressText}>{t('popover.stepOf', { current: index + 1, total })}</span>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label={t('popover.progress')}
            aria-valuemin={0}
            aria-valuenow={index + 1}
            aria-valuemax={total}
          >
            <div className={styles.fill} style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className={styles.actions}>
        {variant === 'completed' ? (
          <>
            <Button type="button" size="sm" onClick={onReplay}>
              {t('popover.completed.replay')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {t('popover.completed.close')}
            </Button>
          </>
        ) : (
          <>
            {waitingOnOpen && onSkipPart && (
              <Button type="button" size="sm" variant="outline" onClick={onSkipPart}>
                {t('popover.skipPart')}
              </Button>
            )}
            {variant !== 'waiting' && index > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={onBack}>
                {t('popover.back')}
              </Button>
            )}
            {variant !== 'waiting' &&
              (isLast ? (
                <Button type="button" size="sm" onClick={onFinish}>
                  {lastLabel === 'continue' ? t('popover.continue') : t('popover.finish')}
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={onNext}>
                  {t('popover.next')}
                </Button>
              ))}
            <Button type="button" size="sm" variant="ghost" onClick={onSkip}>
              {t('popover.skip')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onExit}>
              {t('popover.exit')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
