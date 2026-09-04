import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { DeliveryNotification } from '../../types';
import { getDeliveryStatusBadge } from '../../utils/formatters';
import { DeliveryTrackingModal } from '../modals/DeliveryTrackingModal';

interface DeliveriesTabProps {
  deliveries: DeliveryNotification[];
}

export const DeliveriesTab: React.FC<DeliveriesTabProps> = ({ deliveries }) => {
  const [trackingModalDelivery, setTrackingModalDelivery] = useState<DeliveryNotification | null>(null);

  const handleOpenModal = (item: DeliveryNotification) => {
    setTrackingModalDelivery(item);
  };

  return (
    <div className="space-y-4 pb-20 text-slate-900">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-xs">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Deliveries</h2>
            <p className="text-xs text-slate-500">Track active shipments in real-time and download signed delivery notes</p>
          </div>
        </div>
      </div>

      {/* Active Shipments List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Shipments</h3>
        {deliveries.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-2">
            <Truck className="w-10 h-10 mx-auto stroke-1 text-slate-300" />
            <p className="font-bold text-sm text-slate-700">No deliveries yet</p>
            <p className="text-xs text-slate-500">Shipment updates from the ERP dispatch system will appear here.</p>
          </div>
        ) : (
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
                    <span className="font-mono text-xs font-bold text-slate-900 truncate">{item.trackingNumber || item.id}</span>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <h4 className="text-xs text-slate-900 font-extrabold line-clamp-1 group-hover:text-blue-700 transition-colors">
                    {item.title}
                  </h4>
                  <div className="text-[12.5px] text-slate-500 mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
                    <span>Order: #{item.orderId}</span>
                    <span className="text-blue-600 font-bold flex items-center gap-1 text-[11.5px]">
                      View timeline →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DeliveryTrackingModal
        delivery={trackingModalDelivery}
        isOpen={Boolean(trackingModalDelivery)}
        onClose={() => setTrackingModalDelivery(null)}
      />
    </div>
  );
};
