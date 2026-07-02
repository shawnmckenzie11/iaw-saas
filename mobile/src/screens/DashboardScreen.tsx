import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Switch,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { db, DeliveryRecord } from '../database/db';
import { syncManager, SyncStats } from '../services/SyncManager';
import { getLocationShortName } from '../utils/pricing';

function formatDate(isoString?: string): string {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'N/A';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = months[date.getMonth()];
  const d = String(date.getDate()).padStart(2, '0');
  const y = String(date.getFullYear()).slice(-2);
  return `${m} ${d}/${y}`;
}

function formatTime(isoString?: string): string {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Synthetic drivers list
export const DRIVERS = [
  { id: 'drv-01', firstName: 'Shawn', lastName: 'McKenzie', qboDriverId: '101' },
  { id: 'drv-02', firstName: 'John', lastName: 'Doe', qboDriverId: '102' },
  { id: 'drv-03', firstName: 'Sarah', lastName: 'Connor', qboDriverId: '103' },
  { id: 'drv-04', firstName: 'Alex', lastName: 'Mercer', qboDriverId: '104' },
];

interface DashboardProps {
  activeDriverId: string;
  setActiveDriverId: (id: string) => void;
  onNavigateToPickup: () => void;
  onNavigateToDropoff: (record: DeliveryRecord) => void;
  isDispatchRole?: boolean;
  onSignOut?: () => void;
}

export default function DashboardScreen({
  activeDriverId,
  setActiveDriverId,
  onNavigateToPickup,
  onNavigateToDropoff,
  isDispatchRole = false,
  onSignOut,
}: DashboardProps) {
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [stats, setStats] = useState<SyncStats>({ pendingCount: 0, syncedCount: 0, conflictCount: 0 });
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isAdminMode, setIsAdminMode] = useState(isDispatchRole);
  const [adminTab, setAdminTab] = useState<'ACTIVE' | 'PENDING_PRICE' | 'COMPLETED'>('ACTIVE');
  const [selectedPendingPriceRecord, setSelectedPendingPriceRecord] = useState<DeliveryRecord | null>(null);
  const [quotePrice, setQuotePrice] = useState('');

  const handleConfirmQuotePrice = async () => {
    if (!selectedPendingPriceRecord || !quotePrice.trim()) return;
    try {
      const priceVal = parseFloat(quotePrice);
      if (isNaN(priceVal) || priceVal < 0) {
        alert('Please enter a valid price amount');
        return;
      }
      
      const updatedRecord: DeliveryRecord = {
        ...selectedPendingPriceRecord,
        calculatedPrice: priceVal,
        priceCategory: 'Manual Dispatcher Quote',
        updatedAt: new Date().toISOString(),
        syncStatus: 'PENDING'
      };

      await db.saveDeliveryRecord(updatedRecord);
      setSelectedPendingPriceRecord(null);
      setQuotePrice('');
      await fetchRecords();
    } catch (err: any) {
      console.warn('Failed to update quote price:', err);
    }
  };

  useEffect(() => {
    setIsAdminMode(isDispatchRole);
  }, [isDispatchRole]);

  const fetchRecords = async () => {
    try {
      const all = await db.getDeliveryRecords();
      setRecords(all);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    db.init().then(() => {
      fetchRecords();
    });

    const unsubscribe = syncManager.subscribe((newStats) => {
      setStats(newStats);
      fetchRecords();
    });

    return unsubscribe;
  }, []);

  const toggleNetwork = (value: boolean) => {
    setIsOnline(value);
    syncManager.setNetworkConnected(value);
  };

  const handleResolveConflict = async (uuid: string) => {
    await syncManager.resolveConflictForce(uuid);
    fetchRecords();
  };

  const handleAssignDriver = async (record: DeliveryRecord, driverId: string | null) => {
    try {
      setLoading(true);
      const updated: DeliveryRecord = {
        ...record,
        driverId: driverId,
        syncStatus: 'PENDING',
        updatedAt: new Date().toISOString()
      };
      await db.saveDeliveryRecord(updated);
      await fetchRecords();
    } catch (e) {
      console.error('Assign driver failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCsv = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/sync-csv', { method: 'POST' });
      if (res.ok) {
        await fetchRecords();
      }
    } catch (err) {
      console.warn('Sync CSV API offline');
    } finally {
      setLoading(false);
    }
  };

  const activeDriver = DRIVERS.find(d => d.id === activeDriverId) || DRIVERS[0];

  // Filtering for Driver view
  const myPendingPickups = records.filter(r => r.driverId === activeDriverId && r.status === 'DRAFT');
  const myPendingDeliveries = records.filter(r => r.driverId === activeDriverId && r.status === 'PICKED_UP');
  const myActiveCount = myPendingPickups.length + myPendingDeliveries.length;
  const myCompletedCount = records.filter(r => r.driverId === activeDriverId && r.status === 'DELIVERED').length;

  const getFilteredRecords = () => {
    if (isAdminMode) {
      if (adminTab === 'ACTIVE') {
        return records.filter(r => r.status === 'DRAFT' || r.status === 'PICKED_UP');
      } else if (adminTab === 'PENDING_PRICE') {
        return records.filter(r => r.status === 'DELIVERED' && (!r.calculatedPrice || r.calculatedPrice === 0));
      } else {
        return records.filter(r => r.status === 'DELIVERED' && r.calculatedPrice && r.calculatedPrice > 0);
      }
    } else {
      if (adminTab === 'ACTIVE') {
        return records.filter(r => r.driverId === activeDriverId && (r.status === 'DRAFT' || r.status === 'PICKED_UP'));
      } else {
        return records.filter(r => r.driverId === activeDriverId && r.status === 'DELIVERED');
      }
    }
  };

  // Render Table Row in Dispatch Mode
  const renderAdminRow = ({ item }: { item: DeliveryRecord }) => {
    const assignedDriver = DRIVERS.find(d => d.id === item.driverId);
    const isDraft = item.status === 'DRAFT';
    const isCompleted = item.status === 'DELIVERED';
    
    let statusText = 'Completed';
    if (!isCompleted) {
      statusText = isDraft ? 'Pending-Pickup' : 'Pending-Delivery';
    }

    return (
      <TouchableOpacity
        disabled={adminTab !== 'PENDING_PRICE'}
        onPress={() => {
          setSelectedPendingPriceRecord(item);
          setQuotePrice('');
        }}
        style={styles.tableRow}
      >
        {/* Column 1: Waybill & Priority */}
        <View style={[styles.tableCol, { flex: 1 }]}>
          <Text style={styles.tableWaybill}>{item.waybillNumber}</Text>
          {item.priority === 'RUSH' && (
            <View style={styles.miniRushBadge}>
              <Text style={styles.miniRushText}>RUSH</Text>
            </View>
          )}
        </View>

        {/* Column 2: Date */}
        <View style={[styles.tableCol, { flex: 1 }]}>
          <Text style={styles.tableText}>{formatDate(item.createdAt)}</Text>
        </View>

        {/* Column 3: Time */}
        <View style={[styles.tableCol, { flex: 1 }]}>
          <Text style={styles.tableText}>{formatTime(item.createdAt)}</Text>
        </View>

        {/* Column 4: Cargo */}
        <View style={[styles.tableCol, { flex: 1 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{item.parcelDescription}</Text>
        </View>

        {/* Column 5: Route */}
        <View style={[styles.tableCol, { flex: 2 }]}>
          <Text style={styles.tableText} numberOfLines={1}>
            🚩 {getLocationShortName(item.pickupLocationName)} ➡️ {getLocationShortName(item.dropoffDestinationName)}
          </Text>
          <Text style={{ fontSize: 10, color: '#007AFF', fontWeight: 'bold', marginTop: 2 }}>
            {item.calculatedPrice && item.calculatedPrice > 0 ? `$${item.calculatedPrice.toFixed(2)}` : 'Manual'}
          </Text>
        </View>

        {/* Column 6: Status */}
        <View style={[styles.tableCol, { flex: 1.5 }]}>
          <Text 
            style={[
              styles.miniStatusTag, 
              isCompleted ? styles.miniStatusCompleted : (isDraft ? styles.miniStatusDraft : styles.miniStatusTransit),
              { fontSize: 9 }
            ]}
          >
            {statusText}
          </Text>
        </View>

        {/* Column 7: Assignment */}
        <View style={[styles.tableCol, { flex: 2 }]}>
          {isCompleted ? (
            <Text style={styles.miniDriverName} numberOfLines={1}>
              {assignedDriver ? assignedDriver.firstName : 'Driver'}
            </Text>
          ) : (
            <View style={{ width: '100%' }}>
              {item.driverId ? (
                <View style={styles.miniAssignedRow}>
                  <Text style={styles.miniDriverName} numberOfLines={1}>{assignedDriver?.firstName}</Text>
                  <TouchableOpacity
                    style={styles.miniUnassignBtn}
                    onPress={() => handleAssignDriver(item, null)}
                  >
                    <Text style={styles.miniUnassignText}>X</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.miniDriverChips}>
                  {DRIVERS.map(d => (
                    <TouchableOpacity
                      key={d.id}
                      style={styles.miniChip}
                      onPress={() => handleAssignDriver(item, d.id)}
                    >
                      <Text style={styles.miniChipText}>{d.firstName[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Render Table Row in Driver Mode
  const renderDriverRow = ({ item }: { item: DeliveryRecord }) => {
    const isDraft = item.status === 'DRAFT';
    const isCompleted = item.status === 'DELIVERED';
    
    return (
      <TouchableOpacity
        style={styles.tableRow}
        onPress={() => !isCompleted && onNavigateToDropoff(item)}
        disabled={isCompleted}
      >
        {/* Column 1: Waybill */}
        <View style={[styles.tableCol, { flex: 1 }]}>
          <Text style={styles.tableWaybill}>{item.waybillNumber}</Text>
          {item.priority === 'RUSH' && (
            <View style={styles.miniRushBadge}>
              <Text style={styles.miniRushText}>RUSH</Text>
            </View>
          )}
        </View>

        {/* Column 2: Date */}
        <View style={[styles.tableCol, { flex: 1 }]}>
          <Text style={styles.tableText}>{formatDate(item.createdAt)}</Text>
        </View>

        {/* Column 3: Time */}
        <View style={[styles.tableCol, { flex: 1 }]}>
          <Text style={styles.tableText}>{formatTime(item.createdAt)}</Text>
        </View>

        {/* Column 4: Cargo */}
        <View style={[styles.tableCol, { flex: 1 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{item.parcelDescription}</Text>
        </View>

        {/* Column 5: Route */}
        <View style={[styles.tableCol, { flex: 2 }]}>
          <Text style={styles.tableText} numberOfLines={1}>
            🚩 {getLocationShortName(item.pickupLocationName)} ➡️ {getLocationShortName(item.dropoffDestinationName)}
          </Text>
        </View>

        {/* Column 6: Action */}
        <View style={[styles.tableCol, { flex: 2.2, alignItems: 'flex-end' }]}>
          {isCompleted ? (
            <Text style={styles.tableCompletedText} numberOfLines={1}>
              ✓ {item.deliveredAt ? new Date(item.deliveredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Delivered'}
            </Text>
          ) : (
            <View style={styles.actionButtonBadge}>
              <Text style={styles.actionButtonText}>
                {isDraft ? 'Pick Up' : (item.podRequired ? 'Deliver w/ POD' : 'Deliver')}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Driver/Admin Compact Unified Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isAdminMode ? (
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E' }}>⚙️ Dispatch</Text>
          ) : (
            <View style={styles.driverProfileHeader}>
              {DRIVERS.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.driverBtn,
                    activeDriverId === d.id && styles.driverBtnActive,
                  ]}
                  onPress={() => setActiveDriverId(d.id)}
                >
                  <Text
                    style={[
                      styles.driverBtnText,
                      activeDriverId === d.id && styles.driverBtnTextActive,
                    ]}
                  >
                    {d.firstName[0]}
                  </Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.driverNameLabel}>({activeDriver.firstName})</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Connection state */}
          <TouchableOpacity onPress={() => toggleNetwork(!isOnline)} style={{ marginRight: 8, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: isOnline ? '#34C759' : '#FF3B30' }}>
              {isOnline ? '🟢 Live' : '🔴 Off'}
            </Text>
          </TouchableOpacity>

          {/* Sync stats indicators */}
          <View style={{ flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, marginRight: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#8E8E93', marginRight: 5 }}>
              S:<Text style={{ color: '#34C759' }}>{stats.syncedCount}</Text>
            </Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#8E8E93', marginRight: 5 }}>
              P:<Text style={{ color: stats.pendingCount > 0 ? '#FF9500' : '#8E8E93' }}>{stats.pendingCount}</Text>
            </Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#8E8E93' }}>
              C:<Text style={{ color: stats.conflictCount > 0 ? '#FF3B30' : '#8E8E93' }}>{stats.conflictCount}</Text>
            </Text>
          </View>

          {/* Driver/Dispatch Toggle */}
          <TouchableOpacity
            style={[styles.adminToggleBtn, isAdminMode && styles.adminToggleBtnActive]}
            onPress={() => setIsAdminMode(!isAdminMode)}
          >
            <Text style={[styles.adminToggleBtnText, isAdminMode && styles.adminToggleBtnTextActive, { fontSize: 11 }]}>
              {isAdminMode ? '👁️ Driver' : '⚙️ Dispatch'}
            </Text>
          </TouchableOpacity>

          {/* Sign Out Button */}
          {onSignOut && (
            <TouchableOpacity
              style={styles.signOutBtnCompact}
              onPress={onSignOut}
            >
              <Text style={styles.signOutBtnCompactText}>Sign Out</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* New Pickup Trigger Button */}
      <TouchableOpacity style={styles.primaryButton} onPress={onNavigateToPickup}>
        <Text style={styles.primaryButtonText}>➕ NEW PICKUP (WAYBILL)</Text>
      </TouchableOpacity>

      {/* Shared Active/Completed/Pending Price Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, adminTab === 'ACTIVE' && styles.tabItemActive]}
          onPress={() => setAdminTab('ACTIVE')}
        >
          <Text style={[styles.tabText, adminTab === 'ACTIVE' && styles.tabTextActive]}>
            Active ({isAdminMode 
              ? records.filter(r => r.status === 'DRAFT' || r.status === 'PICKED_UP').length
              : myActiveCount
            })
          </Text>
        </TouchableOpacity>

        {isAdminMode && (
          <TouchableOpacity
            style={[styles.tabItem, adminTab === 'PENDING_PRICE' && styles.tabItemActive]}
            onPress={() => setAdminTab('PENDING_PRICE')}
          >
            <Text style={[styles.tabText, adminTab === 'PENDING_PRICE' && styles.tabTextActive]}>
              Pending Price ({records.filter(r => r.status === 'DELIVERED' && (!r.calculatedPrice || r.calculatedPrice === 0)).length})
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.tabItem, (adminTab === 'COMPLETED' || (!isAdminMode && adminTab === 'PENDING_PRICE')) && styles.tabItemActive]}
          onPress={() => setAdminTab('COMPLETED')}
        >
          <Text style={[styles.tabText, (adminTab === 'COMPLETED' || (!isAdminMode && adminTab === 'PENDING_PRICE')) && styles.tabTextActive]}>
            Completed ({isAdminMode 
              ? records.filter(r => r.status === 'DELIVERED' && r.calculatedPrice && r.calculatedPrice > 0).length
              : myCompletedCount
            })
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Lists Display */}
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.listContainer}>
          {/* TABLE HEADER */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Waybill</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Date</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Time</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Cargo</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Route</Text>
            {isAdminMode ? (
              <>
                <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Status</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Assignment</Text>
              </>
            ) : (
              <Text style={[styles.tableHeaderCell, { flex: 2.2, textAlign: 'right' }]}>Action</Text>
            )}
          </View>

          {/* TABLE DATA LIST */}
          <FlatList
            data={getFilteredRecords()}
            keyExtractor={(item) => item.clientSideUuid}
            renderItem={isAdminMode ? renderAdminRow : renderDriverRow}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No tasks found in this view.</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Modal for setting manual dispatcher quote */}
      {selectedPendingPriceRecord && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Dispatcher Price Quote</Text>
            
            <View style={styles.modalDetailsBox}>
              <Text style={styles.modalDetailsLabel}>Waybill #: <Text style={{ color: '#000' }}>{selectedPendingPriceRecord.waybillNumber}</Text></Text>
              <Text style={styles.modalDetailsLabel}>From: <Text style={{ color: '#000' }}>{selectedPendingPriceRecord.pickupLocationName}</Text></Text>
              <Text style={styles.modalDetailsLabel}>To: <Text style={{ color: '#000' }}>{selectedPendingPriceRecord.dropoffDestinationName}</Text></Text>
              <Text style={styles.modalDetailsLabel}>Cargo: <Text style={{ color: '#000' }}>{selectedPendingPriceRecord.parcelDescription}</Text></Text>
            </View>

            <Text style={styles.modalInputLabel}>Enter Quote Price ($) *</Text>
            <TextInput
              style={styles.modalInput}
              value={quotePrice}
              onChangeText={setQuotePrice}
              placeholder="e.g. 75.00"
              keyboardType="numeric"
              autoFocus
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setSelectedPendingPriceRecord(null);
                  setQuotePrice('');
                }}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm, !quotePrice.trim() && styles.modalBtnDisabled]}
                onPress={handleConfirmQuotePrice}
                disabled={!quotePrice.trim()}
              >
                <Text style={styles.modalBtnConfirmText}>Confirm Price</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  driverProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  driverNameLabel: {
    fontSize: 12,
    color: '#6C757D',
    fontWeight: 'bold',
    marginLeft: 6,
  },
  driverBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  driverBtnActive: {
    backgroundColor: '#007AFF',
  },
  driverBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#495057',
  },
  driverBtnTextActive: {
    color: '#FFF',
  },
  adminToggleBtn: {
    backgroundColor: '#E9ECEF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CED4DA',
  },
  adminToggleBtnActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  adminToggleBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
  },
  adminToggleBtnTextActive: {
    color: '#FFF',
  },
  networkSimulator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  networkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
  },
  syncBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 8,
  },
  syncStat: {
    flex: 1,
    alignItems: 'center',
  },
  syncVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
  },
  syncLabel: {
    fontSize: 10,
    color: '#6C757D',
    marginTop: 2,
  },
  pendingText: {
    color: '#FF9500',
  },
  conflictText: {
    color: '#FF3B30',
  },
  adminActionBar: {
    marginBottom: 10,
  },
  adminActionBtn: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminActionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  listContainer: {
    flex: 1,
    marginTop: 8,
  },
  listSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 8,
  },
  emptyState: {
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyStateText: {
    color: '#6C757D',
    fontSize: 12,
  },
  actionPromptText: {
    color: '#007AFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 8,
    marginVertical: 6,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  tabItemActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#495057',
  },
  tabTextActive: {
    color: '#FFF',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#E9ECEF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CED4DA',
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#495057',
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    alignItems: 'center',
  },
  tableCol: {
    paddingRight: 4,
  },
  tableWaybill: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#212529',
  },
  miniRushBadge: {
    backgroundColor: '#FFE5E5',
    alignSelf: 'flex-start',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginTop: 2,
  },
  miniRushText: {
    fontSize: 8,
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  tableText: {
    fontSize: 12,
    color: '#495057',
  },
  tableCompletedText: {
    fontSize: 11,
    color: '#385723',
    fontWeight: '600',
  },
  statusAssignCol: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  miniStatusTag: {
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 4,
  },
  miniStatusDraft: {
    backgroundColor: '#FFE5E5',
    color: '#FF3B30',
  },
  miniStatusTransit: {
    backgroundColor: '#FFF4E5',
    color: '#FF9500',
  },
  miniStatusCompleted: {
    backgroundColor: '#E2FBE9',
    color: '#34C759',
  },
  miniAssignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F4FD',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flex: 1,
    justifyContent: 'space-between',
  },
  miniDriverName: {
    fontSize: 11,
    color: '#004085',
    fontWeight: 'bold',
    flex: 1,
  },
  miniUnassignBtn: {
    marginLeft: 6,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniUnassignText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  miniDriverChips: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'flex-end',
  },
  miniChip: {
    backgroundColor: '#E9ECEF',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 3,
  },
  miniChipText: {
    fontSize: 9,
    color: '#495057',
    fontWeight: 'bold',
  },
  actionButtonBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: '#FFF',
    width: '85%',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDetailsBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  modalDetailsLabel: {
    fontSize: 11,
    color: '#6C757D',
    marginBottom: 4,
    fontWeight: '600',
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#000',
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  modalBtnCancel: {
    backgroundColor: '#E9ECEF',
  },
  modalBtnCancelText: {
    color: '#495057',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalBtnConfirm: {
    backgroundColor: '#34C759',
  },
  modalBtnConfirmText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalBtnDisabled: {
    opacity: 0.5,
  },
  signOutBtnCompact: {
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#FFC4C4',
  },
  signOutBtnCompactText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
