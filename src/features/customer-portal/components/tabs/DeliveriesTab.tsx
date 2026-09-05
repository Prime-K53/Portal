import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { DeliveryNotification } from '../../types';
import { StatusBadge, EmptyState, SectionHeader } from '../ui';
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
      <SectionHeader
        icon={Truck}
        title="Deliveries"
        subtitle="Track active shipments in real-time and download signed delivery notes"
      />

      {/* Active Shipments List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Shipments</h3>
        {deliveries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card">
            <EmptyState
              icon={Truck}
              title="No deliveries yet"
              description="Shipment updates from the ERP dispatch system will appear here."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {deliveries.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleOpenModal(item)}
                  className="p-4 rounded-2xl border text-left cursor-pointer transition-all bg-white border-slate-200/80 hover:border-blue-400 hover:shadow-md group"
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="font-mono text-xs font-bold text-slate-900 truncate">{item.trackingNumber || item.id}</span>
                    <StatusBadge status={item.status} type="delivery" />
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
              ))}
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
