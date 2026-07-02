import { useMemo, useState } from 'react';
import type { Waybill } from '../types/waybill';
import { waybillPrice } from '../types/waybill';
import { printInvoicePdf } from '../utils/invoicePrint';

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerName: string;
  billingMonth: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'VOIDED';
  createdAt: string;
  waybillNumbers: string[];
}

interface AccountingPageProps {
  waybills: Waybill[];
  onBack: () => void;
}

const STORAGE_KEY = 'iaw_invoices';

/**
 * Loads persisted invoice drafts from session storage.
 */
function loadInvoices(): InvoiceRecord[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as InvoiceRecord[]) : [];
    return parsed.map((inv) => ({
      ...inv,
      createdAt: inv.createdAt ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * Persists invoice drafts to session storage.
 */
function saveInvoices(invoices: InvoiceRecord[]): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
}

/**
 * Dispatcher accounting view with monthly invoice grouping and print-ready PDF output.
 */
export default function AccountingPage({ waybills, onBack }: AccountingPageProps) {
  const [billingMonth, setBillingMonth] = useState('2026-07');
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => loadInvoices());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceRecord['status']>('ALL');

  const billableCustomers = useMemo(() => {
    const monthly = waybills.filter((wb) => {
      if (wb.status !== 'DELIVERED') return false;
      const price = waybillPrice(wb);
      if (price <= 0) return false;
      const month = (wb.createdAt ?? wb.capturedAt ?? '').slice(0, 7);
      return month === billingMonth;
    });

    const groups: Record<string, Waybill[]> = {};
    for (const wb of monthly) {
      const key = wb.pickupLocationName || 'Other / General';
      groups[key] = groups[key] ?? [];
      groups[key].push(wb);
    }

    return Object.entries(groups).map(([customerName, dels]) => {
      const subtotal = dels.reduce((sum, d) => sum + waybillPrice(d), 0);
      const hst = parseFloat((subtotal * 0.13).toFixed(2));
      const total = parseFloat((subtotal + hst).toFixed(2));
      const existingInvoice = invoices.find(
        (inv) => inv.customerName === customerName && inv.billingMonth === billingMonth && inv.status !== 'VOIDED'
      );
      return {
        customerName,
        waybillsCount: dels.length,
        subtotal,
        hst,
        total,
        waybillNumbers: dels.map((d) => d.waybillNumber),
        existingInvoice,
      };
    });
  }, [billingMonth, invoices, waybills]);

  /**
   * Creates a draft invoice for a customer billing run.
   */
  const handleGenerateInvoice = (customerName: string, waybillNumbers: string[], subtotal: number) => {
    const monthClean = billingMonth.replace('-', '');
    const monthInvs = invoices.filter((inv) => inv.billingMonth === billingMonth);
    const seqNum = String(monthInvs.length + 1).padStart(4, '0');
    const hst = parseFloat((subtotal * 0.13).toFixed(2));
    const total = parseFloat((subtotal + hst).toFixed(2));
    const next: InvoiceRecord = {
      id: crypto.randomUUID(),
      invoiceNumber: `IAW-INV-${monthClean}-${seqNum}`,
      customerName,
      billingMonth,
      subtotal,
      taxAmount: hst,
      totalAmount: total,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      waybillNumbers,
    };
    const updated = [...invoices, next];
    setInvoices(updated);
    saveInvoices(updated);
  };

  /**
   * Updates invoice workflow status.
   */
  const handleUpdateStatus = (invoice: InvoiceRecord, status: InvoiceRecord['status']) => {
    const updated = invoices.map((inv) => (inv.id === invoice.id ? { ...inv, status } : inv));
    setInvoices(updated);
    saveInvoices(updated);
  };

  /**
   * Opens the multi-page invoice print preview in a new window.
   */
  const handlePrintInvoice = (invoice: InvoiceRecord) => {
    printInvoicePdf(invoice, waybills);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="accounting-page">
      <header className="accounting-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ⬅ Back
        </button>
        <h2>📊 Accounting &amp; Invoice Ops</h2>
      </header>

      <div className="accounting-card">
        <div className="accounting-card-title">Monthly Invoicing Generator</div>
        <div className="month-selector">
          <span>Period:</span>
          {['2026-07', '2026-06', '2026-05'].map((month) => (
            <button
              key={month}
              type="button"
              className={billingMonth === month ? 'month-chip active' : 'month-chip'}
              onClick={() => setBillingMonth(month)}
            >
              {month}
            </button>
          ))}
        </div>

        {billableCustomers.length === 0 ? (
          <p className="empty-text">No billable deliveries found for this month period.</p>
        ) : (
          billableCustomers.map((cust) => (
            <div key={cust.customerName} className="billing-row">
              <div>
                <div className="billing-customer">{cust.customerName}</div>
                <div className="billing-sub">
                  {cust.waybillsCount} Waybills • Subtotal: ${cust.subtotal.toFixed(2)} • Total: $
                  {cust.total.toFixed(2)}
                </div>
              </div>
              {cust.existingInvoice ? (
                <div className="billing-run-actions">
                  <span className="existing-invoice-tag">{cust.existingInvoice.invoiceNumber}</span>
                  <button
                    type="button"
                    className="btn-print-inv"
                    onClick={() => handlePrintInvoice(cust.existingInvoice!)}
                  >
                    🖨️ Print / View PDF
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-generate-inv"
                  onClick={() =>
                    handleGenerateInvoice(cust.customerName, cust.waybillNumbers, cust.subtotal)
                  }
                >
                  Draft Inv
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="accounting-card">
        <div className="accounting-card-title">Invoice Archives &amp; Lookup</div>
        <input
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by Invoice # or Customer..."
        />
        <div className="chip-row compact">
          {(['ALL', 'DRAFT', 'SENT', 'PAID', 'VOIDED'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              className={statusFilter === filter ? 'location-chip' : 'location-chip subtle'}
              onClick={() => setStatusFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>

        {filteredInvoices.length === 0 ? (
          <p className="empty-text">No invoices matched the filters.</p>
        ) : (
          filteredInvoices.map((inv) => (
            <div key={inv.id} className="invoice-card">
              <div className="invoice-card-top">
                <div>
                  <div className="invoice-number">{inv.invoiceNumber}</div>
                  <div className="invoice-client">{inv.customerName}</div>
                  <div className="invoice-meta">Period: {inv.billingMonth}</div>
                </div>
                <div className="invoice-right">
                  <span className={`invoice-status status-${inv.status.toLowerCase()}`}>{inv.status}</span>
                  <div className="invoice-total">${inv.totalAmount.toFixed(2)}</div>
                </div>
              </div>
              <div className="invoice-actions">
                <button type="button" className="btn-print-inv" onClick={() => handlePrintInvoice(inv)}>
                  🖨️ Print / View PDF
                </button>
                {inv.status === 'DRAFT' && (
                  <button type="button" className="btn-status" onClick={() => handleUpdateStatus(inv, 'SENT')}>
                    Send
                  </button>
                )}
                {inv.status === 'SENT' && (
                  <button type="button" className="btn-status" onClick={() => handleUpdateStatus(inv, 'PAID')}>
                    Collect
                  </button>
                )}
                {inv.status !== 'VOIDED' && inv.status !== 'PAID' && (
                  <button type="button" className="btn-status subtle" onClick={() => handleUpdateStatus(inv, 'VOIDED')}>
                    Void
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
