import React from 'react';
import { Bell, CheckCheck, Clock, ExternalLink, FileText, Info, Send, Truck, X } from 'lucide-react';
import { PortalNotification, TabType } from '../types';
import { formatDateTime } from '../utils/formatters';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: PortalNotification[];
  onMarkAllAsRead: () => void;
  onMarkAsRead: (id: string) => void;
  onNavigateTab: (tab: TabType) => void;
}

function notificationTypeBadge(type: PortalNotification['type']): { label: string; bg: string; icon: React.ReactNode } {
  switch (type) {
    case 'delivery':
      return { label: 'DELIVERY', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <Truck className="w-3 h-3" /> };
    case 'invoice':
      return { label: 'INVOICE', bg: 'bg-rose-100 text-rose-800 border-rose-200', icon: <FileText className="w-3 h-3" /> };
    case 'payment':
      return { label: 'PAYMENT', bg: 'bg-blue-100 text-blue-800 border-blue-200', icon: <Send className="w-3 h-3" /> };
    default:
      return { label: 'SYSTEM', bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: <Info className="w-3 h-3" /> };
  }
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onMarkAsRead,
  onNavigateTab,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white border-l border-slate-200 text-slate-900 flex flex-col h-full shadow-2xl animate-slide-left">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Notifications</h3>
              <p className="text-xs text-slate-500">Updates from the ERP Portal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-bold">
            {notifications.filter((n) => !n.isRead).length} unread notification(s)
          </span>
          <button
            onClick={onMarkAllAsRead}
            className="text-slate-900 hover:text-slate-700 font-extrabold flex items-center gap-1 transition"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        </div>

        {/* List of Notifications */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <Bell className="w-10 h-10 mx-auto stroke-1 text-slate-300" />
              <p className="font-bold text-slate-600">No new notifications</p>
              <p className="text-xs text-slate-400">You're all caught up!</p>
            </div>
          ) : (
            notifications.map((item) => {
              const badge = notificationTypeBadge(item.type);
              return (
                <div
                  key={item.id}
                  onClick={() => onMarkAsRead(item.id)}
                  className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                    !item.isRead
                      ? 'bg-slate-50 border-slate-300 shadow-2xs'
                      : 'bg-white border-slate-200/80 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11.5px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${badge.bg}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                      {!item.isRead && (
                        <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      )}
                    </div>
                    <span className="text-[11.5px] text-slate-400 flex items-center gap-1 font-medium">
                      <Clock className="w-3 h-3" />
                      {formatDateTime(item.timestamp)}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-sm text-slate-900 mt-2">{item.title}</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">{item.message}</p>

                  {item.link && (
                    <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[12.5px] text-slate-500">
                      <span>ERP reference</span>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-900 font-extrabold hover:text-slate-700 flex items-center gap-1"
                      >
                        <span>Open Details</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <button
            onClick={() => {
              onClose();
              onNavigateTab('deliveries');
            }}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition shadow-xs"
          >
            <Truck className="w-4 h-4" />
            <span>View Delivery Logistics</span>
          </button>
        </div>
      </div>
    </div>
  );
};