import React, { useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  MessageSquare,
  Package,
  PhoneCall,
  ShieldCheck,
  Truck,
  User,
  X,
} from 'lucide-react';
import { DeliveryNotification, DeliveryStatus } from '../../types';
import { formatDateTime, getDeliveryStatusBadge } from '../../utils/formatters';
import { downloadOfficialDocument } from '../../utils/officialDocument';
import { useFocusTrap } from '../../utils/useFocusTrap';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(containerRef, { active: isOpen && delivery !== null, onEscape: onClose });

  // Official ERP delivery-note PDF download. The ERP endpoint resolves the id
  // as a delivery-note id OR an order id linked to one — try the order link
  // first (what the portal shipment carries), then the raw record id.
  const [noteDownloading, setNoteDownloading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  if (!isOpen || !delivery) return null;

  const handleDownloadDeliveryNote = async () => {
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

  const steps: { key: DeliveryStatus; title: string; desc: string }[] = [
    { key: 'order_placed', title: 'Order Placed', desc: 'Order confirmed and generated in ERP system' },
    { key: 'processing', title: 'Processing & Packing', desc: 'Items picked and packed at Central Warehouse' },
    { key: 'dispatched', title: 'Dispatched', desc: 'Package departed logistics hub via Express Freight' },
    { key: 'out_for_delivery', title: 'Out for Delivery', desc: 'In transit with local delivery courier' },
    { key: 'delivered', title: 'Delivered & Signed', desc: 'Handed over and verified at receiving dock' },
  ];

  const isDelayed = delivery.status === 'delayed';
  const getStepIndex = (status: DeliveryStatus) => {
    switch (status) {
      case 'order_placed': return 0;
      case 'processing': return 1;
      case 'dispatched': return 2;
      case 'out_for_delivery': return 3;
      case 'delivered': return 4;
      // 'delayed' is a STATUS overlay, not a step — keep the last completed
      // step's index so the timeline does not lie about progress. The
      // delayed state is surfaced separately as a banner + badge.
      case 'delayed': return 3;
      default: return 3;
    }
  };

  const currentStepIdx = getStepIndex(delivery.status);
  const statusInfo = getDeliveryStatusBadge(delivery.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up"
      >
        {/* Modal Header */}
        <div className="p-5 bg-slate-900 text-white flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
              <span className="text-xs font-mono text-slate-300">Order #{delivery.orderId}</span>
            </div>
            <h2 id={titleId} className="text-base font-extrabold mt-1 text-white">{delivery.title}</h2>
            <p className="text-xs font-mono text-slate-400 mt-0.5">Tracking ID: {delivery.trackingNumber}</p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            aria-label="Close delivery tracker"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body Scrollable */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-900">
          {/* Estimated Arrival Banner */}
          <div className="p-3.5 bg-blue-50 rounded-2xl border border-blue-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-blue-600" />
              <div>
                <span className="text-[11.5px] uppercase font-bold text-slate-500 block">Estimated Arrival</span>
                <span className="text-sm font-extrabold text-blue-700">{delivery.estimatedArrival || 'Scheduled Delivery'}</span>
              </div>
            </div>
          </div>

          {/* Delayed notice — surfaces when the ERP reports the shipment is
              delayed. The timeline below still reflects the last completed
              step; the banner makes the status overlay explicit. */}
          {isDelayed && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5"
            >
              <Clock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-xs text-rose-900 leading-relaxed">
                <strong className="block font-extrabold mb-0.5">Shipment delayed</strong>
                The carrier has reported a delay. The progress timeline below shows the last completed
                step; the package has not yet moved to the next stage.
              </div>
            </div>
          )}

          {/* Live Progress Timeline */}
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3">Live Progress Timeline</h3>
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {steps.map((step, idx) => {
                const isDone = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;

                return (
                  <div key={step.key} className="relative flex items-start gap-3">
                    <div
                      className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11.5px] font-bold transition ${
                        isCurrent
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                          : isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-500 border border-slate-300'
                      }`}
                    >
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <div>
                      <h4 className={`text-xs font-bold ${isCurrent ? 'text-blue-700' : isDone ? 'text-slate-900' : 'text-slate-400'}`}>
                        {step.title}
                      </h4>
                      <p className="text-[12.5px] text-slate-500 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Courier Driver Details */}
          {delivery.driverName && (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11.5px] text-slate-400 uppercase tracking-wider block font-bold">Assigned Courier</span>
                  <strong className="text-xs font-extrabold text-slate-900">{delivery.driverName}</strong>
                  <span className="text-[11.5px] text-slate-500 block">{delivery.vehicleNumber}</span>
                </div>
              </div>

              {delivery.driverPhone && (
                <div className="flex gap-2">
                  <a
                    href={`tel:${delivery.driverPhone}`}
                    className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                    title="Call Driver"
                  >
                    <PhoneCall className="w-4 h-4" />
                  </a>
                  <a
                    href={`sms:${delivery.driverPhone}`}
                    className="p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                    title="Text Driver"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Proof of Delivery Card */}
          {delivery.proofOfDelivery && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Verified Proof of Delivery</span>
              </div>
              <p className="text-slate-700">
                Signed by: <strong className="text-slate-900">{delivery.proofOfDelivery.signedBy}</strong>
              </p>
              <p className="text-slate-500 text-[12.5px]">
                Delivered at: {formatDateTime(delivery.proofOfDelivery.deliveredAt)}
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
          {noteError && (
            <p className="text-[11.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
              {noteError}
            </p>
          )}
          <div className="flex justify-between gap-2">
            <button
              onClick={() => { void handleDownloadDeliveryNote(); }}
              disabled={noteDownloading}
              title={noteDownloading ? 'Downloading official ERP delivery note…' : 'Download official ERP delivery note (PDF)'}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60 text-slate-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition"
            >
              {noteDownloading ? (
                <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Delivery Note PDF</span>
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl transition"
            >
              Close Progress Tracker
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

