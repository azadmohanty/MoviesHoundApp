import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SearchResult } from '../utils/parser';

type ResultCardProps = {
  item: SearchResult;
  onPress: () => void;
};

const extractQualityTags = (title: string): string[] => {
  const tags: string[] = [];
  const lowercaseTitle = title.toLowerCase();
  
  if (lowercaseTitle.includes('2160p') || lowercaseTitle.includes('4k') || lowercaseTitle.includes('uhd')) {
    tags.push('4K UHD');
  } else if (lowercaseTitle.includes('1080p') || lowercaseTitle.includes('fhd')) {
    tags.push('1080p');
  } else if (lowercaseTitle.includes('720p') || lowercaseTitle.includes('hd')) {
    tags.push('720p');
  } else if (lowercaseTitle.includes('480p')) {
    tags.push('480p');
  }
  
  if (lowercaseTitle.includes('dual') || lowercaseTitle.includes('multi') || (lowercaseTitle.includes('hindi') && (lowercaseTitle.includes('english') || lowercaseTitle.includes('eng')))) {
    tags.push('Dual Audio');
  }
  
  if (lowercaseTitle.includes('hevc') || lowercaseTitle.includes('x265') || lowercaseTitle.includes('h265')) {
    tags.push('x265/HEVC');
  }
  
  if (lowercaseTitle.includes('gdrive') || lowercaseTitle.includes('g-drive') || lowercaseTitle.includes('google drive') || lowercaseTitle.includes('direct')) {
    tags.push('G-Drive');
  }

  if (lowercaseTitle.includes('hdr')) {
    tags.push('HDR');
  }
  
  return tags;
};

export const ResultCard: React.FC<ResultCardProps> = ({ item, onPress }) => {
  const tags = extractQualityTags(item.title);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardBadge}>{item.siteName.toUpperCase()}</Text>
        <Text style={styles.arrowIcon}>↗</Text>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {tags.length > 0 && (
        <View style={styles.tagContainer}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
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
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tagPill: {
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  tagText: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.5,
  },
});
