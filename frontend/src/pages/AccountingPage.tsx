import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthSession } from '../services/auth';
import { notifyDriverRosterChanged } from '../services/driverRoster';
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

export interface EmployeeRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: 'DRIVER' | 'DISPATCHER';
  active: boolean;
  payRate: number | null;
  driverId: string | null;
}

type AccountingTab = 'INVOICES' | 'PAYROLL';

type EmployeeDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'DRIVER' | 'DISPATCHER';
  active: boolean;
  payRate: string;
  driverId: string;
};

interface AccountingPageProps {
  session: AuthSession;
  waybills: Waybill[];
  onBack: () => void;
}

const STORAGE_KEY = 'iaw_invoices';

const EMPTY_EMPLOYEE_DRAFT: EmployeeDraft = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: 'DRIVER',
  active: true,
  payRate: '',
  driverId: '',
};

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
 * Dispatcher accounting view with invoicing and payroll employee management.
 */
export default function AccountingPage({ session, waybills, onBack }: AccountingPageProps) {
  const [activeTab, setActiveTab] = useState<AccountingTab>('INVOICES');
  const [billingMonth, setBillingMonth] = useState('2026-07');
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => loadInvoices());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceRecord['status']>('ALL');
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeDraft>(EMPTY_EMPLOYEE_DRAFT);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);

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
   * Loads payroll employees from the admin API.
   */
  const loadEmployees = useCallback(async () => {
    setPayrollLoading(true);
    setPayrollError(null);
    try {
      const res = await fetch('/api/admin/employees', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        throw new Error('Failed to load employees');
      }
      const rows = (await res.json()) as EmployeeRecord[];
      setEmployees(rows);
    } catch (err) {
      setPayrollError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setPayrollLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    if (activeTab === 'PAYROLL') {
      void loadEmployees();
    }
  }, [activeTab, loadEmployees]);

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

  /**
   * Opens the employee form for create or edit.
   */
  const openEmployeeForm = (employee?: EmployeeRecord) => {
    if (employee) {
      setEditingEmployeeId(employee.id);
      setEmployeeDraft({
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email ?? '',
        phone: employee.phone ?? '',
        role: employee.role,
        active: employee.active,
        payRate: employee.payRate !== null ? String(employee.payRate) : '',
        driverId: employee.driverId ?? '',
      });
    } else {
      setEditingEmployeeId(null);
      setEmployeeDraft(EMPTY_EMPLOYEE_DRAFT);
    }
    setShowEmployeeForm(true);
  };

  /**
   * Persists a new or updated payroll employee via the admin API.
   */
  const handleSaveEmployee = async () => {
    if (!employeeDraft.firstName.trim() || !employeeDraft.lastName.trim()) return;

    const payload = {
      firstName: employeeDraft.firstName.trim(),
      lastName: employeeDraft.lastName.trim(),
      email: employeeDraft.email.trim() || null,
      phone: employeeDraft.phone.trim() || null,
      role: employeeDraft.role,
      active: employeeDraft.active,
      payRate: employeeDraft.payRate.trim() ? parseFloat(employeeDraft.payRate) : null,
      driverId: employeeDraft.driverId.trim() || null,
    };

    setPayrollError(null);
    try {
      const res = await fetch(
        editingEmployeeId ? `/api/admin/employees/${editingEmployeeId}` : '/api/admin/employees',
        {
          method: editingEmployeeId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to save employee');
      }
      setShowEmployeeForm(false);
      setEditingEmployeeId(null);
      setEmployeeDraft(EMPTY_EMPLOYEE_DRAFT);
      await loadEmployees();
      notifyDriverRosterChanged();
    } catch (err) {
      setPayrollError(err instanceof Error ? err.message : 'Failed to save employee');
    }
  };

  /**
   * Deletes a payroll employee record.
   */
  const handleDeleteEmployee = async (employee: EmployeeRecord) => {
    if (!window.confirm(`Remove ${employee.firstName} ${employee.lastName} from payroll?`)) return;

    setPayrollError(null);
    try {
      const res = await fetch(`/api/admin/employees/${employee.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        throw new Error('Failed to delete employee');
      }
      await loadEmployees();
      notifyDriverRosterChanged();
    } catch (err) {
      setPayrollError(err instanceof Error ? err.message : 'Failed to delete employee');
    }
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
        <h2>📊 Accounting</h2>
      </header>

      <div className="accounting-tabs">
        {(['INVOICES', 'PAYROLL'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'accounting-tab active' : 'accounting-tab'}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'INVOICES' ? 'Invoices' : 'Payroll'}
          </button>
        ))}
      </div>

      {activeTab === 'INVOICES' && (
        <>
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
                      <button
                        type="button"
                        className="btn-status subtle"
                        onClick={() => handleUpdateStatus(inv, 'VOIDED')}
                      >
                        Void
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'PAYROLL' && (
        <div className="accounting-card">
          <div className="payroll-card-header">
            <div className="accounting-card-title">Payroll Employees</div>
            <button type="button" className="btn-primary compact" onClick={() => openEmployeeForm()}>
              ➕ Add Employee
            </button>
          </div>

          {payrollError && <p className="payroll-error">{payrollError}</p>}
          {payrollLoading && <p className="empty-text">Loading employees…</p>}

          {!payrollLoading && employees.length === 0 && (
            <p className="empty-text">No payroll employees yet. Add one or run database seed.</p>
          )}

          {!payrollLoading &&
            employees.map((employee) => (
              <div key={employee.id} className="payroll-row">
                <div>
                  <div className="payroll-name">
                    {employee.firstName} {employee.lastName}
                    {!employee.active && <span className="inactive-tag">Inactive</span>}
                  </div>
                  <div className="payroll-sub">
                    {employee.role}
                    {employee.email ? ` • ${employee.email}` : ''}
                    {employee.payRate !== null ? ` • $${employee.payRate.toFixed(2)}/hr` : ''}
                    {employee.driverId ? ` • Driver ID: ${employee.driverId}` : ''}
                  </div>
                </div>
                <div className="payroll-actions">
                  <button type="button" className="btn-secondary compact" onClick={() => openEmployeeForm(employee)}>
                    Edit
                  </button>
                  <button type="button" className="btn-danger compact" onClick={() => void handleDeleteEmployee(employee)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {showEmployeeForm && (
        <div className="modal-overlay">
          <div className="modal-content payroll-form-modal">
            <h3>{editingEmployeeId ? 'Edit Employee' : 'Add Employee'}</h3>
            <label>First Name *</label>
            <input
              value={employeeDraft.firstName}
              onChange={(e) => setEmployeeDraft((prev) => ({ ...prev, firstName: e.target.value }))}
            />
            <label>Last Name *</label>
            <input
              value={employeeDraft.lastName}
              onChange={(e) => setEmployeeDraft((prev) => ({ ...prev, lastName: e.target.value }))}
            />
            <label>Email</label>
            <input
              type="email"
              value={employeeDraft.email}
              onChange={(e) => setEmployeeDraft((prev) => ({ ...prev, email: e.target.value }))}
            />
            <label>Phone</label>
            <input
              value={employeeDraft.phone}
              onChange={(e) => setEmployeeDraft((prev) => ({ ...prev, phone: e.target.value }))}
            />
            <label>Role</label>
            <select
              value={employeeDraft.role}
              onChange={(e) =>
                setEmployeeDraft((prev) => ({
                  ...prev,
                  role: e.target.value as EmployeeDraft['role'],
                }))
              }
            >
              <option value="DRIVER">Driver</option>
              <option value="DISPATCHER">Dispatcher</option>
            </select>
            <label>Pay Rate ($/hr)</label>
            <input
              value={employeeDraft.payRate}
              onChange={(e) => setEmployeeDraft((prev) => ({ ...prev, payRate: e.target.value }))}
              placeholder="Optional"
            />
            <label>Linked Driver ID</label>
            <input
              value={employeeDraft.driverId}
              onChange={(e) => setEmployeeDraft((prev) => ({ ...prev, driverId: e.target.value }))}
              placeholder="Optional, e.g. drv-01"
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={employeeDraft.active}
                onChange={(e) => setEmployeeDraft((prev) => ({ ...prev, active: e.target.checked }))}
              />
              Active
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowEmployeeForm(false);
                  setEditingEmployeeId(null);
                  setEmployeeDraft(EMPTY_EMPLOYEE_DRAFT);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!employeeDraft.firstName.trim() || !employeeDraft.lastName.trim()}
                onClick={() => void handleSaveEmployee()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
