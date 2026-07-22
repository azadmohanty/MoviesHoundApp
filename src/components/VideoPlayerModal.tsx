import React, { useEffect } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity, Text, SafeAreaView, StatusBar } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type VideoPlayerModalProps = {
  visible: boolean;
  videoUrl: string | null;
  title: string;
  onClose: () => void;
};

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  visible,
  videoUrl,
  title,
  onClose,
}) => {
  const player = useVideoPlayer(videoUrl || '', (playerInstance) => {
    playerInstance.loop = false;
    if (videoUrl) {
      playerInstance.play();
    }
  });

  useEffect(() => {
    if (videoUrl && player) {
      player.replace(videoUrl);
      player.play();
    }
  }, [videoUrl, player]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {title.toUpperCase()}
          </Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.videoContainer}>
          {videoUrl ? (
            <VideoView
              style={styles.video}
              player={player}
              allowsFullscreen
              allowsPictureInPicture
              startsPictureInPictureAutomatically
              showsTimecodes
            />
          ) : (
            <Text style={styles.errorText}>NO STREAM URL AVAILABLE</Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#0A0A0C',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#FF2D55',
    fontSize: 22,
    fontFamily: 'Ndot57',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontFamily: 'Ndot57',
    fontSize: 13,
    letterSpacing: 1,
  },
  placeholder: {
    width: 40,
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  errorText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'LetteraMono',
    fontSize: 12,
    letterSpacing: 1,
  },
});
