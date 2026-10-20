'use client';

import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleDashed,
  Clock3,
  Eye,
  ListChecks,
  LoaderCircle,
  PackageOpen,
  Search,
  ShoppingBasket,
  Truck,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { advanceOrderStatus } from '@/features/platform/fulfillment/actions';
import { formatFulfillmentPromise } from '@/features/platform/lib/format';
import {
  applyFulfillmentTransition,
  formatSubstitutionPreference,
  fulfillmentLaneIds,
  fulfillmentMethod,
  isPickupReady,
  nextFulfillmentTransition,
  transitionLabel,
  validDropTransition,
  type FulfillmentLaneId,
  type FulfillmentOrder,
  type FulfillmentSubstitution,
  type FulfillmentTransitionTarget,
} from '@/features/platform/fulfillment/lib/fulfillmentBoard';
import styles from './FulfillmentBoard.module.css';
import { FulfillmentActualsForm, FinalizeFulfillmentSaleButton, type SubstitutionProposalView } from './FulfillmentActualsForm';

interface FulfillmentBoardClientProps {
  /** Already searched, filtered and sorted on the server; the board keeps only drag and selection state. */
  lanes: Record<FulfillmentLaneId, FulfillmentOrder[]>;
  /** Matching orders per lane across every page. */
  laneTotals: Record<FulfillmentLaneId, number>;
  substitutions: FulfillmentSubstitution[];
  timeZone?: string;
  search: string;
  view: string;
  sort: string;
}

const BOARD_PATH = '/dashboard/platform/fulfillment';
function boardHref(next: { q?: string; view?: string; sort?: string }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) if (value && !(key === 'view' && value === 'all') && !(key === 'sort' && value === 'oldest')) query.set(key, value);
  const text = query.toString();
  return text ? `${BOARD_PATH}?${text}` : BOARD_PATH;
}

interface DragState {
  order: FulfillmentOrder;
  sourceLane: FulfillmentLaneId;
  overLane: FulfillmentLaneId | null;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  originLeft: number;
  originTop: number;
  left: number;
  top: number;
  width: number;
  height: number;
  settling: boolean;
}

const laneLabels: Record<FulfillmentLaneId, string> = {
  pending: 'Pending',
  picking: 'Picking',
  packed: 'Packed',
};

const laneHints: Record<FulfillmentLaneId, string> = {
  pending: 'Paid, not started',
  picking: 'Record actual goods',
  packed: 'Ready for hand-off',
};

const laneIcons = {
  pending: CircleDashed,
  picking: LoaderCircle,
  packed: CircleCheck,
};

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function laneAtPoint(x: number, y: number): FulfillmentLaneId | null {
  const element = document.elementsFromPoint(x, y).find((candidate) => candidate instanceof HTMLElement && candidate.dataset.laneId);
  const value = element instanceof HTMLElement ? element.dataset.laneId : undefined;
  return fulfillmentLaneIds.includes(value as FulfillmentLaneId) ? value as FulfillmentLaneId : null;
}

function springFlip(element: HTMLElement, from: DOMRect) {
  if (prefersReducedMotion()) return () => undefined;
  const to = element.getBoundingClientRect();
  let x = from.left - to.left;
  let y = from.top - to.top;
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return () => undefined;

  let vx = 0;
  let vy = 0;
  let frame = 0;
  let previous = performance.now();
  let cancelled = false;
  element.style.transition = 'none';
  element.style.transform = `translate3d(${x}px, ${y}px, 0)`;

  const tick = (now: number) => {
    if (cancelled) return;
    const elapsed = Math.min((now - previous) / 1000, 1 / 30);
    previous = now;
    const stiffness = 380;
    const damping = 28;
    vx += (-stiffness * x - damping * vx) * elapsed;
    vy += (-stiffness * y - damping * vy) * elapsed;
    x += vx * elapsed;
    y += vy * elapsed;
    element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (Math.abs(x) < 0.4 && Math.abs(y) < 0.4 && Math.abs(vx) < 0.4 && Math.abs(vy) < 0.4) {
      element.style.transform = '';
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    element.style.transform = '';
  };
}

function lineSummary(order: FulfillmentOrder) {
  if (!order.lineItems.length) return 'No line snapshots';
  return order.lineItems.slice(0, 2).map((item) => `${item.quantity}× ${item.title}`).join(' · ');
}

function orderStage(order: FulfillmentOrder): FulfillmentLaneId {
  return order.status === 'picking' ? 'picking' : order.status === 'packed' ? 'packed' : 'pending';
}

export default function FulfillmentBoardClient({ lanes: incomingLanes, laneTotals, substitutions, timeZone, search, view, sort }: FulfillmentBoardClientProps) {
  const router = useRouter();
  const [lanes, setLanes] = useState(incomingLanes);
  const [localSubstitutions, setLocalSubstitutions] = useState(substitutions);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [mobileLane, setMobileLane] = useState<FulfillmentLaneId>('pending');
  const [searchText, setSearchText] = useState(search);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [, startTransition] = useTransition();
  const dragRef = useRef<DragState | null>(null);
  const previousRects = useRef(new Map<string, DOMRect>());
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const flipCleanups = useRef(new Map<string, () => void>());
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef<HTMLElement | null>(null);
  const focusStageAfterRender = useRef(false);

  // Fresh server data after any successful action supersedes an earlier failure message.
  useEffect(() => { setLanes(incomingLanes); setError(null); }, [incomingLanes]);
  useEffect(() => setLocalSubstitutions(substitutions), [substitutions]);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => {
    if (!focusStageAfterRender.current) return;
    focusStageAfterRender.current = false;
    document.getElementById(`fulfillment-stage-tab-${mobileLane}`)?.focus();
  }, [mobileLane]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    flipCleanups.current.forEach((cleanup) => cleanup());
  }, []);

  const substitutionMap = useMemo(() => {
    const map = new Map<string, FulfillmentSubstitution>();
    localSubstitutions.forEach((entry) => {
      if (!map.has(entry.orderItem)) map.set(entry.orderItem, entry);
    });
    return map;
  }, [localSubstitutions]);

  const captureRects = useCallback(() => {
    const next = new Map<string, DOMRect>();
    cardRefs.current.forEach((element, id) => {
      if (element.isConnected) next.set(id, element.getBoundingClientRect());
    });
    previousRects.current = next;
  }, []);

  useLayoutEffect(() => {
    previousRects.current.forEach((rect, id) => {
      const element = cardRefs.current.get(id);
      if (!element?.isConnected) return;
      flipCleanups.current.get(id)?.();
      flipCleanups.current.set(id, springFlip(element, rect));
    });
    previousRects.current.clear();
  }, [drag?.overLane]);

  const filteredLanes = lanes;

  const selectedOrder = useMemo(
    () => fulfillmentLaneIds.flatMap((lane) => lanes[lane]).find((order) => order.id === selectedOrderId) || null,
    [lanes, selectedOrderId],
  );

  const restoreOrderFocus = useCallback((orderId: string) => {
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-order-id="${CSS.escape(orderId)}"]`);
      element?.focus();
    });
  }, []);

  const runTransition = useCallback(async (
    order: FulfillmentOrder,
    target: FulfillmentTransitionTarget,
    origin: 'drag' | 'button',
  ) => {
    setError(null);
    setMessage(null);
    setPendingOrderId(order.id);
    try {
      const result = await advanceOrderStatus({
        orderId: order.id,
        currentStatus: order.status,
        fulfillmentMethod: fulfillmentMethod(order),
        readyForPickup: isPickupReady(order),
      });
      if (!result.ok) throw new Error(`Order #${order.displayId} stayed in ${laneLabels[orderStage(order)]}: ${result.error}`);
      const updated = applyFulfillmentTransition(order, target);
      setLanes((current) => {
        const next = { ...current };
        const sourceLane = orderStage(order);
        const destinationLane = target === 'ready_for_pickup' ? 'packed' : target;
        next[sourceLane] = current[sourceLane].filter((item) => item.id !== order.id);
        next[destinationLane] = [...next[destinationLane].filter((item) => item.id !== order.id), updated];
        return next;
      });
      setMessage(`${origin === 'drag' ? 'Moved' : 'Updated'} order #${order.displayId}: ${transitionLabel(target)} complete.`);
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Order #${order.displayId} could not be updated. It returned to ${laneLabels[orderStage(order)]}.`);
      return false;
    } finally {
      setPendingOrderId(null);
      restoreOrderFocus(order.id);
    }
  }, [restoreOrderFocus, router]);

  const settleBack = useCallback((current: DragState, announce: string) => {
    setError(announce);
    setDrag({ ...current, left: current.originLeft, top: current.originTop, settling: true });
    settleTimer.current = setTimeout(() => setDrag(null), prefersReducedMotion() ? 0 : 270);
  }, []);

  const finishDrag = useCallback(async (event: PointerEvent) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const destination = laneAtPoint(event.clientX, event.clientY) || current.overLane;
    const target = destination ? validDropTransition(current.order, destination) : null;
    document.body.classList.remove('is-dragging');
    if (boardRef.current?.hasPointerCapture(current.pointerId)) {
      boardRef.current.releasePointerCapture(current.pointerId);
    }

    if (event.type === 'pointercancel') {
      settleBack(current, `Drag cancelled for order #${current.order.displayId}. No change was saved.`);
      return;
    }

    if (destination === current.sourceLane) {
      setDrag({ ...current, left: current.originLeft, top: current.originTop, settling: true });
      settleTimer.current = setTimeout(() => setDrag(null), prefersReducedMotion() ? 0 : 180);
      return;
    }

    if (!destination || !target) {
      settleBack(current, `Order #${current.order.displayId} can only move one authorized stage forward. No change was saved.`);
      return;
    }

    const slot = document.querySelector<HTMLElement>(`[data-placeholder-lane="${destination}"]`);
    const rect = slot?.getBoundingClientRect();
    setDrag({
      ...current,
      overLane: destination,
      left: rect?.left ?? current.left,
      top: rect?.top ?? current.top,
      settling: true,
    });

    const succeeded = await runTransition(current.order, target, 'drag');
    if (succeeded) {
      settleTimer.current = setTimeout(() => setDrag(null), prefersReducedMotion() ? 0 : 180);
    } else {
      settleBack(current, `Order #${current.order.displayId} changed or the server rejected the transition. It returned to ${laneLabels[current.sourceLane]}.`);
    }
  }, [runTransition, settleBack]);

  useEffect(() => {
    if (!drag || drag.settling) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.settling || event.pointerId !== current.pointerId) return;
      const overLane = laneAtPoint(event.clientX, event.clientY);
      if (overLane !== current.overLane) captureRects();
      setDrag({
        ...current,
        overLane,
        left: event.clientX - current.offsetX,
        top: event.clientY - current.offsetY,
      });
    };
    const finish = (event: PointerEvent) => { void finishDrag(event); };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [captureRects, drag, finishDrag]);

  const beginDrag = (order: FulfillmentOrder, sourceLane: FulfillmentLaneId, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || drag || pendingOrderId || !validDropTransition(order, sourceLane === 'pending' ? 'picking' : sourceLane === 'picking' ? 'packed' : 'packed')) return;
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select, label')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.preventDefault();
    boardRef.current?.setPointerCapture(event.pointerId);
    document.body.classList.add('is-dragging');
    setError(null);
    setMessage(null);
    setDrag({
      order,
      sourceLane,
      overLane: sourceLane,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      originLeft: rect.left,
      originTop: rect.top,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      settling: false,
    });
  };

  const handleStageKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, lane: FulfillmentLaneId) => {
    const currentIndex = fulfillmentLaneIds.indexOf(lane);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % fulfillmentLaneIds.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + fulfillmentLaneIds.length) % fulfillmentLaneIds.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = fulfillmentLaneIds.length - 1;
    else return;
    event.preventDefault();
    const nextLane = fulfillmentLaneIds[nextIndex];
    focusStageAfterRender.current = true;
    setMobileLane(nextLane);
  };

  const runButtonTransition = (order: FulfillmentOrder) => {
    const target = nextFulfillmentTransition(order);
    if (!target) return;
    startTransition(() => { void runTransition(order, target, 'button'); });
  };

  const renderCard = (order: FulfillmentOrder, lane: FulfillmentLaneId, ghost = false) => {
    const MethodIcon = fulfillmentMethod(order) === 'pickup' ? ShoppingBasket : Truck;
    const target = nextFulfillmentTransition(order);
    const label = transitionLabel(target);
    const hasReview = order.lineItems.some((item) => {
      const entry = substitutionMap.get(item.id);
      return entry && !entry.customerApproved;
    });
    const isPending = pendingOrderId === order.id;
    const cardClass = `${styles.card} ${ghost ? `${styles.cardGhost} ${styles.dragOverlay}` : ''}`;

    return (
      <article
        key={`${ghost ? 'ghost:' : ''}${order.id}`}
        ref={ghost ? undefined : (element) => {
          if (element) cardRefs.current.set(order.id, element);
          else cardRefs.current.delete(order.id);
        }}
        className={cardClass}
        data-order-id={ghost ? undefined : order.id}
        data-selected={selectedOrderId === order.id}
        data-drag-source={!ghost && drag?.order.id === order.id}
        data-pending={isPending}
        data-settling={ghost ? drag?.settling : undefined}
        aria-grabbed={!ghost && drag?.order.id === order.id}
        aria-label={ghost ? undefined : `Order #${order.displayId}, ${laneLabels[lane]}, ${order.lineItems.length} lines, ${fulfillmentMethod(order)}`}
        aria-busy={isPending || undefined}
        tabIndex={ghost ? -1 : 0}
        onPointerDown={ghost ? undefined : (event) => beginDrag(order, lane, event)}
        onKeyDown={ghost ? undefined : (event) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          setSelectedOrderId(order.id);
        }}
        style={ghost && drag ? {
          width: drag.width,
          height: drag.height,
          transform: `translate3d(${drag.left}px, ${drag.top}px, 0) scale(${drag.settling ? 1 : 1.03})`,
        } : undefined}
      >
        <div className={styles.cardTop}>
          <div className={styles.cardTitle}>#{order.displayId}</div>
          <span className={styles.method}><MethodIcon aria-hidden="true" />{fulfillmentMethod(order)}</span>
        </div>
        <p className={styles.cardEmail}>{order.email}</p>
        <p className={styles.cardDescription}>{lineSummary(order)}{order.lineItems.length > 2 ? ` +${order.lineItems.length - 2} more` : ''}</p>
        <footer className={styles.cardFooter}>
          <span className={styles.meta} data-tone={hasReview ? 'review' : undefined} title={formatSubstitutionPreference(order.substitutionPreference)}>
            {hasReview ? <Clock3 aria-hidden="true" /> : <Check aria-hidden="true" />}
            {order.lineItems.length} lines{hasReview ? ' · review' : ''}
          </span>
          <span className={styles.meta}>{formatFulfillmentPromise(order, timeZone, 'No window')}</span>
          {!ghost ? (
            <button className={styles.iconButton} type="button" aria-label={`Inspect order #${order.displayId}${label ? ` and use ${label}` : ''}`} onClick={() => setSelectedOrderId(order.id)}>
              <Eye width={14} height={14} aria-hidden="true" />
            </button>
          ) : null}
        </footer>
      </article>
    );
  };

  const nextLabel = selectedOrder ? transitionLabel(nextFulfillmentTransition(selectedOrder)) : null;

  return (
    <section ref={boardRef} className={styles.shell} aria-label="Pick and pack fulfillment board">
      <form className={styles.toolbar} role="search" onSubmit={(event) => { event.preventDefault(); router.push(boardHref({ q: searchText.trim(), view, sort })); }}>
        <label className={styles.searchWrap}>
          <span className="sr-only">Search the whole fulfillment queue</span>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <input className={`${styles.control} ${styles.searchControl}`} type="search" name="q" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Order, customer, product, or SKU — press Enter" />
        </label>
        <div className={styles.filterGroup} role="group" aria-label="Fulfillment filter">
          {[
            ['all', 'All work'], ['pickup', 'Pickup'], ['delivery', 'Delivery'], ['substitutions', 'Substitutions'],
          ].map(([value, label]) => <button key={value} type="button" className={styles.filterButton} data-active={view === value} aria-pressed={view === value} onClick={() => router.push(boardHref({ q: search, view: value, sort }))}>{label}</button>)}
        </div>
        <label>
          <span className="sr-only">Sort fulfillment queue</span>
          <select className={styles.control} value={sort} onChange={(event) => router.push(boardHref({ q: search, view, sort: event.target.value }))}>
            <option value="oldest">Oldest order first</option>
            <option value="newest">Newest order first</option>
            <option value="items">Most lines first</option>
          </select>
        </label>
      </form>

      <div className={`${styles.filterGroup} ${styles.stageSwitcher}`} role="tablist" aria-label="Fulfillment stage" aria-orientation="horizontal">
        {fulfillmentLaneIds.map((lane) => (
          <button
            key={lane}
            id={`fulfillment-stage-tab-${lane}`}
            role="tab"
            type="button"
            className={styles.stageButton}
            data-active={mobileLane === lane}
            aria-selected={mobileLane === lane}
            aria-controls={`fulfillment-stage-panel-${lane}`}
            tabIndex={mobileLane === lane ? 0 : -1}
            onClick={() => setMobileLane(lane)}
            onKeyDown={(event) => handleStageKeyDown(event, lane)}
          >
            {laneLabels[lane]} · {laneTotals[lane]}
          </button>
        ))}
      </div>

      <div className={styles.feedback}>
        {message ? <div className={styles.status} role="status" aria-live="polite">{message}</div> : null}
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
      </div>

      <div className={styles.workspace} data-inspecting={Boolean(selectedOrder)}>
        <div className={styles.board}>
          {fulfillmentLaneIds.map((lane) => {
            const LaneIcon = laneIcons[lane];
            const dropTransition = drag ? validDropTransition(drag.order, lane) : null;
            const dropState = drag?.overLane === lane ? (dropTransition ? 'valid' : 'invalid') : undefined;
            return (
              <section
                key={lane}
                id={`fulfillment-stage-panel-${lane}`}
                role="tabpanel"
                className={styles.lane}
                data-mobile-active={mobileLane === lane}
                aria-labelledby={`fulfillment-stage-tab-${lane} fulfillment-lane-${lane}`}
              >
                <header className={styles.laneHeader}>
                  <LaneIcon className={styles.laneIcon} aria-hidden="true" />
                  <h3 id={`fulfillment-lane-${lane}`}>{laneLabels[lane]}</h3>
                  <span className={styles.laneHint}>{laneHints[lane]}</span>
                  <span className={styles.laneCount} aria-label={`${laneTotals[lane]} orders`}>{laneTotals[lane]}</span>
                </header>
                <div className={styles.laneWell} data-lane-id={lane} data-drop={dropState}>
                  {filteredLanes[lane].map((order) => drag?.order.id === order.id ? null : renderCard(order, lane))}
                  {drag?.overLane === lane ? <div className={styles.placeholder} data-placeholder-lane={lane} aria-hidden="true" /> : null}
                  {filteredLanes[lane].length === 0 && drag?.overLane !== lane ? (
                    <div className={styles.sleeping}>
                      <div>
                        <span className={styles.sleepIconWrap} aria-hidden="true"><PackageOpen /></span>
                        <strong>No {laneLabels[lane].toLowerCase()} orders</strong>
                        <p>{search || view !== 'all' ? 'No orders match the current queue view.' : `Orders appear here when they reach ${laneLabels[lane].toLowerCase()}.`}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        {selectedOrder ? (
          <aside className={styles.inspector} aria-labelledby="fulfillment-order-inspector-title">
            <header className={styles.inspectorHeader}>
              <div className={styles.inspectorTitle}>
                <div>
                  <h3 id="fulfillment-order-inspector-title">Order #{selectedOrder.displayId}</h3>
                  <p>{selectedOrder.email}</p>
                  <p>{formatFulfillmentPromise(selectedOrder, timeZone)} · {formatSubstitutionPreference(selectedOrder.substitutionPreference)}</p>
                </div>
                <button className={styles.iconButton} type="button" aria-label="Close order details" onClick={() => { setSelectedOrderId(null); restoreOrderFocus(selectedOrder.id); }}><X width={15} height={15} aria-hidden="true" /></button>
              </div>
              <div className={styles.inspectorActions}>
                {nextLabel ? (
                  <button className={styles.cardButton} data-variant="primary" type="button" disabled={pendingOrderId === selectedOrder.id} onClick={() => runButtonTransition(selectedOrder)}>
                    {pendingOrderId === selectedOrder.id ? 'Updating…' : nextLabel}<ArrowRight width={13} height={13} aria-hidden="true" />
                  </button>
                ) : null}
                {selectedOrder.status === 'picking' && <FinalizeFulfillmentSaleButton orderId={selectedOrder.id} finalized={(selectedOrder.metadata?.finalSale as { status?: string } | undefined)?.status === 'finalized'} />}
              </div>
            </header>
            <div className={styles.lineList}>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ListChecks className="size-3.5" aria-hidden="true" />{selectedOrder.lineItems.length} lines to resolve</p>
              {selectedOrder.lineItems.map((item) => {
                const existing = substitutionMap.get(item.id);
                const proposal = ((selectedOrder.metadata?.substitutionProposals as Record<string, SubstitutionProposalView> | undefined) || {})[item.id] || null;
                const tone = existing?.customerApproved || proposal?.status === 'approved' ? 'approved' : existing || proposal ? 'review' : 'none';
                const state = proposal?.status === 'approved' ? 'Customer approved replacement' : proposal?.status === 'rejected' ? 'Customer declined replacement' : proposal ? 'Waiting for customer' : existing?.customerApproved ? 'Approved substitute' : existing ? 'Needs customer review' : 'No substitution';
                return (
                  <article className={styles.line} key={item.id}>
                    <div>
                      <p className={styles.lineTitle}>{item.quantity}× {item.title}</p>
                      <p className={styles.lineMeta}>SKU {item.sku || 'not recorded'}</p>
                      <span className={styles.substitutionState} data-tone={tone}>{state}</span>
                    </div>
                    <FulfillmentActualsForm key={`${item.id}:${proposal?.id || 'none'}:${proposal?.status || ''}`} orderId={selectedOrder.id} email={selectedOrder.email} status={selectedOrder.status} preference={selectedOrder.substitutionPreference} item={item} proposal={proposal} />
                  </article>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>
      {drag ? renderCard(drag.order, drag.sourceLane, true) : null}
    </section>
  );
}
