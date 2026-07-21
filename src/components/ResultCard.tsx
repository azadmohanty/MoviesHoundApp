import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SearchResult } from '../utils/parser';

type ResultCardProps = {
  item: SearchResult;
  onPress: () => void;
};

export const ResultCard: React.FC<ResultCardProps> = ({ item, onPress }) => {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardBadge}>{item.siteName.toUpperCase()}</Text>
        <Text style={styles.arrowIcon}>↗</Text>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardBadge: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  arrowIcon: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  cardTitle: {
    fontFamily: 'LetteraMono',
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 18,
  },
});
