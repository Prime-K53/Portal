import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Headphones,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Ticket,
  LifeBuoy,
} from 'lucide-react';
import { CompanyContactInfo, NewSupportTicketPayload, SupportArticle, SupportTicket, SupportTicketCategory } from '../../types';
import { formatDate, formatRelativeTime } from '../../utils/formatters';

interface SupportTabProps {
  tickets: SupportTicket[];
  articles: SupportArticle[];
  companyContact?: CompanyContactInfo | null;
  isLoadingTickets?: boolean;
  isLoadingArticles?: boolean;
  onCreateTicket?: (payload: NewSupportTicketPayload) => Promise<void>;
  onViewTicket?: (ticket: SupportTicket) => void;
}

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  billing: 'Billing',
  technical: 'Technical',
  account: 'Account',
  order: 'Order',
  product: 'Product',
  other: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  resolved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  closed: 'bg-slate-100 text-slate-500',
};

function normalizeWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('0')) {
    return '265' + cleaned.slice(1);
  }
  if (cleaned.startsWith('+')) {
    return cleaned.slice(1);
  }
  return cleaned;
}

function getWhatsAppUrl(phone: string | null | undefined): string | null {
  const normalized = normalizeWhatsAppNumber(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}`;
}

function FAQItem({ article }: { article: SupportArticle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all hover:border-slate-300">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-semibold text-[15px] text-slate-800">{article.title}</span>
        <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-slate-100">
          <p className="pt-4 text-[14px] text-slate-600 leading-relaxed">{article.body || article.summary}</p>
          <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
            <span>Updated {formatDate(article.lastUpdated)}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>{article.helpful} found helpful</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NewTicketForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (payload: NewSupportTicketPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('other');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    await onSubmit({ subject: subject.trim(), description: description.trim(), category, priority });
    setSubject('');
    setDescription('');
    setCategory('other');
    setPriority('medium');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="ticket-subject" className="block text-xs font-semibold text-slate-500 mb-2">
          Subject
        </label>
        <input
          id="ticket-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief description of your issue"
          required
          className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition"
        />
      </div>
      <div>
        <label htmlFor="ticket-description" className="block text-xs font-semibold text-slate-500 mb-2">
          Description
        </label>
        <textarea
          id="ticket-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your issue in detail"
          rows={4}
          required
          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="ticket-category" className="block text-xs font-semibold text-slate-500 mb-2">
            Category
          </label>
          <select
            id="ticket-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
            className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition appearance-none cursor-pointer"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ticket-priority" className="block text-xs font-semibold text-slate-500 mb-2">
            Priority
          </label>
          <select
            id="ticket-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition appearance-none cursor-pointer"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 h-12 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !subject.trim() || !description.trim()}
          className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-sm font-bold text-white shadow-lg shadow-blue-900/20 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSubmitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  );
}

export const SupportTab: React.FC<SupportTabProps> = ({
  tickets,
  articles,
  companyContact,
  isLoadingTickets,
  isLoadingArticles,
  onCreateTicket,
  onViewTicket,
}) => {
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'faq' | 'tickets'>('faq');

  const handleCreateTicket = async (payload: NewSupportTicketPayload) => {
    if (!onCreateTicket) return;
    setIsSubmitting(true);
    try {
      await onCreateTicket(payload);
      setShowNewTicketForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');

  return (
    <div className="min-h-full bg-slate-50/50">
      <div className="px-5 py-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] shadow-lg shadow-blue-900/20">
            <Headphones className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Help & Support</h1>
            <p className="text-sm text-slate-500">We're here to help</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {companyContact?.email && (
            <a
              href={`mailto:${companyContact.email}`}
              className="flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Email</span>
            </a>
          )}
          {(companyContact?.phone || companyContact?.phones?.[0]) && (
            <a
              href={`tel:${companyContact.phone || companyContact.phones[0]}`}
              className="flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                <Phone className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Call</span>
            </a>
          )}
          {getWhatsAppUrl(companyContact?.whatsapp) && (
            <a
              href={getWhatsAppUrl(companyContact.whatsapp)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl border border-slate-200 hover:border-green-300 hover:shadow-md hover:shadow-green-500/5 transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                <MessageCircle className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-xs font-semibold text-slate-700">WhatsApp</span>
            </a>
          )}
        </div>

        <div className="flex gap-1 p-1 bg-white rounded-xl border border-slate-200 mb-5">
          {(['faq', 'tickets'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab === 'faq' ? (
                <>
                  <BookOpen className="w-4 h-4" />
                  FAQ
                </>
              ) : (
                <>
                  <Ticket className="w-4 h-4" />
                  Tickets
                  {openTickets.length > 0 && (
                    <span className="ml-1 bg-amber-500 text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                      {openTickets.length}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'faq' && (
          <div className="space-y-3">
            {isLoadingArticles ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : articles.length === 0 ? (
              <div className="text-center py-12">
                <LifeBuoy className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No articles available yet</p>
              </div>
            ) : (
              <>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Frequently Asked Questions</h2>
                {articles.map((article) => (
                  <FAQItem key={article.id} article={article} />
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="space-y-3">
            {!showNewTicketForm && onCreateTicket && (
              <button
                onClick={() => setShowNewTicketForm(true)}
                className="w-full flex items-center justify-center gap-2 h-12 bg-white border-2 border-dashed border-slate-300 rounded-2xl text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 transition-all"
              >
                <Plus className="w-4 h-4" />
                New Ticket
              </button>
            )}

            {showNewTicketForm && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="font-bold text-base text-slate-900 mb-5">Submit a Request</h3>
                <NewTicketForm
                  onSubmit={handleCreateTicket}
                  onCancel={() => setShowNewTicketForm(false)}
                  isSubmitting={isSubmitting}
                />
              </div>
            )}

            {isLoadingTickets ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : tickets.length === 0 && !showNewTicketForm ? (
              <div className="text-center py-12">
                <Ticket className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No support tickets yet</p>
              </div>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => onViewTicket?.(ticket)}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50 transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="font-semibold text-[15px] text-slate-800">{ticket.subject}</span>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg ${STATUS_COLORS[ticket.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{ticket.ticketNumber}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{CATEGORY_LABELS[ticket.category]}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{formatRelativeTime(ticket.updatedAt)}</span>
                  </div>
                  {ticket.messages.length > 0 && (
                    <p className="mt-2 text-sm text-slate-500 line-clamp-2">
                      {ticket.messages[ticket.messages.length - 1].content}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportTab;
