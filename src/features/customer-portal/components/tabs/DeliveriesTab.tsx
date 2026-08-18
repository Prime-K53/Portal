import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  MapPin,
  MessageSquare,
  Navigation,
  PhoneCall,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react';
import { DeliveryNotification, DeliveryStatus } from '../../types';
import { formatDate, formatDateTime, getDeliveryStatusBadge } from '../../utils/formatters';
import { DeliveryTrackingModal } from '../modals/DeliveryTrackingModal';

interface DeliveriesTabProps {
  deliveries: DeliveryNotification[];
  onSelectDeliveryDetail?: (delivery: DeliveryNotification) => void;
}

export const DeliveriesTab: React.FC<DeliveriesTabProps> = ({ deliveries, onSelectDeliveryDetail }) => {
  const [trackingModalDelivery, setTrackingModalDelivery] = useState<DeliveryNotification | null>(null);

  const handleOpenModal = (item: DeliveryNotification) => {
    setTrackingModalDelivery(item);
    if (onSelectDeliveryDetail) {
      onSelectDeliveryDetail(item);
    }
  };

  return (
    <div className="space-y-4 pb-20 text-slate-900">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-xs">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Logistics & Delivery Tracker</h2>
            <p className="text-xs text-slate-500">Track active shipments in real-time, inspect courier telemetry, and view dock proof of delivery</p>
          </div>
        </div>
      </div>

      {/* Active Shipments List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Shipments List (Select to view Live Progress Timeline)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {deliveries.map((item) => {
            const statusInfo = getDeliveryStatusBadge(item.status);
            return (
              <div
                key={item.id}
                onClick={() => handleOpenModal(item)}
                className="p-4 rounded-2xl border text-left cursor-pointer transition-all bg-white border-slate-200/80 hover:border-blue-400 hover:shadow-md group"
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="font-mono text-xs font-bold text-slate-900">{item.trackingNumber}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo.bg}`}>
                    {statusInfo.label}
                  </span>
                </div>
                <h4 className="text-xs text-slate-900 font-extrabold line-clamp-1 group-hover:text-blue-700 transition-colors">
                  {item.title}
                </h4>
                <div className="text-[12.5px] text-slate-500 mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
                  <span>Order: #{item.orderId}</span>
                  <span className="text-blue-600 font-bold flex items-center gap-1 text-[11.5px] bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                    <Eye className="w-3 h-3" /> Live Timeline
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DeliveryTrackingModal
        delivery={trackingModalDelivery}
        isOpen={Boolean(trackingModalDelivery)}
        onClose={() => setTrackingModalDelivery(null)}
      />
    </div>
  );
};
