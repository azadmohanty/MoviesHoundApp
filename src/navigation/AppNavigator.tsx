import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import SwipeScreen from '../screens/SwipeScreen';
import DownloaderScreen from '../screens/DownloaderScreen';
import MeScreen from '../screens/MeScreen';

export type TabType = 'home' | 'swipe' | 'downloader' | 'me';

export default function AppNavigator() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [downloaderQuery, setDownloaderQuery] = useState<string>('');

  const handleNavigateToDownloader = (query: string) => {
    setDownloaderQuery(query);
    setActiveTab('downloader');
  };

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen onNavigateToDownloader={handleNavigateToDownloader} />;
      case 'swipe':
        return <SwipeScreen />;
      case 'downloader':
        return <DownloaderScreen initialSearchQuery={downloaderQuery} />;
      case 'me':
        return <MeScreen />;
      default:
        return <HomeScreen onNavigateToDownloader={handleNavigateToDownloader} />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>{renderActiveScreen()}</View>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {/* Tab 1: HOME */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'home' ? 'home' : 'home-outline'}
            size={22}
            color={activeTab === 'home' ? '#FF2D55' : 'rgba(255, 255, 255, 0.4)'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'home' && styles.tabLabelActive,
            ]}
          >
            HOME
          </Text>
          {activeTab === 'home' && <View style={styles.activeDot} />}
        </TouchableOpacity>

        {/* Tab 2: SWIPE */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('swipe')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'swipe' ? 'flame' : 'flame-outline'}
            size={22}
            color={activeTab === 'swipe' ? '#FF2D55' : 'rgba(255, 255, 255, 0.4)'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'swipe' && styles.tabLabelActive,
            ]}
          >
            SWIPE
          </Text>
          {activeTab === 'swipe' && <View style={styles.activeDot} />}
        </TouchableOpacity>

        {/* Tab 3: DOWNLOADER */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('downloader')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'downloader' ? 'download' : 'download-outline'}
            size={22}
            color={activeTab === 'downloader' ? '#FFE500' : 'rgba(255, 255, 255, 0.4)'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'downloader' && styles.tabLabelYellowActive,
            ]}
          >
            DOWNLOAD
          </Text>
          {activeTab === 'downloader' && <View style={[styles.activeDot, { backgroundColor: '#FFE500' }]} />}
        </TouchableOpacity>

        {/* Tab 4: ME */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('me')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'me' ? 'person' : 'person-outline'}
            size={22}
            color={activeTab === 'me' ? '#FF2D55' : 'rgba(255, 255, 255, 0.4)'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'me' && styles.tabLabelActive,
            ]}
          >
            ME
          </Text>
          {activeTab === 'me' && <View style={styles.activeDot} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#0E0E12',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 4,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  tabLabel: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: '#FF2D55',
    fontWeight: 'bold',
  },
  tabLabelYellowActive: {
    color: '#FFE500',
    fontWeight: 'bold',
  },
  activeDot: {
    position: 'absolute',
    top: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF2D55',
  },
});
