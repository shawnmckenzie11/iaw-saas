import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform
} from 'react-native';
import { db, DeliveryRecord, InvoiceRecord } from '../database/db';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

interface AccountingScreenProps {
  onNavigateBack: () => void;
}

export default function AccountingScreen({ onNavigateBack }: AccountingScreenProps) {
  const [billingMonth, setBillingMonth] = useState('2026-07');
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'SENT' | 'PAID' | 'VOIDED'>('ALL');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const allDels = await db.getDeliveryRecords();
      const allInvs = await db.getInvoices();
      setDeliveries(allDels);
      setInvoices(allInvs);
    } catch (err: any) {
      Alert.alert('Load Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Group billable deliveries for a month by business
  const getBillableCustomersForMonth = () => {
    const monthlyDeliveries = deliveries.filter((d) => {
      if (d.status !== 'DELIVERED') return false;
      if (!d.calculatedPrice || d.calculatedPrice <= 0) return false;
      
      const delMonth = d.createdAt.substring(0, 7); // YYYY-MM
      return delMonth === billingMonth;
    });

    const groups: { [customer: string]: DeliveryRecord[] } = {};
    monthlyDeliveries.forEach((d) => {
      const customer = d.pickupLocationName || 'Other / General';
      if (!groups[customer]) {
        groups[customer] = [];
      }
      groups[customer].push(d);
    });

    return Object.keys(groups).map((customerName) => {
      const customerDels = groups[customerName];
      const subtotal = customerDels.reduce((sum, d) => sum + (d.calculatedPrice || 0), 0);
      const hst = parseFloat((subtotal * 0.13).toFixed(2));
      const total = parseFloat((subtotal + hst).toFixed(2));
      const waybillNums = customerDels.map(d => d.waybillNumber);

      // Check if there is an active invoice for this customer in this month
      const existingInv = invoices.find(
        (inv) => inv.customerName === customerName && inv.billingMonth === billingMonth && inv.status !== 'VOIDED'
      );

      return {
        customerName,
        waybillsCount: customerDels.length,
        subtotal,
        hst,
        total,
        waybillNumbers: waybillNums,
        existingInvoice: existingInv
      };
    });
  };

  const handleGenerateInvoice = async (customerName: string, waybillNumbers: string[], subtotal: number) => {
    setIsProcessing(true);
    try {
      const monthClean = billingMonth.replace('-', ''); // e.g. 202607
      
      const monthInvs = invoices.filter(inv => inv.billingMonth === billingMonth);
      const seqNum = String(monthInvs.length + 1).padStart(4, '0');
      const invoiceNumber = `IAW-INV-${monthClean}-${seqNum}`;

      const hst = parseFloat((subtotal * 0.13).toFixed(2));
      const total = parseFloat((subtotal + hst).toFixed(2));

      const newInvoice: InvoiceRecord = {
        id: 'inv-uuid-' + Math.random().toString(36).substring(2, 11),
        invoiceNumber,
        customerName,
        billingMonth,
        subtotal,
        taxAmount: hst,
        totalAmount: total,
        status: 'DRAFT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        waybillNumbers
      };

      await db.saveInvoice(newInvoice);
      await loadData();
      Alert.alert('Success', `Invoice ${invoiceNumber} created successfully!`);
    } catch (err: any) {
      Alert.alert('Generation Failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateStatus = async (invoice: InvoiceRecord, newStatus: 'DRAFT' | 'SENT' | 'PAID' | 'VOIDED') => {
    setIsProcessing(true);
    try {
      const updated = {
        ...invoice,
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      await db.saveInvoice(updated);
      await loadData();
    } catch (err: any) {
      Alert.alert('Status Update Failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to permanently delete this invoice record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await db.deleteInvoice(invoiceId);
              await loadData();
            } catch (err: any) {
              Alert.alert('Deletion Failed', err.message);
            } finally {
              setIsProcessing(false);
            }
          }
        }
      ]
    );
  };

  const handleRecalculateInvoice = async (invoice: InvoiceRecord) => {
    setIsProcessing(true);
    try {
      const relatedDels = deliveries.filter(d => invoice.waybillNumbers.includes(d.waybillNumber));
      const newSubtotal = relatedDels.reduce((sum, d) => sum + (d.calculatedPrice || 0), 0);
      const newHst = parseFloat((newSubtotal * 0.13).toFixed(2));
      const newTotal = parseFloat((newSubtotal + newHst).toFixed(2));

      const updated: InvoiceRecord = {
        ...invoice,
        subtotal: newSubtotal,
        taxAmount: newHst,
        totalAmount: newTotal,
        updatedAt: new Date().toISOString()
      };

      await db.saveInvoice(updated);
      await loadData();
      Alert.alert('Recalculated', `Invoice ${invoice.invoiceNumber} has been updated to reflect current waybill pricing.`);
    } catch (err: any) {
      Alert.alert('Recalculation Failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintInvoicePDF = async (invoice: InvoiceRecord) => {
    const matchingDels = deliveries.filter(d => invoice.waybillNumbers.includes(d.waybillNumber));
    matchingDels.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const waybillRowsHtml = matchingDels.map(d => {
      const formattedDate = new Date(d.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: '2-digit'
      });
      const formattedTime = new Date(d.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `
        <tr>
          <td>${formattedDate} ${formattedTime}</td>
          <td><strong>${d.waybillNumber}</strong></td>
          <td>${d.pickupLocationName} ➡️ ${d.dropoffDestinationName}</td>
          <td>${d.parcelDescription}</td>
          <td style="text-align: right;">$${(d.calculatedPrice || 0).toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
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
        </style>
      </head>
      <body>
        <!-- ================= PAGE 1: COVER LETTER & STATEMENT ================= -->
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
              <p><strong>Date:</strong> ${new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</p>
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
              <p>Remittance EFT: payments@iawcourier.com</p>
            </div>
            <div>
              <div class="sign-line">Authorized Signature</div>
            </div>
          </div>
        </div>

        <div class="page-break"></div>

        <!-- ================= PAGE 2+: ITEMIZED TRANSACTION DETAILS ================= -->
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
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice_${invoice.invoiceNumber}` });
    } catch (e: any) {
      Alert.alert('PDF Print Failed', e.message);
    }
  };

  const getStatusColor = (status: 'DRAFT' | 'SENT' | 'PAID' | 'VOIDED') => {
    switch (status) {
      case 'DRAFT': return { bg: '#E5E5EA', text: '#3A3A3C' };
      case 'SENT': return { bg: '#CCE5FF', text: '#004085' };
      case 'PAID': return { bg: '#D4EDDA', text: '#155724' };
      case 'VOIDED': return { bg: '#F8D7DA', text: '#721C24' };
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch = inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inv.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const billableCustomers = getBillableCustomersForMonth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onNavigateBack}>
          <Text style={styles.backBtnText}>⬅ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 Accounting & Invoice Ops</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF3B30" />
          <Text style={{ marginTop: 10, color: '#8E8E93' }}>Loading accounting data...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Monthly Invoicing Generator</Text>
              
              <View style={styles.monthSelectorRow}>
                <Text style={styles.monthLabel}>Period:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 220 }}>
                  {['2026-07', '2026-06', '2026-05'].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.monthOption, billingMonth === m && styles.monthOptionActive]}
                      onPress={() => setBillingMonth(m)}
                    >
                      <Text style={[styles.monthOptionText, billingMonth === m && styles.monthOptionTextActive]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <Text style={styles.sectionSubtitle}>
              Shows customers with completed, priced deliveries in {billingMonth}
            </Text>

            {billableCustomers.length === 0 ? (
              <Text style={styles.emptyText}>No billable deliveries found for this month period.</Text>
            ) : (
              billableCustomers.map((cust) => (
                <View key={cust.customerName} style={styles.billingRunRow}>
                  <View style={styles.billingRunInfo}>
                    <Text style={styles.custName}>{cust.customerName}</Text>
                    <Text style={styles.custSub}>
                      {cust.waybillsCount} Waybills • Subtotal: ${cust.subtotal.toFixed(2)}
                    </Text>
                    <Text style={styles.custTaxSub}>
                      HST: ${cust.hst.toFixed(2)} • Total: ${cust.total.toFixed(2)}
                    </Text>
                  </View>
                  
                  <View style={styles.billingRunAction}>
                    {cust.existingInvoice ? (
                      <View style={styles.existingInvoiceTag}>
                        <Text style={styles.existingInvoiceTagText}>
                          {cust.existingInvoice.invoiceNumber}
                        </Text>
                        <Text style={styles.existingInvoiceStatusText}>
                          ({cust.existingInvoice.status})
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.generateBtn}
                        disabled={isProcessing}
                        onPress={() => handleGenerateInvoice(cust.customerName, cust.waybillNumbers, cust.subtotal)}
                      >
                        <Text style={styles.generateBtnText}>Draft Inv</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={[styles.card, { marginTop: 20 }]}>
            <Text style={styles.cardTitle}>Invoice Archives & Lookup</Text>
            
            <TextInput
              style={styles.searchInput}
              placeholder="Search by Invoice # or Customer..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.statusFilterRow}
            >
              {(['ALL', 'DRAFT', 'SENT', 'PAID', 'VOIDED'] as const).map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterChip, statusFilter === filter && styles.filterChipActive]}
                  onPress={() => setStatusFilter(filter)}
                >
                  <Text style={[styles.filterChipText, statusFilter === filter && styles.filterChipTextActive]}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredInvoices.length === 0 ? (
              <Text style={styles.emptyText}>No invoices matched the filters.</Text>
            ) : (
              filteredInvoices.map((inv) => {
                const colors = getStatusColor(inv.status);
                
                const relatedDels = deliveries.filter(d => inv.waybillNumbers.includes(d.waybillNumber));
                const currentLiveSubtotal = relatedDels.reduce((sum, d) => sum + (d.calculatedPrice || 0), 0);
                const isOutOfSync = currentLiveSubtotal !== inv.subtotal;

                return (
                  <View key={inv.id} style={styles.invoiceCard}>
                    <View style={styles.invoiceCardTop}>
                      <View>
                        <Text style={styles.invNumber}>{inv.invoiceNumber}</Text>
                        <Text style={styles.invClient}>{inv.customerName}</Text>
                        <Text style={styles.invDate}>
                          Period: {inv.billingMonth} • Created: {new Date(inv.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: colors.text }]}>{inv.status}</Text>
                        </View>
                        <Text style={styles.invTotal}>${inv.totalAmount.toFixed(2)}</Text>
                      </View>
                    </View>

                    {isOutOfSync && inv.status === 'DRAFT' && (
                      <View style={styles.outOfSyncBox}>
                        <Text style={styles.outOfSyncText}>
                          ⚠️ Waybill price updates changed subtotal to ${currentLiveSubtotal.toFixed(2)}
                        </Text>
                        <TouchableOpacity 
                          style={styles.recalcBtn} 
                          onPress={() => handleRecalculateInvoice(inv)}
                        >
                          <Text style={styles.recalcBtnText}>Sync Pricing</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={styles.invoiceCardActions}>
                      <TouchableOpacity 
                        style={styles.actionBtnSecondary} 
                        onPress={() => handlePrintInvoicePDF(inv)}
                      >
                        <Text style={styles.actionBtnSecondaryText}>🖨️ PDF / Print</Text>
                      </TouchableOpacity>

                      <View style={styles.statusButtonsGroup}>
                        {inv.status === 'DRAFT' && (
                          <TouchableOpacity 
                            style={styles.statusActionBtn} 
                            onPress={() => handleUpdateStatus(inv, 'SENT')}
                          >
                            <Text style={styles.statusActionBtnText}>Send</Text>
                          </TouchableOpacity>
                        )}
                        {inv.status === 'SENT' && (
                          <TouchableOpacity 
                            style={styles.statusActionBtn} 
                            onPress={() => handleUpdateStatus(inv, 'PAID')}
                          >
                            <Text style={styles.statusActionBtnText}>Collect</Text>
                          </TouchableOpacity>
                        )}
                        {inv.status !== 'VOIDED' && inv.status !== 'PAID' && (
                          <TouchableOpacity 
                            style={[styles.statusActionBtn, { backgroundColor: '#F2F2F7' }]} 
                            onPress={() => handleUpdateStatus(inv, 'VOIDED')}
                          >
                            <Text style={[styles.statusActionBtnText, { color: '#8E8E93' }]}>Void</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity 
                          style={styles.deleteInvoiceBtn} 
                          onPress={() => handleDeleteInvoice(inv.id)}
                        >
                          <Text style={styles.deleteInvoiceBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7'
  },
  header: {
    height: Platform.OS === 'ios' ? 100 : 70,
    paddingTop: Platform.OS === 'ios' ? 45 : 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15
  },
  backBtn: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  backBtnText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E'
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    flex: 1,
    padding: 15
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  monthLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginRight: 6
  },
  monthOption: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 4
  },
  monthOptionActive: {
    backgroundColor: '#FF3B30'
  },
  monthOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3C'
  },
  monthOptionTextActive: {
    color: '#FFFFFF'
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 16
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    paddingVertical: 30,
    fontSize: 14
  },
  billingRunRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7'
  },
  billingRunInfo: {
    flex: 1,
    paddingRight: 10
  },
  custName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E'
  },
  custSub: {
    fontSize: 12,
    color: '#3A3A3C',
    marginTop: 2
  },
  custTaxSub: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2
  },
  billingRunAction: {
    minWidth: 90,
    alignItems: 'flex-end'
  },
  generateBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700'
  },
  existingInvoiceTag: {
    alignItems: 'flex-end'
  },
  existingInvoiceTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34C759'
  },
  existingInvoiceStatusText: {
    fontSize: 9,
    color: '#8E8E93',
    marginTop: 1
  },
  searchInput: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
    marginTop: 12,
    marginBottom: 12,
    color: '#1C1C1E'
  },
  statusFilterRow: {
    flexDirection: 'row',
    marginBottom: 16
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F2F2F7',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA'
  },
  filterChipActive: {
    backgroundColor: '#34C759',
    borderColor: '#34C759'
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3A3A3C'
  },
  filterChipTextActive: {
    color: '#FFFFFF'
  },
  invoiceCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12
  },
  invoiceCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  invNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E'
  },
  invClient: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3A3A3C',
    marginTop: 2
  },
  invDate: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700'
  },
  invTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF3B30',
    marginTop: 6
  },
  outOfSyncBox: {
    backgroundColor: '#FFF2E6',
    borderWidth: 1,
    borderColor: '#FFD9B3',
    borderRadius: 6,
    padding: 8,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  outOfSyncText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B35900',
    flex: 1,
    marginRight: 6
  },
  recalcBtn: {
    backgroundColor: '#E67E22',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  recalcBtnText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700'
  },
  invoiceCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7'
  },
  actionBtnSecondary: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  actionBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3A3A3C'
  },
  statusButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusActionBtn: {
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 6
  },
  statusActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700'
  },
  deleteInvoiceBtn: {
    padding: 6,
    marginLeft: 6
  },
  deleteInvoiceBtnText: {
    fontSize: 12
  }
});
