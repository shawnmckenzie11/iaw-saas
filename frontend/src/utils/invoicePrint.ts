import type { Waybill } from '../types/waybill';
import { waybillPrice } from '../types/waybill';
import { IAW_BUSINESS_EMAIL } from '../config/businessContact';

export interface InvoicePrintRecord {
  invoiceNumber: string;
  customerName: string;
  billingMonth: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  createdAt: string;
  waybillNumbers: string[];
}

/**
 * Builds multi-page invoice HTML (cover letter + itemized transactions) matching mobile AccountingScreen.
 */
export function buildInvoicePrintHtml(
  invoice: InvoicePrintRecord,
  waybills: Waybill[]
): string {
  const matchingDels = waybills
    .filter((d) => invoice.waybillNumbers.includes(d.waybillNumber))
    .sort(
      (a, b) =>
        new Date(a.createdAt ?? a.capturedAt ?? 0).getTime() -
        new Date(b.createdAt ?? b.capturedAt ?? 0).getTime()
    );

  const waybillRowsHtml = matchingDels
    .map((d) => {
      const ts = d.createdAt ?? d.capturedAt ?? invoice.createdAt;
      const formattedDate = new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: '2-digit',
      });
      const formattedTime = new Date(ts).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const price = waybillPrice(d);
      return `
        <tr>
          <td>${formattedDate} ${formattedTime}</td>
          <td><strong>${d.waybillNumber}</strong></td>
          <td>${d.pickupLocationName} ➡️ ${d.dropoffDestinationName}</td>
          <td>${d.parcelDescription}</td>
          <td style="text-align: right;">$${price.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  const invoiceDate = new Date(invoice.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1C1C1E;
      padding: 30px;
      font-size: 14px;
      line-height: 1.6;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    .watermark {
      position: absolute;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 80px;
      font-weight: 800;
      color: rgba(255, 59, 48, 0.03);
      z-index: -1000;
      letter-spacing: 10px;
      white-space: nowrap;
    }
    .header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #FF3B30;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo-area h1 {
      margin: 0;
      color: #FF3B30;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .logo-area p {
      margin: 4px 0 0 0;
      color: #8E8E93;
      font-size: 12px;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-meta h2 {
      margin: 0;
      font-size: 24px;
      color: #1C1C1E;
      letter-spacing: 1px;
    }
    .invoice-meta p {
      margin: 4px 0;
      color: #3A3A3C;
    }
    .billing-details {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .bill-to h3, .bill-from h3 {
      margin: 0 0 8px 0;
      font-size: 12px;
      color: #8E8E93;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .bill-to p, .bill-from p {
      margin: 4px 0;
      font-weight: 500;
    }
    .letter-content {
      margin-top: 40px;
      margin-bottom: 40px;
      font-size: 15px;
      line-height: 1.7;
    }
    .letter-content p {
      margin-bottom: 18px;
    }
    .summary-table-container {
      margin-top: 20px;
      border-top: 1px solid #E5E5EA;
      padding-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
    .summary-table {
      width: 320px;
      border-collapse: collapse;
    }
    .summary-table td {
      padding: 8px 12px;
      font-size: 14px;
    }
    .summary-table .total-row td {
      border-top: 2px solid #FF3B30;
      font-size: 18px;
      font-weight: bold;
      color: #FF3B30;
      padding-top: 12px;
    }
    table.item-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    table.item-table th {
      background-color: #F2F2F7;
      text-align: left;
      padding: 12px 10px;
      font-weight: 600;
      color: #48484A;
      border-bottom: 2px solid #D1D1D6;
    }
    table.item-table td {
      padding: 12px 10px;
      border-bottom: 1px solid #E5E5EA;
      font-size: 13px;
    }
    .sign-block {
      margin-top: 50px;
      display: flex;
      justify-content: space-between;
    }
    .sign-line {
      width: 200px;
      border-top: 1px solid #8E8E93;
      margin-top: 40px;
      text-align: center;
      font-size: 12px;
      color: #8E8E93;
    }
    .footer {
      margin-top: 50px;
      border-top: 1px solid #E5E5EA;
      padding-top: 20px;
      text-align: center;
      color: #8E8E93;
      font-size: 11px;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div style="position: relative; min-height: 900px;">
    <div class="watermark">IAW COURIER</div>
    <div class="header">
      <div class="logo-area">
        <h1>IAW COURIER</h1>
        <p>Reliable Delivery & Logistics Services</p>
      </div>
      <div class="invoice-meta">
        <h2>STATEMENT</h2>
        <p><strong>Invoice #:</strong> ${invoice.invoiceNumber}</p>
        <p><strong>Date:</strong> ${invoiceDate}</p>
        <p><strong>Billing Month:</strong> ${invoice.billingMonth}</p>
      </div>
    </div>
    <div class="billing-details">
      <div class="bill-from">
        <h3>From</h3>
        <p><strong>IAW Courier Delivery Services</strong></p>
        <p>123 Antigravity Way</p>
        <p>Sudbury, ON P3E 3Y1</p>
        <p>Phone: (705) 555-0100</p>
        <p>HST # 12345 6789 RT0001</p>
      </div>
      <div class="bill-to">
        <h3>Bill To</h3>
        <p><strong>${invoice.customerName}</strong></p>
        <p>Sudbury Operations Center</p>
        <p>Sudbury, Ontario</p>
      </div>
    </div>
    <div class="letter-content">
      <p>Dear Valued Partner,</p>
      <p>Please find attached the itemized billing details for professional courier and delivery services rendered by IAW Courier during the month of <strong>${invoice.billingMonth}</strong>.</p>
      <p>Our records indicate a total of <strong>${matchingDels.length}</strong> completed waybill transactions for your business location. The total amount due, including the 13% Ontario Harmonized Sales Tax (HST), is <strong>$${invoice.totalAmount.toFixed(2)}</strong>.</p>
      <p>Please review the summarized billing block below and the subsequent pages for full itemized trip details, routes, and waybill numbers.</p>
    </div>
    <div class="summary-table-container">
      <table class="summary-table">
        <tr>
          <td>Subtotal:</td>
          <td style="text-align: right;">$${invoice.subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td>HST (13%):</td>
          <td style="text-align: right;">$${invoice.taxAmount.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td>Total Due:</td>
          <td style="text-align: right;">$${invoice.totalAmount.toFixed(2)}</td>
        </tr>
      </table>
    </div>
    <div class="sign-block">
      <div>
        <p>Payment due within 30 days of invoice date.</p>
        <p>Remittance EFT: ${IAW_BUSINESS_EMAIL || 'billing@example.com'}</p>
      </div>
      <div>
        <div class="sign-line">Authorized Signature</div>
      </div>
    </div>
  </div>
  <div class="page-break"></div>
  <div style="min-height: 900px;">
    <div class="header" style="border-bottom: 1px dashed #E5E5EA; margin-bottom: 20px;">
      <div class="logo-area">
        <h2 style="font-size: 16px; margin: 0; color: #8E8E93;">IAW COURIER</h2>
      </div>
      <div class="invoice-meta">
        <p style="font-size: 12px; margin: 0; color: #8E8E93;">
          Itemized Transactions for Invoice <strong>${invoice.invoiceNumber}</strong>
        </p>
      </div>
    </div>
    <h3 style="font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 15px; color: #1C1C1E;">
      Itemized Waybill Details
    </h3>
    <table class="item-table">
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Waybill #</th>
          <th>Route Details</th>
          <th>Parcel Details</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${waybillRowsHtml}
      </tbody>
    </table>
    <div class="footer">
      <p>Invoice ${invoice.invoiceNumber} • IAW Courier Services</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Opens a print-ready invoice window and triggers the browser print dialog.
 */
export function printInvoicePdf(invoice: InvoicePrintRecord, waybills: Waybill[]): void {
  const htmlContent = buildInvoicePrintHtml(invoice, waybills);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('Popup blocked — please allow popups to view and print invoices.');
    return;
  }
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 300);
}
