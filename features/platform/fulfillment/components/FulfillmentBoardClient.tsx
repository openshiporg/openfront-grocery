'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleDashed,
  Clock3,
  Eye,
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
import {
  applyFulfillmentTransition,
  formatSubstitutionPreference,
  fulfillmentLaneIds,
  fulfillmentMethod,
  isPickupReady,
  nextFulfillmentTransition,
  stageProgress,
  transitionLabel,
  validDropTransition,
  type FulfillmentLaneId,
  type FulfillmentOrder,
  type FulfillmentSubstitution,
  type FulfillmentTransitionTarget,
} from '@/features/platform/fulfillment/lib/fulfillmentBoard';
import styles from './FulfillmentBoard.module.css';
import { FulfillmentActualsForm, FinalizeFulfillmentSaleButton } from './FulfillmentActualsForm';

interface FulfillmentBoardClientProps {
  lanes: Record<FulfillmentLaneId, FulfillmentOrder[]>;
  substitutions: FulfillmentSubstitution[];
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

export default function FulfillmentBoardClient({ lanes: incomingLanes, substitutions }: FulfillmentBoardClientProps) {
  const router = useRouter();
  const [lanes, setLanes] = useState(incomingLanes);
  const [localSubstitutions, setLocalSubstitutions] = useState(substitutions);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [mobileLane, setMobileLane] = useState<FulfillmentLaneId>('pending');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('all');
  const [sort, setSort] = useState('oldest');
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

  useEffect(() => setLanes(incomingLanes), [incomingLanes]);
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

  const filteredLanes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const next = {} as Record<FulfillmentLaneId, FulfillmentOrder[]>;
    fulfillmentLaneIds.forEach((lane) => {
      next[lane] = [...lanes[lane]]
        .filter((order) => {
          const method = fulfillmentMethod(order);
          const hasSubstitution = order.lineItems.some((item) => substitutionMap.has(item.id));
          const matchesQuery = !query
            || String(order.displayId).includes(query)
            || order.email.toLowerCase().includes(query)
            || order.lineItems.some((item) => item.title.toLowerCase().includes(query) || item.sku?.toLowerCase().includes(query));
          return matchesQuery && (view === 'all' || view === method || (view === 'substitutions' && hasSubstitution));
        })
        .sort((a, b) => sort === 'newest' ? b.displayId - a.displayId : sort === 'items' ? b.lineItems.length - a.lineItems.length : a.displayId - b.displayId);
    });
    return next;
  }, [lanes, search, sort, substitutionMap, view]);

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
      await advanceOrderStatus({
        orderId: order.id,
        currentStatus: order.status,
        fulfillmentMethod: fulfillmentMethod(order),
        readyForPickup: isPickupReady(order),
      });
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
        style={ghost && drag ? {
          width: drag.width,
          height: drag.height,
          transform: `translate3d(${drag.left}px, ${drag.top}px, 0) scale(${drag.settling ? 1 : 1.03})`,
        } : undefined}
      >
        <div className={styles.cardTop}>
          <div className={styles.cardTitle}>Order #{order.displayId}</div>
          <span className={styles.method}><MethodIcon aria-hidden="true" />{fulfillmentMethod(order)}</span>
        </div>
        <p className={styles.cardDescription}>{order.email} · {order.deliveryTimeWindow || 'Window not recorded'}<br />{lineSummary(order)}</p>
        <footer className={styles.cardFooter}>
          <span className={styles.meta} title={formatSubstitutionPreference(order.substitutionPreference)}>
            {hasReview ? <Clock3 aria-hidden="true" /> : <Check aria-hidden="true" />}
            {order.lineItems.length} lines
          </span>
          <span className={styles.progress} aria-label={`${laneLabels[lane]} stage progress`}>
            <span style={{ width: `${stageProgress(lane) * 100}%` }} />
          </span>
          {!ghost ? (
            <>
              <button className={styles.iconButton} type="button" aria-label={`Inspect order #${order.displayId}${label ? ` and use ${label}` : ''}`} onClick={() => setSelectedOrderId(order.id)}>
                <Eye width={13} height={13} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </footer>
      </article>
    );
  };

  return (
    <section ref={boardRef} className={styles.shell} aria-label="Pick and pack fulfillment board">
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.mark} aria-hidden="true"><span /><span /><span /><span /></span>
            <div className={styles.heading}>
              <h2>Juniper fulfillment</h2>
              <p>Move paid grocery orders through authorized pick and pack stages.</p>
            </div>
          </div>
          <nav className={styles.nav} aria-label="Fulfillment destinations">
            <Link className={styles.navLink} href="/dashboard/platform/orders">Orders</Link>
            <Link className={styles.navLink} href="/dashboard/platform/fulfillment" data-current="true" aria-current="page">Pick &amp; pack</Link>
            <Link className={styles.navLink} href="/dashboard/platform/delivery">Delivery</Link>
            <Link className={styles.navLink} href="/dashboard/platform/pickup">Pickup</Link>
          </nav>
        </header>

        <div className={styles.toolbar} role="search">
          <label className={styles.searchWrap}>
            <span className="sr-only">Search fulfillment queue</span>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input className={`${styles.control} ${styles.searchControl}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, customer, product, or SKU" />
          </label>
          <div className={styles.filterGroup} aria-label="Fulfillment filter">
            {[
              ['all', 'All work'], ['pickup', 'Pickup'], ['delivery', 'Delivery'], ['substitutions', 'Substitutions'],
            ].map(([value, label]) => <button key={value} type="button" className={styles.filterButton} data-active={view === value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}
          </div>
          <label>
            <span className="sr-only">Sort fulfillment queue</span>
            <select className={styles.control} value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="oldest">Oldest order first</option>
              <option value="newest">Newest order first</option>
              <option value="items">Most lines first</option>
            </select>
          </label>
        </div>

        <div className={styles.stageSwitcher} role="tablist" aria-label="Fulfillment stage" aria-orientation="horizontal">
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
              {laneLabels[lane]} · {filteredLanes[lane].length}
            </button>
          ))}
        </div>

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
                  <span className={styles.laneCount} aria-label={`${filteredLanes[lane].length} orders`}>{filteredLanes[lane].length}</span>
                </header>
                <div className={styles.laneWell} data-lane-id={lane} data-drop={dropState}>
                  {filteredLanes[lane].map((order) => drag?.order.id === order.id ? null : renderCard(order, lane))}
                  {drag?.overLane === lane ? <div className={styles.placeholder} data-placeholder-lane={lane} aria-hidden="true" /> : null}
                  {filteredLanes[lane].length === 0 && drag?.overLane !== lane ? (
                    <div className={styles.sleeping}>
                      <div>
                        <span className={styles.sleepIconWrap} aria-hidden="true"><PackageOpen /><span className={styles.z}>z</span><span className={styles.z}>z</span></span>
                        <strong>No {laneLabels[lane].toLowerCase()} orders</strong>
                        <p>{search || view !== 'all' ? 'No orders match the current queue view.' : `Orders will rest here when they reach ${laneLabels[lane].toLowerCase()}.`}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        <div className={styles.feedback}>
          {message ? <div className={styles.status} role="status" aria-live="polite">{message}</div> : null}
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
        </div>

        {selectedOrder ? (
          <aside className={styles.inspector} aria-labelledby="fulfillment-order-inspector-title">
            <header className={styles.inspectorHeader}>
              <div>
                <h3 id="fulfillment-order-inspector-title">Order #{selectedOrder.displayId} lines</h3>
                <p>{selectedOrder.email} · {selectedOrder.deliveryTimeWindow || 'Window not recorded'} · {formatSubstitutionPreference(selectedOrder.substitutionPreference)}</p>
              </div>
              <div className={styles.filterGroup}>
                {transitionLabel(nextFulfillmentTransition(selectedOrder)) ? (
                  <button className={styles.cardButton} type="button" disabled={pendingOrderId === selectedOrder.id} onClick={() => runButtonTransition(selectedOrder)}>
                    {pendingOrderId === selectedOrder.id ? 'Updating…' : transitionLabel(nextFulfillmentTransition(selectedOrder))}<ArrowRight width={12} height={12} aria-hidden="true" />
                  </button>
                ) : null}
                <button className={styles.iconButton} type="button" aria-label="Close order details" onClick={() => { setSelectedOrderId(null); restoreOrderFocus(selectedOrder.id); }}><X width={14} height={14} aria-hidden="true" /></button>
              </div>
            </header>
            {selectedOrder.status === 'picking' && <FinalizeFulfillmentSaleButton orderId={selectedOrder.id} finalized={(selectedOrder.metadata?.finalSale as { status?: string } | undefined)?.status === 'finalized'} />}
            <div className={styles.lineList}>
              {selectedOrder.lineItems.map((item) => {
                const existing = substitutionMap.get(item.id);
                const tone = existing?.customerApproved ? 'approved' : existing ? 'review' : 'none';
                const state = existing?.customerApproved ? 'Approved substitute' : existing ? 'Needs customer review' : 'No substitution';
                return (
                  <article className={styles.line} key={item.id}>
                    <div>
                      <p className={styles.lineTitle}>{item.quantity}× {item.title}</p>
                      <p className={styles.lineMeta}>SKU {item.sku || 'not recorded'}</p>
                      <span className={styles.substitutionState} data-tone={tone}>{state}</span>
                    </div>
                    <FulfillmentActualsForm orderId={selectedOrder.id} email={selectedOrder.email} status={selectedOrder.status} preference={selectedOrder.substitutionPreference} item={item} />
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
