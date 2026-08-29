import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Headphones,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Ticket,
} from 'lucide-react';
import { NewSupportTicketPayload, SupportArticle, SupportTicket, SupportTicketCategory } from '../../types';
import { formatDate, formatRelativeTime } from '../../utils/formatters';

interface SupportTabProps {
  tickets: SupportTicket[];
  articles: SupportArticle[];
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
  open: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-blue-50 text-blue-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-slate-100 text-slate-500',
};

function FAQItem({ article }: { article: SupportArticle; key?: React.Key }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-sm text-slate-900">{article.title}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-slate-600 leading-relaxed">
          <p className="mb-2 font-medium text-slate-700">{article.summary}</p>
          <p>{article.body}</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="text-xs text-slate-400">Last updated {formatDate(article.lastUpdated)}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-400">{article.helpful} found this helpful</span>
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
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSubmitted(true);
    await onSubmit({ subject: subject.trim(), description: description.trim(), category, priority });
    setSubject('');
    setDescription('');
    setCategory('other');
    setPriority('medium');
    setSubmitted(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="ticket-subject" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Subject <span className="text-rose-500">*</span>
        </label>
        <input
          id="ticket-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief description of your issue"
          required
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 font-medium focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 transition"
        />
      </div>
      <div>
        <label htmlFor="ticket-description" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Description <span className="text-rose-500">*</span>
        </label>
        <textarea
          id="ticket-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please describe your issue in detail"
          rows={4}
          required
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 font-medium focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 transition resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ticket-category" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Category
          </label>
          <select
            id="ticket-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 font-medium focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 transition bg-white"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ticket-priority" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Priority
          </label>
          <select
            id="ticket-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 font-medium focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 transition bg-white"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !subject.trim() || !description.trim()}
          className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Submitting…' : 'Submit Ticket'}
        </button>
      </div>
    </form>
  );
}

export const SupportTab: React.FC<SupportTabProps> = ({
  tickets,
  articles,
  isLoadingTickets,
  isLoadingArticles,
  onCreateTicket,
  onViewTicket,
}) => {
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<'faq' | 'tickets'>('faq');

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
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-blue-600" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl text-slate-900">Help & Support</h1>
            <p className="text-sm text-slate-500">Get answers or reach our team</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5 max-w-xl mx-auto">

        {/* Quick contact cards */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href="mailto:support@primeerp.com"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-slate-200 text-center hover:border-blue-300 hover:bg-blue-50/30 transition group"
          >
            <Mail className="w-6 h-6 text-blue-600" aria-hidden="true" />
            <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">Email Support</span>
            <span className="text-[11px] text-slate-400">support@primeerp.com</span>
          </a>
          <a
            href="tel:+26512345678"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-slate-200 text-center hover:border-blue-300 hover:bg-blue-50/30 transition group"
          >
            <Phone className="w-6 h-6 text-blue-600" aria-hidden="true" />
            <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">Call Us</span>
            <span className="text-[11px] text-slate-400">+265 1 234 5678</span>
          </a>
        </div>

        {/* Section toggle: FAQ / My Tickets */}
        <div className="flex bg-white rounded-2xl border border-slate-200 p-1 gap-1">
          {(['faq', 'tickets'] as const).map((section) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              aria-current={activeSection === section ? 'true' : undefined}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                activeSection === section
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {section === 'faq' ? (
                <>
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                  FAQ
                </>
              ) : (
                <>
                  <Ticket className="w-4 h-4" aria-hidden="true" />
                  My Tickets
                  {openTickets.length > 0 && (
                    <span className="ml-1 bg-amber-500 text-white text-[10px] font-black min-w-[18px] h-4 px-1 rounded-full flex items-center justify-center">
                      {openTickets.length}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* FAQ section */}
        {activeSection === 'faq' && (
          <div className="space-y-3">
            {isLoadingArticles ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-label="Loading articles" />
              </div>
            ) : articles.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No articles available.</p>
            ) : (
              articles.map((article) => (
                <FAQItem key={article.id} article={article} />
              ))
            )}
          </div>
        )}

        {/* My Tickets section */}
        {activeSection === 'tickets' && (
          <div className="space-y-3">
            {!showNewTicketForm && onCreateTicket && (
              <button
                onClick={() => setShowNewTicketForm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-dashed border-blue-300 rounded-2xl text-sm font-bold text-blue-600 hover:bg-blue-50 transition"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                New Support Ticket
              </button>
            )}

            {showNewTicketForm && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-extrabold text-base text-slate-900 mb-4">Submit a New Ticket</h3>
                <NewTicketForm
                  onSubmit={handleCreateTicket}
                  onCancel={() => setShowNewTicketForm(false)}
                  isSubmitting={isSubmitting}
                />
              </div>
            )}

            {isLoadingTickets ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-label="Loading tickets" />
              </div>
            ) : tickets.length === 0 && !showNewTicketForm ? (
              <p className="text-sm text-slate-500 text-center py-8">You have no support tickets.</p>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => onViewTicket?.(ticket)}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-extrabold text-sm text-slate-900 group-hover:text-blue-700 transition">
                      {ticket.subject}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[ticket.status] ?? 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{ticket.ticketNumber}</span>
                    <span>·</span>
                    <span>{CATEGORY_LABELS[ticket.category]}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(ticket.updatedAt)}</span>
                  </div>
                  {ticket.messages.length > 0 && (
                    <p className="mt-2 text-xs text-slate-400 line-clamp-2">
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
