export function triggerLightHaptic(): void {
  try {
    const Haptics = require('expo-haptics');
    if (Haptics && Haptics.impactAsync) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (e) {
    // Graceful fallback for emulators or unlinked modules
  }
}

export function triggerMediumHaptic(): void {
  try {
    const Haptics = require('expo-haptics');
    if (Haptics && Haptics.impactAsync) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  } catch (e) {
    // Graceful fallback
  }
}

export function triggerSuccessHaptic(): void {
  try {
    const Haptics = require('expo-haptics');
    if (Haptics && Haptics.notificationAsync) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch (e) {
    // Graceful fallback
  }
}

export function triggerSelectionHaptic(): void {
  try {
    const Haptics = require('expo-haptics');
    if (Haptics && Haptics.selectionAsync) {
      Haptics.selectionAsync();
    }
  } catch (e) {
    // Graceful fallback
  }
}
