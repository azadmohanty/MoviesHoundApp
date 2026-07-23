import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView
} from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import { MovieTinderScreen } from '../screens/MovieTinderScreen';
import { ScraperScreen } from '../screens/ScraperScreen';
import { MeScreen } from '../screens/MeScreen';

export type TabName = 'HOME' | 'TINDER' | 'SCRAPER' | 'ME';

export const BottomNavigation: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabName>('HOME');

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'HOME':
        return <HomeScreen />;
      case 'TINDER':
        return <MovieTinderScreen />;
      case 'SCRAPER':
        return <ScraperScreen />;
      case 'ME':
        return <MeScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Active Tab View */}
      <View style={styles.screenContainer}>
        {renderActiveScreen()}
      </View>

      {/* Sleek 4-Tab Bottom Bar (Option C) */}
      <SafeAreaView style={styles.tabBarSafeArea}>
        <View style={styles.tabBar}>
          {([
            { id: 'HOME', icon: '🏠', label: 'HOME' },
            { id: 'TINDER', icon: '🃏', label: 'TINDER' },
            { id: 'SCRAPER', icon: '⚡', label: 'SCRAPER' },
            { id: 'ME', icon: '👤', label: 'ME' },
          ] as const).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.tabItem}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                  {tab.icon}
                </Text>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                {isActive ? <View style={styles.activeDot} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  screenContainer: {
    flex: 1,
  },
  tabBarSafeArea: {
    backgroundColor: '#0E0E12',
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#0E0E12',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1,
  },
  tabLabelActive: {
    color: '#FF2D55',
    fontWeight: 'bold',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF2D55',
    marginTop: 3,
  },
});
