import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import { supabase } from './supabase';

// 通知受信時�E動作設定（フォアグラウンドでもバナ�E表示�E�E
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Push Token を取得して profiles に保孁E
export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;

    // Expo Go の SDK53 では Android プッシュ通知非対応�EためスキチE�E
    const isExpoGo = typeof (global as any).expo !== 'undefined' &&
      (global as any).expo?.modules?.ExpoConstants?.executionEnvironment === 'storeClient';
    if (Platform.OS === 'android' && isExpoGo) return;

    // Android 用通知チャンネル
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'チャチE��通知',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#059669',
      });
    }

    // 通知許可を取征E
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    // Expo Push Token を取征E
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '54f028d1-eadd-4ed5-99ab-2acf7576b4c4',
    });
    const token = tokenData.data;

    // Supabase の profiles に保孁E
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userId);

    if (error) {
      Alert.alert('Token 保存エラー', error.message);
    }
  } catch (e: any) {
    Alert.alert('Push Token エラー', e.message ?? String(e));
  }
}

