import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';

export const useAppUpdate = () => {
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const checkForAppUpdate = async () => {
    if (Platform.OS === 'web' || !Updates.isEnabled) {
      Alert.alert('Обновления приложения', 'OTA-обновления доступны только в установленном приложении.');
      return;
    }

    try {
      setCheckingUpdate(true);
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        Alert.alert('Обновления приложения', 'Установлена последняя версия.');
        return;
      }

      await Updates.fetchUpdateAsync();
      Alert.alert('Обновление готово', 'Перезапустить приложение, чтобы применить обновление?', [
        { text: 'Позже', style: 'cancel' },
        { text: 'Перезапустить', onPress: () => void Updates.reloadAsync() },
      ]);
    } catch (updateError) {
      Alert.alert('Не удалось проверить обновление', updateError instanceof Error ? updateError.message : 'Server error.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return { checkingUpdate, checkForAppUpdate };
};
