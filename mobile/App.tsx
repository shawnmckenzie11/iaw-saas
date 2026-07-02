import React, { useState } from 'react';
import { StyleSheet, SafeAreaView, StatusBar, View, Text, TouchableOpacity } from 'react-native';
import DashboardScreen from './src/screens/DashboardScreen';
import PickupScreen from './src/screens/PickupScreen';
import LoginScreen from './src/screens/LoginScreen';
import AccountingScreen from './src/screens/AccountingScreen';
import { DeliveryRecord } from './src/database/db';

type ScreenName = 'DASHBOARD' | 'PICKUP' | 'DROPOFF' | 'ACCOUNTING';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<'DRIVER' | 'DISPATCH'>('DRIVER');
  const [activeDriverId, setActiveDriverId] = useState('drv-01'); // drv-01 for driver1, drv-02 for driver2

  const [currentScreen, setCurrentScreen] = useState<ScreenName>('DASHBOARD');
  const [selectedRecord, setSelectedRecord] = useState<DeliveryRecord | null>(null);

  const handleLoginSuccess = (role: 'DRIVER' | 'DISPATCH', driverId: string | null) => {
    setUserRole(role);
    if (driverId) {
      setActiveDriverId(driverId);
    } else {
      // Default to driver1 context if dispatcher looks at driver views
      setActiveDriverId('drv-01');
    }
    setIsLoggedIn(true);
    setCurrentScreen('DASHBOARD');
  };

  const handleSignOut = () => {
    setIsLoggedIn(false);
    setSelectedRecord(null);
    setCurrentScreen('DASHBOARD');
  };

  const handleNavigateToPickup = () => {
    setCurrentScreen('PICKUP');
  };

  const handleNavigateToDropoff = (record: DeliveryRecord) => {
    setSelectedRecord(record);
    setCurrentScreen('DROPOFF');
  };

  const handleNavigateToAccounting = () => {
    setCurrentScreen('ACCOUNTING');
  };

  const handleNavigateBack = () => {
    setSelectedRecord(null);
    setCurrentScreen('DASHBOARD');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      
      <View style={styles.body}>
        {!isLoggedIn ? (
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        ) : (
          <>
            {currentScreen === 'DASHBOARD' && (
              <DashboardScreen
                activeDriverId={activeDriverId}
                setActiveDriverId={setActiveDriverId}
                onNavigateToPickup={handleNavigateToPickup}
                onNavigateToDropoff={handleNavigateToDropoff}
                onNavigateToAccounting={handleNavigateToAccounting}
                isDispatchRole={userRole === 'DISPATCH'}
                onSignOut={handleSignOut}
              />
            )}
            
            {currentScreen === 'PICKUP' && (
              <PickupScreen
                activeDriverId={activeDriverId}
                onNavigateBack={handleNavigateBack}
              />
            )}

            {currentScreen === 'DROPOFF' && selectedRecord && (
              <PickupScreen
                record={selectedRecord}
                activeDriverId={activeDriverId}
                onNavigateBack={handleNavigateBack}
              />
            )}

            {currentScreen === 'ACCOUNTING' && (
              <AccountingScreen
                onNavigateBack={handleNavigateBack}
              />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  body: {
    flex: 1,
  },
});
