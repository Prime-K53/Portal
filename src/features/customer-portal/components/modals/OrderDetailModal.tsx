import React, { useId, useState } from 'react';
import { Calendar, Loader2, Mail, MapPin, Package, Phone, RotateCcw, Truck, X } from 'lucide-react';
import { AccountProfile, Order } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { canReorderOrder } from '../../utils/orderRequest';
import { useOfficialDocument } from '../../hooks/useOfficialDocument';
import { OfficialDocumentPreview } from '../OfficialDocumentPreview';
import { DocumentSheet } from '../document/DocumentSheet';
import { DocumentLineItems } from '../document/DocumentLineItems';
import { OfficialDocumentActions } from '../document/OfficialDocumentActions';

interface OrderDetailModalProps {
  order: Order | null;
  onClose: () => void;
  onReorder?: (order: Order) => Promise<unknown>;
  /** Signed-in customer profile — used only for the read-only "Customer" card. */
  customer?: AccountProfile | null;
}

/** Uniform blue pill (matches the Orders list) — label stays the capitalized ERP status. */
const orderStatusPill = (status: string): string => `bg-blue-100 text-blue-800 border-blue-200`;

/** The ERP serves the official order/acceptance PDF once the order leaves draft/cancelled. */
const ORDER_PDF_BLOCKED_STATUSES = new Set(['draft', 'cancelled']);

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  onClose,
  onReorder,
  customer,
}) => {
  const titleId = useId();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reordering, setReordering] = useState(false);

  const orderPdfAvailable = order !== null && !ORDER_PDF_BLOCKED_STATUSES.has(order.status);
  const officialDocument = useOfficialDocument(
    order ? { kind: 'order', id: order.id } : null,
    order !== null && orderPdfAvailable
  );

  if (!order) return null;

  const statusLabel = order.status.charAt(0).toUpperCase() + order.status.slice(1);
  const reorderable = canReorderOrder(order);
  const customerName = customer?.companyName || customer?.customerName || customer?.fullName;

  const handleReorder = () => {
    if (!onReorder || reordering) return;
    setReordering(true);
    onReorder(order)
      .then(() => onClose())
      .catch(() => {
        // The shared action-error banner (parent) already explains the failure.
      })
      .finally(() => setReordering(false));
  };

  const renderDeliveryDate = (value: string): string => {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : formatDate(value);
  };

  return (
    <DocumentSheet titleId={titleId} documentType="Order" onClose={onClose}>
      {/* ── Document identity ─────────────────────────────────────────────── */}
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Sales Order</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          id={titleId}
          className="font-mono text-[26px] font-black leading-none tracking-tight text-slate-900 sm:text-3xl"
        >
          {order.orderNumber}
        </h1>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${orderStatusPill(order.status)}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
        <li className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          Placed {formatDate(order.date)}
        </li>
        {order.estimatedDelivery && (
          <li className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            Est. delivery {renderDeliveryDate(order.estimatedDelivery)}
          </li>
        )}
        {order.associatedInvoiceId && (
          <li className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span className="font-bold uppercase tracking-wide text-slate-400">Invoice</span>
            <span className="font-bold text-slate-600">{order.associatedInvoiceId}</span>
          </li>
        )}
      </ul>

      {/* ── Amount summary + primary action ──────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Order Total</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-900 currency-display sm:text-4xl">
              {formatCurrency(order.totalAmount)}
            </p>
            <p className="mt-1.5 text-[11.5px] font-medium text-slate-500">
              {order.items.length} line item{order.items.length !== 1 ? 's' : ''}
            </p>
          </div>

          {reorderable && (
            <div className="flex shrink-0 items-center justify-start sm:justify-end">
              <button
                type="button"
                onClick={handleReorder}
                disabled={reordering}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-extrabold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                title="Re-submit this order through the ERP reorder pipeline"
              >
                {reordering ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Reorder 1-Click
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Customer ─────────────────────────────────────────────────────── */}
      {customerName && (
        <section aria-label="Customer" className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Customer</h2>
          <p className="mt-1.5 text-[15px] font-extrabold text-slate-900">{customerName}</p>
          <ul className="mt-2.5 space-y-1.5 text-xs font-medium text-slate-500">
            {customer?.address && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{customer.address}</span>
              </li>
            )}
            {customer?.email && (
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{customer.email}</span>
              </li>
            )}
            {customer?.phone && (
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{customer.phone}</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ── Delivery address ─────────────────────────────────────────────── */}
      {order.deliveryAddress && (
        <section aria-label="Delivery address" className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            <Truck className="h-3.5 w-3.5" aria-hidden="true" />
            Delivery Address
          </h2>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-700">{order.deliveryAddress}</p>
        </section>
      )}

      {/* ── Line items ───────────────────────────────────────────────────── */}
      <div className="mt-6">
        <DocumentLineItems
          label="Order Items"
          items={order.items.map((item, idx) => ({
            id: `${order.id}-${idx}`,
            description: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          }))}
          emptyMessage="No line items are available for this order."
        />
      </div>

      {/* ── Totals ───────────────────────────────────────────────────────── */}
      <div className="mt-6 flex justify-end">
        <dl className="w-full max-w-sm space-y-1.5 rounded-2xl border border-slate-200 bg-white p-4 text-xs sm:text-[13px]">
          {order.paymentMethod && (
            <div className="flex items-baseline justify-between gap-4 text-slate-600">
              <dt className="font-medium">Payment Method</dt>
              <dd className="text-right font-bold text-slate-900">{order.paymentMethod}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-1.5 text-slate-900">
            <dt className="font-extrabold">Total</dt>
            <dd className="text-base font-black finance-nums">{formatCurrency(order.totalAmount)}</dd>
          </div>
        </dl>
      </div>

      {/* ── Official document (ERP order acceptance PDF) ─────────────────── */}
      {orderPdfAvailable && (
        <div className="mt-6">
          <OfficialDocumentActions
            state={officialDocument}
            kindLabel="Order"
            onViewPdf={() => {
              if (!officialDocument.document) return;
              setPreviewOpen(true);
            }}
          />
        </div>
      )}

      {/* ── Official PDF preview overlay ─────────────────────────────────── */}
      {previewOpen && officialDocument.document && (
        <div className="fixed inset-0 z-[70] overflow-hidden bg-slate-900/70 backdrop-blur-xs animate-fade-in">
          <div className="mx-auto flex h-full w-full flex-col sm:my-5 sm:h-[calc(100dvh-2.5rem)] sm:max-w-5xl sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl">
            <OfficialDocumentPreview
              blob={officialDocument.document.blob}
              filename={officialDocument.document.filename}
              title={`Official ERP Order ${order.orderNumber}`}
              subtitle="Tap a page to zoom · swipe to turn pages"
            />
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="absolute bottom-4 right-4 z-10 rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-md transition hover:bg-white"
              aria-label="Close PDF preview"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </DocumentSheet>
  );
};
