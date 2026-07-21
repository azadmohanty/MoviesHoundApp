import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type CategoryPillProps = {
  title: string;
  isActive: boolean;
  onPress: () => void;
};

export const CategoryPill: React.FC<CategoryPillProps> = ({ title, isActive, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.pill, isActive && styles.pillActive]}
      onPress={onPress}
    >
      <Text style={[styles.text, isActive && styles.textActive]}>
        {title.toUpperCase()}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
  },
  pillActive: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  text: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  textActive: {
    color: '#0A0A0C',
    fontWeight: 'bold',
  },
});
