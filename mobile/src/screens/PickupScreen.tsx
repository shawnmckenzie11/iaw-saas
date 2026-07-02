import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  GestureResponderEvent,
} from 'react-native';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { db, DeliveryRecord, DeliveryStatus } from '../database/db';
import { syncManager } from '../services/SyncManager';

// Import suggestions database
import suggestionsData from '../database/suggestions.json';
import { calculatePrice, getLocationShortName, getNextWaybillNumber } from '../utils/pricing';

interface PickupScreenProps {
  record?: DeliveryRecord | null; // Mapped when opening an existing active pickup
  activeDriverId: string;
  onNavigateBack: () => void;
}

interface LocationDetail {
  address: string;
  lat: number;
  lon: number;
}

interface Point {
  x: number;
  y: number;
}

const suggestions = suggestionsData as {
  commonPickups: string[];
  conditionalDropoffs: Record<string, string[]>;
  locations: Record<string, LocationDetail>;
};

export default function PickupScreen({ record, activeDriverId, onNavigateBack }: PickupScreenProps) {
  // Stepper state (1: Pickup, 2: Dropoff, 3: Details, 4: Signature/Submit)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State variables
  const [pickupLocation, setPickupLocation] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupContact, setPickupContact] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');
  const [pickupLat, setPickupLat] = useState<number | undefined>(undefined);
  const [pickupLon, setPickupLon] = useState<number | undefined>(undefined);

  const [dropoffDestination, setDropoffDestination] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffContact, setDropoffContact] = useState('');
  const [dropoffPhone, setDropoffPhone] = useState('');
  const [dropoffLat, setDropoffLat] = useState<number | undefined>(undefined);
  const [dropoffLon, setDropoffLon] = useState<number | undefined>(undefined);

  const [description, setDescription] = useState('Standard Package');
  const [descriptionOption, setDescriptionOption] = useState<string>('Standard Package');
  const [quantity, setQuantity] = useState('1');
  const [weightLbs, setWeightLbs] = useState('');
  const [weightClass, setWeightClass] = useState('Weight: Under 75');
  const [weightClassOption, setWeightClassOption] = useState<string>('Weight: Under 75');
  const [skidRequired, setSkidRequired] = useState(false);
  const [podRequired, setPodRequired] = useState(false);
  const [optionalNotes, setOptionalNotes] = useState('');
  const [manualWaybill, setManualWaybill] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [vehicleType, setVehicleType] = useState('CAR');
  const [priority, setPriority] = useState<'REGULAR' | 'RUSH'>('REGULAR');
  const [comments, setComments] = useState('');
  const [pickupIsOther, setPickupIsOther] = useState(false);
  const [dropoffIsOther, setDropoffIsOther] = useState(false);
  const [showAllPickups, setShowAllPickups] = useState(false);
  const [showAllDropoffs, setShowAllDropoffs] = useState(false);

  // Signature and POD photo states
  const [signerName, setSignerName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [paths, setPaths] = useState<Point[][]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);

  // Search filter query states
  const [pickupSearchQuery, setPickupSearchQuery] = useState('');
  const [dropoffSearchQuery, setDropoffSearchQuery] = useState('');
  const [filteredPickupSuggestions, setFilteredPickupSuggestions] = useState<string[]>([]);
  const [filteredDropoffSuggestions, setFilteredDropoffSuggestions] = useState<string[]>([]);
  const [selectedPickupKey, setSelectedPickupKey] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initialize fields if editing an existing active pickup record
  useEffect(() => {
    if (record) {
      setPickupLocation(record.pickupLocationName);
      setPickupAddress(record.pickupAddress);
      setPickupContact(record.pickupContactName || '');
      setPickupPhone(record.pickupContactPhone || '');
      setPickupLat(record.pickupLatitude);
      setPickupLon(record.pickupLongitude);

      setDropoffDestination(record.dropoffDestinationName);
      setDropoffAddress(record.dropoffAddress);
      setDropoffContact(record.dropoffContactName || '');
      setDropoffPhone(record.dropoffContactPhone || '');
      setDropoffLat(record.dropoffLatitude);
      setDropoffLon(record.dropoffLongitude);

      if (record.parcelDescription === 'Standard Package') {
        setDescriptionOption('Standard Package');
        setDescription('Standard Package');
      } else {
        setDescriptionOption('Other');
        setDescription(record.parcelDescription);
      }

      setQuantity(String(record.parcelQuantity));
      setWeightLbs(record.parcelWeightLbs ? String(record.parcelWeightLbs) : '');
      
      const wClass = record.parcelWeightClass || 'Weight: Under 75';
      if (wClass === 'Weight: Under 75') {
        setWeightClassOption('Weight: Under 75');
        setWeightClass('Weight: Under 75');
      } else {
        setWeightClassOption('Other');
        setWeightClass(wClass);
      }

      setSkidRequired(record.skidRequired || false);
      setPodRequired(record.podRequired || false);
      setOptionalNotes(record.optionalNotes || '');
      if (record.waybillNumber && record.waybillNumber.startsWith('K')) {
        setManualWaybill(record.waybillNumber);
      } else {
        setManualWaybill('');
      }
      setDimensions(record.parcelDimensions || '');
      setVehicleType(record.vehicleType);
      setPriority(record.priority);
      setComments(record.additionalComments || '');

      setSignerName(record.signatureName || '');
      setPhotoUri(record.proofPhotoUrl || null);

      const commonPickups = suggestions.commonPickups;
      const commonDropoffs = suggestions.conditionalDropoffs[record.pickupLocationName] || [];
      setPickupIsOther(!commonPickups.includes(record.pickupLocationName));
      setDropoffIsOther(!commonDropoffs.includes(record.dropoffDestinationName));

      // Direct driver to Step 1 if pending pickup (DRAFT), otherwise Step 3 (Delivery finalization) for picked up jobs
      setCurrentStep(record.status === 'DRAFT' ? 1 : (record.status === 'PICKED_UP' ? 3 : 1));
    }
  }, [record]);

  // Touch drawing canvas PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const x = evt.nativeEvent.locationX;
        const y = evt.nativeEvent.locationY;
        setCurrentPath([{ x, y }]);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const x = evt.nativeEvent.locationX;
        const y = evt.nativeEvent.locationY;
        setCurrentPath(prev => [...prev, { x, y }]);
      },
      onPanResponderRelease: () => {
        if (currentPath.length > 0) {
          setPaths(prev => [...prev, currentPath]);
          setCurrentPath([]);
        }
      },
    })
  ).current;

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath([]);
  };

  // Smart selector filters
  useEffect(() => {
    if (pickupSearchQuery.trim().length > 1) {
      const query = pickupSearchQuery.toLowerCase();
      const allKnown = Object.keys(suggestions.locations);
      const matches = allKnown.filter(k => k.toLowerCase().includes(query) && !suggestions.commonPickups.slice(0, 6).includes(k));
      setFilteredPickupSuggestions(matches.slice(0, 5));
    } else {
      setFilteredPickupSuggestions([]);
    }
  }, [pickupSearchQuery]);

  useEffect(() => {
    if (dropoffSearchQuery.trim().length > 1) {
      const query = dropoffSearchQuery.toLowerCase();
      const allKnown = Object.keys(suggestions.locations);
      const activeConditional = selectedPickupKey ? (suggestions.conditionalDropoffs[selectedPickupKey] || []) : [];
      const matches = allKnown.filter(k => k.toLowerCase().includes(query) && !activeConditional.includes(k));
      setFilteredDropoffSuggestions(matches.slice(0, 5));
    } else {
      setFilteredDropoffSuggestions([]);
    }
  }, [dropoffSearchQuery, selectedPickupKey]);

  // Set selectors
  const handleSelectPickup = (name: string) => {
    setPickupLocation(name);
    setPickupSearchQuery('');
    setFilteredPickupSuggestions([]);
    
    const details = suggestions.locations[name];
    if (details) {
      setPickupAddress(details.address);
      setPickupLat(details.lat);
      setPickupLon(details.lon);
    }
    setSelectedPickupKey(name);
    
    // Clear dropoff destination on change of pickup
    setDropoffDestination('');
    setDropoffAddress('');
  };

  const handleSelectDropoff = (name: string) => {
    setDropoffDestination(name);
    setDropoffSearchQuery('');
    setFilteredDropoffSuggestions([]);
    
    const details = suggestions.locations[name];
    if (details) {
      setDropoffAddress(details.address);
      setDropoffLat(details.lat);
      setDropoffLon(details.lon);
    }
  };

  const handleCapturePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Camera permission required.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotoUri(result.assets[0].uri);
      }
    }
  };

  // Step Validation checks
  const isStepValid = (): boolean => {
    switch (currentStep) {
      case 1: {
        const isDescValid = descriptionOption === 'Other' ? !!description.trim() : true;
        const isWeightValid = weightClassOption === 'Other' ? !!weightClass.trim() : true;
        const isManualWaybillValid = !manualWaybill.trim() || /^K\d{5}$/.test(manualWaybill.trim());
        return !!pickupLocation && !!pickupAddress && isDescValid && isWeightValid && isManualWaybillValid;
      }
      case 2:
        return !!dropoffDestination && !!dropoffAddress;
      case 3:
        return true; // Recipient name and signature are optional, enabling database testing by default
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (isStepValid()) {
      setErrorMsg('');
      
      if (currentStep === 2) {
        setSaving(true);
        try {
          const clientUuid = record ? record.clientSideUuid : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
          const allRecs = await db.getDeliveryRecords();
          const existingWaybills = allRecs.map(r => r.waybillNumber);
          const waybillNum = record 
            ? record.waybillNumber 
            : (manualWaybill.trim() ? manualWaybill.trim() : getNextWaybillNumber(existingWaybills));

          const finalDesc = descriptionOption === 'Other' ? description : descriptionOption;
          const finalWeight = weightClassOption === 'Other' ? weightClass : weightClassOption;
          const pricing = calculatePrice(pickupLocation, dropoffDestination, finalWeight, skidRequired, priority);

          const transitRecord: DeliveryRecord = {
            id: record ? record.id : clientUuid,
            clientSideUuid: clientUuid,
            waybillNumber: waybillNum,
            status: 'PICKED_UP', // Save as pending-delivery (picked up)
            syncStatus: 'PENDING',
            driverId: record ? record.driverId : (activeDriverId || null),
            vehicleType,
            parcelDescription: finalDesc,
            parcelQuantity: 1,
            parcelWeightLbs: parseFloat(weightLbs) || undefined,
            parcelWeightClass: finalWeight,
            skidRequired,
            podRequired,
            pickupLocationName: pickupLocation,
            pickupAddress,
            pickupContactName: pickupContact || undefined,
            pickupContactPhone: pickupPhone || undefined,
            pickupLatitude: pickupLat,
            pickupLongitude: pickupLon,
            dropoffDestinationName: dropoffDestination,
            dropoffAddress,
            dropoffContactName: dropoffContact || undefined,
            dropoffContactPhone: dropoffPhone || undefined,
            dropoffLatitude: dropoffLat,
            dropoffLongitude: dropoffLon,
            priority,
            businessOrResidential: 'Business',
            additionalComments: comments || undefined,
            createdAt: record ? record.createdAt : new Date().toISOString(),
            capturedAt: record ? record.capturedAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            calculatedPrice: pricing.price,
            priceCategory: pricing.category
          };

          await db.saveDeliveryRecord(transitRecord);
          syncManager.syncQueue();

          // Always close the Waybill window and return to dashboard. 
          // The Sign section will be triggered when opened from the dashboard table.
          onNavigateBack();
        } catch (err: any) {
          setErrorMsg(`Auto-save failed: ${err.message}`);
        } finally {
          setSaving(false);
        }
      } else {
        setCurrentStep(prev => prev + 1);
      }
    } else {
      setErrorMsg('Please complete all required fields (*).');
    }
  };

  const handleBack = () => {
    setErrorMsg('');
    setCurrentStep(prev => prev - 1);
  };

  const handleQueuePending = async () => {
    if (!isStepValid()) {
      setErrorMsg('Please complete all required fields.');
      return;
    }
    setSaving(true);
    try {
      const clientUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      const allRecs = await db.getDeliveryRecords();
      const existingWaybills = allRecs.map(r => r.waybillNumber);
      const waybillNum = manualWaybill.trim() ? manualWaybill.trim() : getNextWaybillNumber(existingWaybills);

      const finalDesc = descriptionOption === 'Other' ? description : descriptionOption;
      const finalWeight = weightClassOption === 'Other' ? weightClass : weightClassOption;
      const pricing = calculatePrice(pickupLocation, dropoffDestination || 'Pending Dropoff', weightClass, skidRequired, priority);

      const draftRecord: DeliveryRecord = {
        id: clientUuid,
        clientSideUuid: clientUuid,
        waybillNumber: waybillNum,
        status: 'DRAFT',
        syncStatus: 'PENDING',
        driverId: null, // Queued for admin assign
        vehicleType,
        parcelDescription: finalDesc,
        parcelQuantity: 1,
        parcelWeightClass: finalWeight,
        skidRequired,
        pickupLocationName: pickupLocation,
        pickupAddress,
        pickupContactName: pickupContact || undefined,
        pickupContactPhone: pickupPhone || undefined,
        pickupLatitude: pickupLat || 46.49,
        pickupLongitude: pickupLon || -80.99,
        dropoffDestinationName: dropoffDestination || 'Pending Dropoff',
        dropoffAddress: dropoffAddress || 'Pending Address',
        priority,
        createdAt: new Date().toISOString(),
        capturedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calculatedPrice: pricing.price,
        priceCategory: pricing.category
      };
      await db.saveDeliveryRecord(draftRecord);
      syncManager.syncQueue();
      onNavigateBack();
    } catch (e: any) {
      setErrorMsg(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPickup = async () => {
    if (!isStepValid()) {
      setErrorMsg('Please complete all required fields.');
      return;
    }
    setSaving(true);
    try {
      const clientUuid = record ? record.clientSideUuid : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      const allRecs = await db.getDeliveryRecords();
      const existingWaybills = allRecs.map(r => r.waybillNumber);
      const waybillNum = record 
        ? record.waybillNumber 
        : (manualWaybill.trim() ? manualWaybill.trim() : getNextWaybillNumber(existingWaybills));

      const finalDesc = descriptionOption === 'Other' ? description : descriptionOption;
      const finalWeight = weightClassOption === 'Other' ? weightClass : weightClassOption;
      const pricing = calculatePrice(pickupLocation, dropoffDestination || 'Pending Dropoff', weightClass, skidRequired, priority);

      const transitRecord: DeliveryRecord = {
        id: record ? record.id : clientUuid,
        clientSideUuid: clientUuid,
        waybillNumber: waybillNum,
        status: 'PICKED_UP', // Mark as picked up (in transit)
        syncStatus: 'PENDING',
        driverId: activeDriverId,
        vehicleType,
        parcelDescription: finalDesc,
        parcelQuantity: 1,
        parcelWeightClass: finalWeight,
        skidRequired,
        pickupLocationName: pickupLocation,
        pickupAddress,
        pickupContactName: pickupContact || undefined,
        pickupContactPhone: pickupPhone || undefined,
        pickupLatitude: pickupLat || 46.49,
        pickupLongitude: pickupLon || -80.99,
        dropoffDestinationName: dropoffDestination || 'Pending Dropoff',
        dropoffAddress: dropoffAddress || 'Pending Address',
        priority,
        createdAt: record ? record.createdAt : new Date().toISOString(),
        capturedAt: record ? record.capturedAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calculatedPrice: pricing.price,
        priceCategory: pricing.category
      };
      await db.saveDeliveryRecord(transitRecord);
      syncManager.syncQueue();
      
      // Move to Step 2 (Dropoff)
      setCurrentStep(2);
    } catch (e: any) {
      setErrorMsg(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePendingDelivery = async () => {
    setSaving(true);
    try {
      const clientUuid = record ? record.clientSideUuid : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      const allRecs = await db.getDeliveryRecords();
      const existingWaybills = allRecs.map(r => r.waybillNumber);
      const waybillNum = record 
        ? record.waybillNumber 
        : (manualWaybill.trim() ? manualWaybill.trim() : getNextWaybillNumber(existingWaybills));

      const finalDesc = descriptionOption === 'Other' ? description : descriptionOption;
      const finalWeight = weightClassOption === 'Other' ? weightClass : weightClassOption;
      const pricing = calculatePrice(pickupLocation, dropoffDestination, weightClass, skidRequired, priority);

      const transitRecord: DeliveryRecord = {
        id: record ? record.id : clientUuid,
        clientSideUuid: clientUuid,
        waybillNumber: waybillNum,
        status: 'PICKED_UP', // Save as pending-delivery (picked up)
        syncStatus: 'PENDING',
        driverId: activeDriverId,
        vehicleType,
        parcelDescription: finalDesc,
        parcelQuantity: 1,
        parcelWeightClass: finalWeight,
        skidRequired,
        pickupLocationName: pickupLocation,
        pickupAddress,
        pickupContactName: pickupContact || undefined,
        pickupContactPhone: pickupPhone || undefined,
        pickupLatitude: pickupLat || 46.49,
        pickupLongitude: pickupLon || -80.99,
        dropoffDestinationName: dropoffDestination,
        dropoffAddress: dropoffAddress,
        dropoffContactName: dropoffContact || undefined,
        dropoffContactPhone: dropoffPhone || undefined,
        priority,
        createdAt: record ? record.createdAt : new Date().toISOString(),
        capturedAt: record ? record.capturedAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        signatureName: signerName || undefined,
        proofPhotoUrl: photoUri || undefined,
        calculatedPrice: pricing.price,
        priceCategory: pricing.category
      };
      await db.saveDeliveryRecord(transitRecord);
      syncManager.syncQueue();
      onNavigateBack();
    } catch (e: any) {
      setErrorMsg(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Final Submit Waybill Complete and e-Signatures
  const handleFinalSubmit = async () => {
    if (!isStepValid()) {
      setErrorMsg('Please enter recipient printed name and sign.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      let finalPickupLat = pickupLat;
      let finalPickupLon = pickupLon;
      let finalDropoffLat = dropoffLat;
      let finalDropoffLon = dropoffLon;

      // If we don't have predefined GPS, fetch current
      if (!finalPickupLat || !finalPickupLon || !finalDropoffLat || !finalDropoffLon) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (!finalPickupLat) {
              finalPickupLat = loc.coords.latitude;
              finalPickupLon = loc.coords.longitude;
            }
            if (!finalDropoffLat) {
              finalDropoffLat = loc.coords.latitude;
              finalDropoffLon = loc.coords.longitude;
            }
          }
        } catch (gpsErr) {
          console.warn('GPS resolve failed:', gpsErr);
        }
      }

      const hasSignature = paths.length > 0;
      const signatureBase64 = hasSignature 
        ? 'data:image/svg+xml;base64,' + (Platform.OS === 'web' ? btoa(JSON.stringify(paths)) : Buffer.from(JSON.stringify(paths)).toString('base64'))
        : undefined;

      const deliveredAt = new Date().toISOString();
      const consentText = hasSignature 
        ? "I hereby confirm receipt of the parcel(s) described on this waybill in good order and condition. I agree that my electronic signature represents my consent and approval."
        : undefined;
      const clientUuid = record ? record.clientSideUuid : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      const allRecs = await db.getDeliveryRecords();
      const existingWaybills = allRecs.map(r => r.waybillNumber);
      const waybillNum = record 
        ? record.waybillNumber 
        : (manualWaybill.trim() ? manualWaybill.trim() : getNextWaybillNumber(existingWaybills));

      // Cryptographic signature hash including image content (only if signature details exist)
      const signatureHash = (hasSignature || signerName)
        ? await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `${signatureBase64 || ''}|${clientUuid}|${deliveredAt}|${signerName}|${activeDriverId}`
          )
        : undefined;

      const finalDesc = descriptionOption === 'Other' ? description : descriptionOption;
      const finalWeight = weightClassOption === 'Other' ? weightClass : weightClassOption;
      const pricing = calculatePrice(pickupLocation, dropoffDestination, weightClass, skidRequired, priority);

      const finalRecord: DeliveryRecord = {
        id: record ? record.id : clientUuid,
        clientSideUuid: clientUuid,
        waybillNumber: waybillNum,
        status: 'DELIVERED', // Complete delivery
        syncStatus: 'PENDING',
        driverId: activeDriverId,
        vehicleType,
        parcelDescription: finalDesc,
        parcelQuantity: 1,
        parcelWeightLbs: parseFloat(weightLbs) || undefined,
        parcelWeightClass: finalWeight,
        skidRequired,
        parcelDimensions: dimensions || undefined,
        pickupLocationName: pickupLocation,
        pickupAddress,
        pickupContactName: pickupContact || undefined,
        pickupContactPhone: pickupPhone || undefined,
        pickupLatitude: finalPickupLat || 46.49,
        pickupLongitude: finalPickupLon || -80.99,
        dropoffDestinationName: dropoffDestination,
        dropoffAddress,
        dropoffContactName: dropoffContact || undefined,
        dropoffContactPhone: dropoffPhone || undefined,
        dropoffLatitude: finalDropoffLat || 46.49,
        dropoffLongitude: finalDropoffLon || -80.99,
        priority,
        additionalComments: comments || undefined,
        createdAt: record ? record.createdAt : deliveredAt,
        capturedAt: record ? record.capturedAt : deliveredAt,
        signedAt: deliveredAt,
        deliveredAt,
        signatureName: signerName,
        signatureImageUrl: signatureBase64,
        signatureHash,
        signatureConsentText: consentText,
        signatureIpAddress: Platform.OS === 'web' ? '127.0.0.1' : '192.168.1.1',
        signatureGpsLatitude: finalDropoffLat || 46.49,
        signatureGpsLongitude: finalDropoffLon || -80.99,
        proofPhotoUrl: photoUri || undefined,
        updatedAt: deliveredAt,
        calculatedPrice: pricing.price,
        priceCategory: pricing.category
      };

      await db.saveDeliveryRecord(finalRecord);
      syncManager.syncQueue();
      onNavigateBack();
    } catch (e: any) {
      setErrorMsg(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // UI Progress Stepper Header
  const renderProgressStepper = () => {
    const steps = [
      { num: 1, label: 'Pickup' },
      { num: 2, label: 'Dropoff' },
      { num: 3, label: 'Sign' }
    ];
    return (
      <View style={styles.stepperContainer}>
        {steps.map((st, idx) => (
          <React.Fragment key={st.num}>
            <View style={styles.stepIndicator}>
              <View style={[
                styles.stepBadge,
                currentStep === st.num && styles.stepBadgeActive,
                currentStep > st.num && styles.stepBadgeCompleted
              ]}>
                {currentStep > st.num ? (
                  <Text style={styles.stepBadgeTextActive}>✓</Text>
                ) : (
                  <Text style={[styles.stepBadgeText, currentStep === st.num && styles.stepBadgeTextActive]}>
                    {st.num}
                  </Text>
                )}
              </View>
              <Text style={[styles.stepLabel, currentStep === st.num && styles.stepLabelActive]}>
                {st.label}
              </Text>
            </View>
            {idx < steps.length - 1 && (
              <View style={[styles.stepLine, currentStep > st.num && styles.stepLineCompleted]} />
            )}
          </React.Fragment>
        ))}
      </View>
    );
  };

  // Render Step 4 Summary
  const renderSummaryCard = () => {
    const pricingEst = calculatePrice(pickupLocation, dropoffDestination, weightClass, skidRequired, priority);
    return (
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>
          Waybill {record ? record.waybillNumber : (manualWaybill.trim() || 'Pending')}
        </Text>
        
        <View style={styles.summarySection}>
          <Text style={styles.summarySectionLabel}>🚩 PICKUP LOCATION</Text>
          <Text style={styles.summarySectionVal}>{pickupLocation}</Text>
          <Text style={styles.summarySectionSub}>{pickupAddress}</Text>
          {pickupContact ? <Text style={styles.summarySectionSub}>Contact: {pickupContact} ({pickupPhone || 'No Phone'})</Text> : null}
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.summarySectionLabel}>🏁 DROPOFF DESTINATION</Text>
          <Text style={styles.summarySectionVal}>{dropoffDestination}</Text>
          <Text style={styles.summarySectionSub}>{dropoffAddress}</Text>
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.summarySectionLabel}>📦 DELIVERY DETAILS</Text>
          <Text style={styles.summarySectionVal}>{description}</Text>
          <Text style={styles.summarySectionSub}>
            Weight: {weightClass} | Priority: {priority} | Skid: {skidRequired ? 'Yes' : 'No'}
          </Text>
          {comments ? <Text style={styles.summarySectionSub}>Comments: {comments}</Text> : null}
        </View>

        {!activeDriverId && (
          <View style={styles.summarySection}>
            <Text style={styles.summarySectionLabel}>💰 ESTIMATED PRICE</Text>
            <Text style={styles.summarySectionVal}>
              {pricingEst.price > 0 ? `$${pricingEst.price.toFixed(2)}` : 'Manual / Pending Dispatcher Quote'}
            </Text>
            <Text style={styles.summarySectionSub}>{pricingEst.category}</Text>
          </View>
        )}
      </View>
    );
  };

  const popularPickups = ["Mobile Parts Inc.", "Wajax", "Sandvik Mining", "Onaping Depth Project (ODP)", "Komatsu (260)", "Epiroc Lively", "Rastall", "Staples"];
  
  const filteredPickups = suggestions.commonPickups.filter(name => popularPickups.includes(name));
  const showAllPickupsTrigger = showAllPickups || filteredPickups.length === 0;
  const quickPickups = showAllPickupsTrigger 
    ? suggestions.commonPickups 
    : filteredPickups;

  const baseDropoffs = selectedPickupKey && suggestions.conditionalDropoffs[selectedPickupKey]
    ? suggestions.conditionalDropoffs[selectedPickupKey]
    : suggestions.commonPickups.filter(name => name !== pickupLocation);
  
  const filteredDropoffs = baseDropoffs.filter(name => popularPickups.includes(name));
  const showAllDropoffsTrigger = showAllDropoffs || filteredDropoffs.length === 0;
  const quickDropoffs = showAllDropoffsTrigger 
    ? baseDropoffs 
    : filteredDropoffs;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardContainer}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Navigation Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onNavigateBack} style={styles.backHeaderBtn}>
            <Text style={styles.backHeaderBtnText}>⬅ Exit</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {record ? `Signoff Waybill: ${record.waybillNumber}` : 'New Delivery capture'}
          </Text>
        </View>

        {/* Stepper progress display */}
        {renderProgressStepper()}

        {errorMsg ? <Text style={styles.errorBox}>{errorMsg}</Text> : null}

        {/* ----------------- STEP 1: PICKUP & CARGO DETAILS ----------------- */}
        {currentStep === 1 && (
          <View style={styles.card}>
            
            <View style={styles.prominentSection}>
              <Text style={styles.inputLabel}>Quick Select Pickup Location:</Text>
              <ScrollView 
                horizontal={true} 
                showsHorizontalScrollIndicator={false}
                style={styles.presetsHorizontalScroller}
              >
                <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                  {quickPickups.map((name) => (
                    <TouchableOpacity
                      key={`p-quick-${name}`}
                      style={[
                        styles.quickSelectBtn,
                        pickupLocation === name && !pickupIsOther && styles.quickSelectBtnActive
                      ]}
                      onPress={() => {
                        setPickupIsOther(false);
                        handleSelectPickup(name);
                      }}
                    >
                      <Text style={[
                        styles.quickSelectBtnText,
                        pickupLocation === name && !pickupIsOther && styles.quickSelectBtnTextActive
                      ]}>
                        {getLocationShortName(name)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  
                  {/* More button */}
                  {!showAllPickupsTrigger && (
                    <TouchableOpacity
                      style={styles.quickSelectBtn}
                      onPress={() => setShowAllPickups(true)}
                    >
                      <Text style={styles.quickSelectBtnText}>
                        More...
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[
                      styles.quickSelectBtn,
                      pickupIsOther && styles.quickSelectBtnActive
                    ]}
                    onPress={() => {
                      setPickupIsOther(true);
                      setPickupLocation('');
                      setPickupAddress('');
                      setPickupContact('');
                      setPickupPhone('');
                      setSelectedPickupKey(null);
                    }}
                  >
                    <Text style={[
                      styles.quickSelectBtnText,
                      pickupIsOther && styles.quickSelectBtnTextActive
                    ]}>
                      Other
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {pickupIsOther && (
                <>
                  <Text style={styles.label}>Search known businesses:</Text>
                  <TextInput
                    style={styles.input}
                    value={pickupSearchQuery}
                    onChangeText={setPickupSearchQuery}
                    placeholder="Search e.g. Sandvik..."
                  />
                  {filteredPickupSuggestions.length > 0 && (
                    <View style={styles.suggestionBox}>
                      {filteredPickupSuggestions.map((name) => (
                        <TouchableOpacity
                          key={`p-suggest-${name}`}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setPickupIsOther(false);
                            handleSelectPickup(name);
                          }}
                        >
                          <Text style={styles.suggestionItemText}>{name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>

            {pickupIsOther && (
              <View style={styles.compactFrame}>
                <Text style={styles.compactFrameTitle}>Pickup Details Verification</Text>
                
                <Text style={styles.label}>Pickup Location Name *</Text>
                <TextInput
                  style={styles.input}
                  value={pickupLocation}
                  onChangeText={(txt) => {
                    setPickupLocation(txt);
                    setSelectedPickupKey(null);
                  }}
                  placeholder="Location name"
                />

                <Text style={styles.label}>Pickup Address *</Text>
                <TextInput
                  style={styles.input}
                  value={pickupAddress}
                  onChangeText={setPickupAddress}
                  placeholder="Street Address"
                />

                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.label}>Contact Person</Text>
                    <TextInput
                      style={styles.input}
                      value={pickupContact}
                      onChangeText={setPickupContact}
                      placeholder="Name"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Phone Number</Text>
                    <TextInput
                      style={styles.input}
                      value={pickupPhone}
                      onChangeText={setPickupPhone}
                      placeholder="Phone"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
              </View>
            )}

            <View style={styles.compactFrame}>
              <Text style={styles.compactFrameTitle}>Delivery Details</Text>
              
              <Text style={styles.label}>Optional Manual Waybill #</Text>
              <TextInput
                style={styles.input}
                value={manualWaybill}
                onChangeText={(text) => {
                  let cleaned = text.toUpperCase();
                  if (cleaned.length > 0 && !cleaned.startsWith('K')) {
                    cleaned = 'K' + cleaned.replace(/[^0-9]/g, '');
                  } else {
                    cleaned = 'K' + cleaned.slice(1).replace(/[^0-9]/g, '');
                  }
                  if (cleaned.length > 6) {
                    cleaned = cleaned.slice(0, 6);
                  }
                  setManualWaybill(cleaned === 'K' ? '' : cleaned);
                }}
                placeholder="Starts with K followed by 5 digits (e.g. K00001)"
                maxLength={6}
                autoCapitalize="characters"
              />
              {manualWaybill.trim().length > 0 && !/^K\d{5}$/.test(manualWaybill.trim()) && (
                <Text style={{ color: '#FF3B30', fontSize: 10, marginBottom: 8, fontWeight: 'bold' }}>
                  ⚠️ Invalid format. Must be K followed by 5 digits (e.g. K00001)
                </Text>
              )}
              
              <Text style={styles.label}>Delivery Details *</Text>
              <View style={styles.pickerRow}>
                {['Standard Package', 'Other'].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.pickerOption,
                      descriptionOption === opt && styles.pickerOptionActive,
                    ]}
                    onPress={() => {
                      setDescriptionOption(opt);
                      if (opt !== 'Other') {
                        setDescription(opt);
                      } else {
                        setDescription('');
                      }
                    }}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      descriptionOption === opt && styles.pickerOptionTextActive,
                    ]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {descriptionOption === 'Other' && (
                <TextInput
                  style={styles.input}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Enter custom delivery details..."
                />
              )}

              <Text style={styles.label}>Weight Range *</Text>
              <View style={styles.pickerRow}>
                {['Weight: Under 75', 'Other'].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.pickerOption,
                      weightClassOption === opt && styles.pickerOptionActive,
                    ]}
                    onPress={() => {
                      setWeightClassOption(opt);
                      if (opt !== 'Other') {
                        setWeightClass(opt);
                      } else {
                        setWeightClass('');
                      }
                    }}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      weightClassOption === opt && styles.pickerOptionTextActive,
                    ]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {weightClassOption === 'Other' && (
                <TextInput
                  style={styles.input}
                  value={weightClass}
                  onChangeText={setWeightClass}
                  placeholder="Enter custom weight range..."
                />
              )}

              {/* Checkboxes */}
              <TouchableOpacity 
                style={styles.checkboxRow}
                onPress={() => setPriority(priority === 'REGULAR' ? 'RUSH' : 'REGULAR')}
              >
                <View style={[styles.checkbox, priority === 'RUSH' && styles.checkboxChecked]}>
                  {priority === 'RUSH' && <Text style={styles.checkboxCheckmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Rush Delivery (Priority)</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.checkboxRow}
                onPress={() => setSkidRequired(!skidRequired)}
              >
                <View style={[styles.checkbox, skidRequired && styles.checkboxChecked]}>
                  {skidRequired && <Text style={styles.checkboxCheckmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Skid Required</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.checkboxRow}
                onPress={() => setPodRequired(!podRequired)}
              >
                <View style={[styles.checkbox, podRequired && styles.checkboxChecked]}>
                  {podRequired && <Text style={styles.checkboxCheckmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Proof of Delivery Required (Signature & Signoff)</Text>
              </TouchableOpacity>
            </View>

          </View>
        )}

        {/* ----------------- STEP 2: DROPOFF BUSINESS ----------------- */}
        {currentStep === 2 && (
          <View style={styles.card}>
            
            <View style={styles.prominentSection}>
              <Text style={styles.inputLabel}>Quick Select Dropoff Destination:</Text>
              <ScrollView 
                horizontal={true} 
                showsHorizontalScrollIndicator={false}
                style={styles.presetsHorizontalScroller}
              >
                <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                  {quickDropoffs.map((name) => (
                    <TouchableOpacity
                      key={`d-quick-${name}`}
                      style={[
                        styles.quickSelectBtn,
                        dropoffDestination === name && !dropoffIsOther && styles.quickSelectBtnActive
                      ]}
                      onPress={() => {
                        setDropoffIsOther(false);
                        handleSelectDropoff(name);
                      }}
                    >
                      <Text style={[
                        styles.quickSelectBtnText,
                        dropoffDestination === name && !dropoffIsOther && styles.quickSelectBtnTextActive
                      ]}>
                        {getLocationShortName(name)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  
                  {/* More button */}
                  {!showAllDropoffsTrigger && (
                    <TouchableOpacity
                      style={styles.quickSelectBtn}
                      onPress={() => setShowAllDropoffs(true)}
                    >
                      <Text style={styles.quickSelectBtnText}>
                        More...
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[
                      styles.quickSelectBtn,
                      dropoffIsOther && styles.quickSelectBtnActive
                    ]}
                    onPress={() => {
                      setDropoffIsOther(true);
                      setDropoffDestination('');
                      setDropoffAddress('');
                      setDropoffContact('');
                      setDropoffPhone('');
                    }}
                  >
                    <Text style={[
                      styles.quickSelectBtnText,
                      dropoffIsOther && styles.quickSelectBtnTextActive
                    ]}>
                      Other
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {dropoffIsOther && (
                <>
                  <Text style={styles.label}>Search known destinations:</Text>
                  <TextInput
                    style={styles.input}
                    value={dropoffSearchQuery}
                    onChangeText={setDropoffSearchQuery}
                    placeholder="Search e.g. Redpath..."
                  />
                  {filteredDropoffSuggestions.length > 0 && (
                    <View style={styles.suggestionBox}>
                      {filteredDropoffSuggestions.map((name) => (
                        <TouchableOpacity
                          key={`d-suggest-${name}`}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setDropoffIsOther(false);
                            handleSelectDropoff(name);
                          }}
                        >
                          <Text style={styles.suggestionItemText}>{name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>

            {dropoffIsOther && (
              <View style={styles.compactFrame}>
                <Text style={styles.compactFrameTitle}>Dropoff Details Verification</Text>
                
                <Text style={styles.label}>Dropoff Location/Destination *</Text>
                <TextInput
                  style={styles.input}
                  value={dropoffDestination}
                  onChangeText={setDropoffDestination}
                  placeholder="Destination name"
                />

                <Text style={styles.label}>Dropoff Address *</Text>
                <TextInput
                  style={styles.input}
                  value={dropoffAddress}
                  onChangeText={setDropoffAddress}
                  placeholder="Street Address"
                />

                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.label}>Receiver Contact</Text>
                    <TextInput
                      style={styles.input}
                      value={dropoffContact}
                      onChangeText={setDropoffContact}
                      placeholder="Name"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Receiver Phone</Text>
                    <TextInput
                      style={styles.input}
                      value={dropoffPhone}
                      onChangeText={setDropoffPhone}
                      placeholder="Phone"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ----------------- STEP 3: SIGNATURE SIGN-OFF & SUMMARY ----------------- */}
        {currentStep === 3 && (
          <View style={styles.card}>
            
            {/* Visual Summary Card */}
            {renderSummaryCard()}

            {podRequired ? (
              <>
                <Text style={styles.sectionLabel}>Proof of Delivery Signature</Text>

                <Text style={styles.label}>Printed Recipient Name *</Text>
                <TextInput
                  style={styles.input}
                  value={signerName}
                  onChangeText={setSignerName}
                  placeholder="Recipient Printed Name"
                />

                {/* Photo Capture */}
                <View style={{ marginBottom: 12 }}>
                  {photoUri ? (
                    <View style={styles.photoContainer}>
                      <Text style={styles.photoSuccessText}>✓ Proof Photo Captured</Text>
                      <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => setPhotoUri(null)}>
                        <Text style={styles.photoRemoveText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.photoBtn} onPress={handleCapturePhoto}>
                      <Text style={styles.photoBtnText}>📷 CAPTURE PROOF PHOTO (OPTIONAL)</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Legal Consent Disclaimer */}
                <View style={styles.consentBox}>
                  <Text style={styles.consentTitle}>Legal Consent Receipt</Text>
                  <Text style={styles.consentBody}>
                    I hereby confirm receipt of the parcel(s) described on this waybill in good order and condition.
                    I agree that my electronic signature represents my consent and approval.
                  </Text>
                </View>

                <Text style={[styles.label, { marginTop: 10 }]}>Draw Signature Box *</Text>
                <View style={styles.canvasContainer} {...panResponder.panHandlers}>
                  {paths.map((path, idx) => (
                    <View key={`path-${idx}`} style={styles.absoluteDraw}>
                      {path.map((pt, pIdx) => (
                        <View
                          key={`pt-${pIdx}`}
                          style={[
                            styles.dot,
                            { left: pt.x - 2, top: pt.y - 2 }
                          ]}
                        />
                      ))}
                    </View>
                  ))}
                  {currentPath.map((pt, pIdx) => (
                    <View
                      key={`current-pt-${pIdx}`}
                      style={[
                        styles.dot,
                        { left: pt.x - 2, top: pt.y - 2, backgroundColor: '#007AFF' }
                      ]}
                    />
                  ))}
                  {paths.length === 0 && currentPath.length === 0 && (
                    <Text style={styles.canvasPlaceholder}>Draw your signature with finger here</Text>
                  )}
                </View>

                <TouchableOpacity style={styles.clearBtn} onPress={clearCanvas}>
                  <Text style={styles.clearBtnText}>❌ Clear Canvas</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Delivery Confirmation</Text>
                <Text style={styles.label}>Optional Notes / Delivery Comments</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  value={optionalNotes}
                  onChangeText={setOptionalNotes}
                  placeholder="Enter optional notes..."
                  multiline
                />
              </>
            )}
          </View>
        )}

        {/* ----------------- STEPPER NAVIGATION CONTROLS ----------------- */}
        <View style={styles.navigationRow}>
          {currentStep > 1 && (
            // Hide back button on Step 2 if waybill is already PICKED_UP (In Transit)
            !(currentStep === 2 && record && record.status === 'PICKED_UP') && (
              <TouchableOpacity 
                style={[styles.navBtn, styles.navBtnBack]} 
                onPress={handleBack}
                disabled={saving}
              >
                <Text style={styles.navBtnTextBack}>⬅ Back</Text>
              </TouchableOpacity>
            )
          )}

          {currentStep === 1 ? (
            <View style={styles.checkoutOptionsRow}>
              {(!record || record.status === 'DRAFT') && (
                <TouchableOpacity
                  style={[styles.checkoutBtn, styles.confirmBtn, !isStepValid() && styles.checkoutBtnDisabled]}
                  onPress={handleConfirmPickup}
                  disabled={!isStepValid() || saving}
                >
                  <Text style={styles.checkoutBtnText}>Confirm Pickup (To Inventory) 🚚</Text>
                </TouchableOpacity>
              )}
              {!record && (
                <TouchableOpacity
                  style={[styles.checkoutBtn, styles.queueBtn, !isStepValid() && styles.checkoutBtnDisabled]}
                  onPress={handleQueuePending}
                  disabled={!isStepValid() || saving}
                >
                  <Text style={styles.checkoutBtnText}>Queue Pending Pickup 📋</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : currentStep < 3 ? (
            <TouchableOpacity 
              style={[styles.navBtn, styles.navBtnNext, !isStepValid() && styles.navBtnDisabled]} 
              onPress={handleNext}
              disabled={!isStepValid()}
            >
              <Text style={styles.navBtnTextNext}>Confirm Drop Off Location ➡</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1, flexDirection: 'column' }}>
              <TouchableOpacity 
                style={[styles.submitBtn, (!isStepValid() || saving) && styles.submitBtnDisabled]} 
                onPress={handleFinalSubmit}
                disabled={!isStepValid() || saving}
              >
                <Text style={styles.submitBtnText}>
                  {saving ? 'Processing Sync...' : (podRequired ? '✔ SUBMIT & LOG WAYBILL' : '✔ Confirm Delivery')}
                </Text>
              </TouchableOpacity>
              {podRequired && (
                <TouchableOpacity
                  style={styles.savePendingBtn}
                  onPress={handleSavePendingDelivery}
                  disabled={saving}
                >
                  <Text style={styles.savePendingBtnText}>💾 Save as Pending-Delivery</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  prominentSection: {
    backgroundColor: '#FFF',
    marginBottom: 8,
  },
  compactFrame: {
    backgroundColor: '#F1F3F5',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CED4DA',
    marginTop: 14,
  },
  compactFrameTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#E9ECEF',
    borderRadius: 6,
    marginRight: 12,
  },
  backHeaderBtnText: {
    fontSize: 14,
    color: '#495057',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    flex: 1,
  },
  errorBox: {
    backgroundColor: '#FFF2F2',
    color: '#FF3B30',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF3B30',
    marginVertical: 10,
    fontWeight: 'bold',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 16,
  },
  stepIndicator: {
    alignItems: 'center',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeActive: {
    backgroundColor: '#007AFF',
  },
  stepBadgeCompleted: {
    backgroundColor: '#34C759',
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6C757D',
  },
  stepBadgeTextActive: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  stepLabel: {
    fontSize: 10,
    color: '#6C757D',
    marginTop: 4,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E9ECEF',
    marginHorizontal: 4,
    marginTop: -14, // align with badge centers
  },
  stepLineCompleted: {
    backgroundColor: '#34C759',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 6,
  },
  presetsHorizontalScroller: {
    paddingVertical: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 8,
  },
  quickSelectContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  quickSelectBtn: {
    backgroundColor: '#E9ECEF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  quickSelectBtnActive: {
    backgroundColor: '#007AFF',
  },
  quickSelectBtnText: {
    fontSize: 11,
    color: '#495057',
  },
  quickSelectBtnTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    color: '#212529',
    marginBottom: 12,
  },
  suggestionBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 6,
    marginTop: -8,
    marginBottom: 12,
    zIndex: 10,
    overflow: 'hidden',
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  suggestionItemText: {
    fontSize: 13,
    color: '#212529',
  },
  multilineInput: {
    height: 60,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  pickerOption: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  pickerOptionActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  pickerOptionText: {
    fontSize: 12,
    color: '#495057',
  },
  pickerOptionTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  summaryCard: {
    backgroundColor: '#F1F3F5',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CED4DA',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DEE2E6',
    paddingBottom: 6,
  },
  summarySection: {
    marginBottom: 10,
  },
  summarySectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  summarySectionVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
    marginTop: 1,
  },
  summarySectionSub: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 1,
  },
  consentBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginVertical: 8,
  },
  consentTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 2,
  },
  consentBody: {
    fontSize: 11,
    color: '#6C757D',
    lineHeight: 15,
  },
  canvasContainer: {
    height: 180,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  canvasPlaceholder: {
    position: 'absolute',
    left: 20,
    top: 80,
    right: 20,
    textAlign: 'center',
    color: '#ADB5BD',
    fontSize: 13,
  },
  absoluteDraw: {
    ...StyleSheet.absoluteFillObject,
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#212529',
  },
  clearBtn: {
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  clearBtnText: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  photoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E2F0D9',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A9D08E',
  },
  photoSuccessText: {
    color: '#385723',
    fontSize: 13,
    fontWeight: 'bold',
  },
  photoRemoveBtn: {
    backgroundColor: '#FFF2F2',
    padding: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  photoRemoveText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: 'bold',
  },
  photoBtn: {
    backgroundColor: '#E9ECEF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#007AFF',
    borderRadius: 6,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoBtnText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  navigationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  navBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnBack: {
    backgroundColor: '#E9ECEF',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#CED4DA',
  },
  navBtnNext: {
    backgroundColor: '#007AFF',
  },
  navBtnDisabled: {
    backgroundColor: '#B3D7FF',
  },
  navBtnTextBack: {
    color: '#495057',
    fontSize: 16,
    fontWeight: 'bold',
  },
  navBtnTextNext: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submitBtn: {
    flex: 1,
    backgroundColor: '#34C759',
    borderRadius: 8,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#A3EBB1',
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkoutOptionsRow: {
    flexDirection: 'column',
    width: '100%',
    marginTop: 10,
  },
  checkoutBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  checkoutBtnDisabled: {
    backgroundColor: '#B3D7FF',
    opacity: 0.6,
  },
  confirmBtn: {
    backgroundColor: '#34C759',
  },
  queueBtn: {
    backgroundColor: '#FF9500',
  },
  checkoutBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  savePendingBtn: {
    backgroundColor: '#6C757D',
    borderRadius: 8,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  savePendingBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#FFF',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
  },
  checkboxCheckmark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#495057',
    fontWeight: '600',
  },
});
