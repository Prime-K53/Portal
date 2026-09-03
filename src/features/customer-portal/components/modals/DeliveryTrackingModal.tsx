import React, { useId, useState } from 'react';
import {
  Clock,
  Download,
  Loader2,
  MapPin,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  User,
} from 'lucide-react';
import { DeliveryNotification, DeliveryStatus } from '../../types';
import { formatDateTime, getDeliveryStatusBadge } from '../../utils/formatters';
import { downloadOfficialDocument } from '../../utils/officialDocument';
import { DocumentSheet } from '../document/DocumentSheet';
import { DocumentOfficialStrip } from '../document/DocumentOfficialStrip';

interface DeliveryTrackingModalProps {
  delivery: DeliveryNotification | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DeliveryTrackingModal: React.FC<DeliveryTrackingModalProps> = ({
  delivery,
  isOpen,
  onClose,
}) => {
  const titleId = useId();

  // Official ERP delivery-note PDF download. The ERP endpoint resolves the id
  // as a delivery-note id OR an order id linked to one — try the order link
  // first (what the portal shipment carries), then the raw record id.
  const [noteDownloading, setNoteDownloading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const handleDownloadDeliveryNote = async () => {
    if (!delivery) return;
    setNoteError(null);
    setNoteDownloading(true);
    try {
      try {
        await downloadOfficialDocument('delivery-note', delivery.orderId || delivery.id);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404 && delivery.orderId !== delivery.id) {
          await downloadOfficialDocument('delivery-note', delivery.id);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setNoteDownloading(false);
    }
  };

  if (!isOpen || !delivery) return null;

  const steps: { key: DeliveryStatus; title: string; desc: string }[] = [
    { key: 'order_placed', title: 'Order Placed', desc: 'Order confirmed and generated in ERP system' },
    { key: 'dispatched', title: 'Dispatched', desc: 'Items picked, packed and departed logistics hub via Express Freight' },
    { key: 'out_for_delivery', title: 'Out for Delivery', desc: 'In transit with local delivery courier to your address' },
    { key: 'delivered', title: 'Delivered & Signed', desc: 'Handed over and verified at receiving dock by customer' },
  ];

  const isDelayed = delivery.status === 'delayed';
  const getStepIndex = (status: DeliveryStatus) => {
    switch (status) {
      case 'order_placed': return 0;
      case 'dispatched': return 1;
      case 'out_for_delivery': return 2;
      case 'delivered': return 3;
      // 'delayed' is a STATUS overlay, not a step — keep the last completed
      // step's index so the timeline does not lie about progress. The
      // delayed state is surfaced separately as a banner + badge.
      case 'delayed': return 2;
      case 'processing': return 1;
      default: return 2;
    }
  };

  const currentStepIdx = getStepIndex(delivery.status);
  const statusInfo = getDeliveryStatusBadge(delivery.status);
  const canDownloadNote = delivery.status === 'delivered';

  return (
    <DocumentSheet titleId={titleId} documentType="Delivery" onClose={onClose}>
      {/* ── Document identity ─────────────────────────────────────────────── */}
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Delivery</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          id={titleId}
          className="font-mono text-[26px] font-black leading-none tracking-tight text-slate-900 sm:text-3xl"
        >
          {delivery.trackingNumber || delivery.id}
        </h1>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${statusInfo.bg}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {statusInfo.label}
        </span>
      </div>

      <p className="mt-2 text-[15px] font-extrabold text-slate-900">{delivery.title}</p>

      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
        <li className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          Order #{delivery.orderId}
        </li>
        {delivery.timestamp && (
          <li className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            Updated {formatDateTime(delivery.timestamp)}
          </li>
        )}
      </ul>

      {/* ── Estimated arrival + delayed notice ───────────────────────────── */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200/80 bg-blue-50 p-3.5 sm:p-4">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <div>
              <span className="block text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                Estimated Arrival
              </span>
              <span className="text-sm font-extrabold text-blue-700">
                {delivery.estimatedArrival || 'Scheduled Delivery'}
              </span>
            </div>
          </div>
        </div>

        {delivery.itemsSummary && (
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-xs text-slate-600">
            <span className="font-bold uppercase tracking-wide text-slate-400 block mb-1">Items</span>
            <p className="font-medium leading-relaxed">{delivery.itemsSummary}</p>
          </div>
        )}

        {isDelayed && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3"
          >
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <div className="text-xs leading-relaxed text-rose-900">
              <strong className="mb-0.5 block font-extrabold">Shipment delayed</strong>
              The carrier has reported a delay. The progress timeline below shows the last completed
              step; the package has not yet moved to the next stage.
            </div>
          </div>
        )}
      </div>

      {/* ── Live progress timeline ───────────────────────────────────────── */}
      <div className="mt-6">
        <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-900">
          Live Progress Timeline
        </h2>
        <div className="relative space-y-4 pl-6 before:absolute before:bottom-2 before:left-2.5 before:top-2 before:w-0.5 before:bg-slate-200">
          {steps.map((step, idx) => {
            const isDone = idx <= currentStepIdx;
            const isCurrent = idx === currentStepIdx;

            return (
              <div key={step.key} className="relative flex items-start gap-3">
                <div
                  className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11.5px] font-bold transition ${
                    isCurrent
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                      : isDone
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-300 bg-slate-200 text-slate-500'
                  }`}
                  aria-hidden="true"
                >
                  {isDone ? '✓' : idx + 1}
                </div>
                <div>
                  <h3
                    className={`text-xs font-bold ${
                      isCurrent ? 'text-blue-700' : isDone ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {step.title}
                  </h3>
                  <p className="text-[12.5px] leading-relaxed text-slate-500">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Delivery address ─────────────────────────────────────────────── */}
      {delivery.deliveryAddress && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3.5">
          <span className="block text-[11.5px] font-bold uppercase tracking-wide text-slate-400">
            Delivery Address
          </span>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-700">
            {delivery.deliveryAddress}
          </p>
        </div>
      )}

      {/* ── Courier driver details ───────────────────────────────────────── */}
      {delivery.driverName && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <User className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <span className="block text-[11.5px] font-bold uppercase tracking-wider text-slate-400">
                Assigned Courier
              </span>
              <strong className="text-xs font-extrabold text-slate-900">{delivery.driverName}</strong>
              <span className="block text-[11.5px] text-slate-500">{delivery.vehicleNumber}</span>
            </div>
          </div>

          {delivery.driverPhone && (
            <div className="flex gap-2">
              <a
                href={`tel:${delivery.driverPhone}`}
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-700 transition hover:bg-emerald-100"
                title="Call Driver"
              >
                <PhoneCall className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href={`sms:${delivery.driverPhone}`}
                className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700 transition hover:bg-blue-100"
                title="Text Driver"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Proof of delivery ────────────────────────────────────────────── */}
      {delivery.proofOfDelivery && (
        <div className="mt-5 space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-800">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Verified Proof of Delivery</span>
          </div>
          <p className="text-slate-700">
            Signed by: <strong className="text-slate-900">{delivery.proofOfDelivery.signedBy}</strong>
          </p>
          <p className="text-[12.5px] text-slate-500">
            Delivered at: {formatDateTime(delivery.proofOfDelivery.deliveredAt)}
          </p>
        </div>
      )}

      {/* ── Official document (ERP delivery-note PDF) ────────────────────── */}
      <div className="mt-6">
        <DocumentOfficialStrip
          kindLabel="Delivery Note"
          notice={
            noteError ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11.5px] font-bold text-rose-700">
                <p className="min-w-0">{noteError}</p>
              </div>
            ) : undefined
          }
          controls={
            <button
              type="button"
              onClick={() => {
                void handleDownloadDeliveryNote();
              }}
              disabled={noteDownloading || !canDownloadNote}
              title={
                !canDownloadNote
                  ? 'The delivery note is available once your order is delivered and signed'
                  : noteDownloading
                    ? 'Downloading official ERP delivery note…'
                    : 'Download the official ERP delivery note (PDF)'
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {noteDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Download Official Delivery Note</span>
            </button>
          }
        />
      </div>
    </DocumentSheet>
  );
};
