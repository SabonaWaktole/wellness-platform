import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, MoreVertical, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { useToast } from '../../components/ui/Toast/toastContext';
import { Can } from '../../components/auth/Can';
import { usePermission } from '../../hooks/usePermission';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useStatusLabels } from '../../hooks/useStatusLabels';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useDealText } from '../../hooks/useDealText';
import { dealService } from '../../services/dealService';
import { isOpenStage, OPEN_DEAL_STAGES } from '../../types/deal';
import type { BoardColumn, DealStage, DealSummary } from '../../types/deal';
import { PipelineViewSwitch } from './PipelineViewSwitch';
import styles from './PipelineBoardContent.module.css';

/**
 * The pipeline board (FR-DEAL-10): one column per stage, in the order the
 * Administrator set for the stage labels, each with its card count and total
 * value. Cards move between open stages by drag on desktop, or through
 * "Move to stage" in the card menu, the only way on touch (FR-DEAL-13).
 * Won and Lost show this month's deals and are not drop targets: closing a
 * deal is its own action (FR-DEAL-07, Slice 13).
 *
 * A move shows at once and is undone by reloading the board if the server
 * refuses it. The board scrolls sideways inside its own area, so the page
 * itself never does at 360 px.
 */
export const PipelineBoardContent: React.FC = () => {
  const { t } = useTranslation('deals');
  const { t: tc } = useTranslation('common');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const statusLabel = useStatusLabel();
  const stageLabels = useStatusLabels('deal');
  const canEdit = usePermission('deals.edit');

  const [columns, setColumns] = useState<BoardColumn[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dragged, setDragged] = useState<DealSummary | null>(null);
  const [dropTarget, setDropTarget] = useState<DealStage | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    const request = ++latest.current;
    try {
      const board = await dealService.board(tenantSlug);
      if (request === latest.current) {
        setColumns(board.columns);
        setLoadFailed(false);
      }
    } catch {
      if (request === latest.current) setLoadFailed(true);
    }
  }, [tenantSlug]);

  useEffect(() => {
    load();
  }, [load]);

  /** The Administrator's stage order (FR-DEAL-06); the server's until the labels arrive. */
  const ordered = useMemo(() => {
    if (!columns) return [];
    const position = new Map(stageLabels.map((label, index) => [label.key, index]));
    return [...columns].sort((a, b) => (position.get(a.stage) ?? 99) - (position.get(b.stage) ?? 99));
  }, [columns, stageLabels]);

  const move = async (deal: DealSummary, stage: DealStage) => {
    if (!tenantSlug || deal.stage === stage || !isOpenStage(stage) || !isOpenStage(deal.stage)) return;
    latest.current++; // a board load already in flight would undo this move
    setColumns((current) =>
      current?.map((column) => {
        if (column.stage === deal.stage) {
          return { ...column, count: column.count - 1, items: column.items.filter((item) => item.id !== deal.id) };
        }
        if (column.stage === stage) {
          return { ...column, count: column.count + 1, items: [{ ...deal, stage }, ...column.items] };
        }
        return column;
      }) ?? null
    );
    try {
      await dealService.changeStage(tenantSlug, deal.id, stage);
    } catch {
      toast.error(t('board.moveFailed'));
      await load();
    }
  };

  const loadMore = async (column: BoardColumn) => {
    if (!tenantSlug || !column.nextCursor) return;
    try {
      const page = await dealService.column(tenantSlug, column.stage, column.nextCursor);
      setColumns(
        (current) =>
          current?.map((c) =>
            c.stage === column.stage ? { ...c, items: [...c.items, ...page.items], nextCursor: page.nextCursor } : c
          ) ?? null
      );
    } catch {
      toast.error(t('board.loadFailed'));
    }
  };

  const accepts = (stage: DealStage) => !!dragged && isOpenStage(stage) && dragged.stage !== stage;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('board.title')}</h1>
        </div>
        <div className={styles.headerActions}>
          <PipelineViewSwitch current="board" />
          <Can permission="deals.edit">
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate(`/${tenantSlug}/deals/new`)}>
              {t('newDeal')}
            </Button>
          </Can>
        </div>
      </div>

      {loadFailed && <p className={styles.message}>{t('board.loadFailed')}</p>}
      {!columns && !loadFailed && <p className={styles.message}>{tc('state.loading')}</p>}

      {columns && (
        <div className={styles.board}>
          {ordered.map((column) => {
            const label = statusLabel.deal(column.stage);
            const colour = stageLabels.find((item) => item.key === column.stage)?.colour;
            const open = isOpenStage(column.stage);
            return (
              <section
                key={column.stage}
                aria-label={t('board.columnLabel', { stage: label, count: column.count })}
                className={`${styles.column} ${dropTarget === column.stage ? styles.columnTarget : ''}`}
                onDragOver={(event) => {
                  if (!accepts(column.stage)) return;
                  event.preventDefault();
                  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                  setDropTarget(column.stage);
                }}
                onDragLeave={() => setDropTarget((current) => (current === column.stage ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setDropTarget(null);
                  if (dragged && accepts(column.stage)) move(dragged, column.stage);
                  setDragged(null);
                }}
              >
                <header className={styles.columnHeader}>
                  <span className={styles.columnDot} style={colour ? { backgroundColor: colour } : undefined} aria-hidden="true" />
                  <h2 className={styles.columnTitle}>{label}</h2>
                  <span className={styles.columnCount}>{column.count}</span>
                  {/* Absent without commercial.view (FR-RBAC-17); null until offers exist. */}
                  {column.totalNetMonthlyPrice !== undefined && (
                    <ColumnTotal value={column.totalNetMonthlyPrice} />
                  )}
                </header>
                {!open && <p className={styles.columnNote}>{t('board.thisMonth')}</p>}

                <div className={styles.cards}>
                  {column.items.length === 0 && <p className={styles.empty}>{t('board.emptyColumn')}</p>}
                  {column.items.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      movable={canEdit && open}
                      onOpen={() => navigate(`/${tenantSlug}/deals/${deal.id}`)}
                      onMove={(stage) => move(deal, stage)}
                      onDragStart={() => setDragged(deal)}
                      onDragEnd={() => {
                        setDragged(null);
                        setDropTarget(null);
                      }}
                    />
                  ))}
                  {column.nextCursor && (
                    <Button variant="ghost" size="sm" onClick={() => loadMore(column)}>
                      {t('board.loadMore')}
                    </Button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ColumnTotal: React.FC<{ value: string | null }> = ({ value }) => {
  const money = useMoneyFormat();
  return <span className={styles.columnTotal}>{value === null ? '—' : money.formatWhole(Number(value))}</span>;
};

interface DealCardProps {
  deal: DealSummary;
  movable: boolean;
  onOpen: () => void;
  onMove: (stage: DealStage) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

const DealCard: React.FC<DealCardProps> = ({ deal, movable, onOpen, onMove, onDragStart, onDragEnd }) => {
  const { t } = useTranslation('deals');
  const { tenantSlug } = useParams();
  const statusLabel = useStatusLabel();
  const money = useMoneyFormat();
  const dates = useDateFormat();
  const text = useDealText();
  const title = text.title(deal);

  return (
    <article
      aria-label={`${deal.companyName}: ${title}`}
      className={`${styles.card} ${movable ? styles.cardMovable : ''}`}
      draggable={movable}
      onDragStart={(event) => {
        if (!movable) return;
        event.dataTransfer?.setData('text/plain', deal.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        // Clicks from the card menu (portalled to <body>) and from the link
        // bubble here through React; only a click on the card itself opens it.
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target) || target.closest('a, button')) return;
        onOpen();
      }}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardCompany}>{deal.companyName}</span>
        {movable && (
          <DropdownMenu
            align="right"
            header={<span className={styles.menuHeader}>{t('board.moveTo')}</span>}
            trigger={
              <button type="button" className={styles.cardMenu} aria-label={t('board.moveToFor', { deal: title })}>
                <MoreVertical size={16} />
              </button>
            }
            items={OPEN_DEAL_STAGES.filter((stage) => stage !== deal.stage).map((stage) => ({
              id: stage,
              label: statusLabel.deal(stage),
              onClick: () => onMove(stage),
            }))}
          />
        )}
      </div>
      <Link className={styles.cardTitle} to={`/${tenantSlug}/deals/${deal.id}`}>
        {title}
      </Link>
      <div className={styles.cardMeta}>
        <span>{deal.ownerName}</span>
        {deal.netMonthlyPrice !== undefined && (
          <span className={styles.cardValue}>
            {deal.netMonthlyPrice === null ? '—' : t('perMonth', { amount: money.format(Number(deal.netMonthlyPrice)) })}
          </span>
        )}
      </div>
      {deal.nextFollowUpAt && (
        <div className={styles.cardFollowUp}>
          <CalendarClock size={14} aria-hidden="true" />
          {t('board.nextFollowUp', { date: dates.date(deal.nextFollowUpAt) })}
        </div>
      )}
    </article>
  );
};
