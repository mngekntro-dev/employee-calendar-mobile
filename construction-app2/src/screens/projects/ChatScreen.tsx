import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  Modal, Pressable, Alert, Image, Linking, ActionSheetIOS,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface Message {
  id: string;
  content: string;
  sender_id: string;
  mentions: string[];
  created_at: string;
  attachment_url: string | null;
  attachment_type: string | null;
  sender: { full_name: string } | null;
  reactions: { emoji: string; user_id: string }[];
}

interface Member { id: string; full_name: string; }

interface Props {
  route: any;
  navigation: any;
}

export default function ChatScreen({ route, navigation }: Props) {
  const { roomId, roomType, title } = route.params as {
    roomId: string; roomType: 'global' | 'project'; title: string;
  };
  const { profile } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select(`
        id, content, sender_id, mentions, created_at, attachment_url, attachment_type,
        sender:profiles!messages_sender_id_fkey(full_name),
        reactions:message_reactions(emoji, user_id)
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data as any);
  }, [roomId]);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name');
    if (data) setMembers(data);
  }, []);

  useEffect(() => {
    navigation.setOptions({ title });
    fetchMessages();
    fetchMembers();

    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages',
        filter: `room_id=eq.${roomId}`,
      }, () => fetchMessages())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'message_reactions',
      }, () => fetchMessages())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, fetchMessages, fetchMembers, navigation, title]);

  // @メンション検出
  const handleTextChange = (text: string) => {
    setInputText(text);
    const atIdx = text.lastIndexOf('@');
    if (atIdx !== -1 && atIdx === text.length - 1) {
      setMentionQuery('');
      setShowMentions(true);
    } else if (atIdx !== -1 && !text.slice(atIdx + 1).includes(' ')) {
      setMentionQuery(text.slice(atIdx + 1));
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (member: Member) => {
    const atIdx = inputText.lastIndexOf('@');
    const newText = atIdx !== -1 && !inputText.slice(atIdx + 1).includes(' ')
      ? inputText.slice(0, atIdx) + `@${member.full_name} `
      : inputText + `@${member.full_name} `;
    setInputText(newText);
    setShowMentions(false);
  };

  const filteredMembers = members.filter(m =>
    m.id !== profile?.id &&
    m.full_name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const insertMentionAll = () => {
    const allNames = members
      .filter(m => m.id !== profile?.id)
      .map(m => `@${m.full_name}`)
      .join(' ');
    setInputText(prev => (prev ? prev + ' ' + allNames + ' ' : allNames + ' '));
    setShowMentions(false);
  };

  // ─── アップロード共通処理 ───────────────────────────
  const uploadAndSend = async (
    uri: string,
    type: 'image' | 'file',
    filename: string,
    mimeType: string,
  ) => {
    setSending(true);
    try {
      const ext = filename.split('.').pop() ?? (type === 'image' ? 'jpg' : 'bin');
      const path = `${roomId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      // React Native では FormData 経由でアップロード
      const formData = new FormData();
      formData.append('file', { uri, name: filename, type: mimeType } as any);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;

      const uploadResp = await fetch(
        `${supabaseUrl}/storage/v1/object/chat-attachments/${path}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-upsert': 'false',
          },
          body: formData,
        }
      );
      if (!uploadResp.ok) {
        const errText = await uploadResp.text();
        throw new Error(errText);
      }

      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(path);

      const mentionIds: string[] = [];
      members.forEach(m => {
        if (inputText.includes(`@${m.full_name}`)) mentionIds.push(m.id);
      });

      await supabase.from('messages').insert({
        room_id: roomId,
        sender_id: profile?.id,
        content: inputText.trim(),
        mentions: mentionIds,
        attachment_url: urlData.publicUrl,
        attachment_type: type,
      });
      setInputText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert('エラー', 'ファイルの送信に失敗しました');
    } finally {
      setSending(false);
    }
  };

  // ─── カメラ撮影 ───────────────────────────────────
  const pickFromCamera = async () => {
    setShowAttachMenu(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('カメラへのアクセスを許可してください'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      await uploadAndSend(a.uri, 'image', a.fileName ?? 'photo.jpg', a.mimeType ?? 'image/jpeg');
    }
  };

  // ─── ギャラリー選択 ──────────────────────────────
  const pickFromGallery = async () => {
    setShowAttachMenu(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('写真へのアクセスを許可してください'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      await uploadAndSend(a.uri, 'image', a.fileName ?? 'photo.jpg', a.mimeType ?? 'image/jpeg');
    }
  };

  // ─── ファイル選択 ────────────────────────────────
  const pickDocument = async () => {
    setShowAttachMenu(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      await uploadAndSend(a.uri, 'file', a.name, a.mimeType ?? 'application/octet-stream');
    }
  };

  // 添付メニュー表示（iOSはActionSheet、Androidはモーダル）
  const openAttachMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['キャンセル', 'カメラ撮影', 'ギャラリーから選択', 'ファイルを選択'], cancelButtonIndex: 0 },
        idx => {
          if (idx === 1) pickFromCamera();
          else if (idx === 2) pickFromGallery();
          else if (idx === 3) pickDocument();
        }
      );
    } else {
      setShowAttachMenu(true);
    }
  };

  // メッセージ送信（テキストのみ）
  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    try {
      const mentionIds: string[] = [];
      members.forEach(m => {
        if (inputText.includes(`@${m.full_name}`)) mentionIds.push(m.id);
      });
      await supabase.from('messages').insert({
        room_id: roomId,
        sender_id: profile?.id,
        content: inputText.trim(),
        mentions: mentionIds,
        attachment_url: null,
        attachment_type: null,
      });
      setInputText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('エラー', '送信に失敗しました');
    } finally {
      setSending(false);
    }
  };

  // リアクション
  const toggleReaction = async (msgId: string, emoji: string) => {
    setSelectedMsg(null);
    const existing = messages
      .find(m => m.id === msgId)?.reactions
      .find(r => r.emoji === emoji && r.user_id === profile?.id);
    if (existing) {
      await supabase.from('message_reactions')
        .delete()
        .eq('message_id', msgId).eq('user_id', profile?.id).eq('emoji', emoji);
    } else {
      await supabase.from('message_reactions')
        .insert({ message_id: msgId, user_id: profile?.id, emoji });
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === profile?.id;
    const time = new Date(item.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const reactionMap: Record<string, { count: number; mine: boolean }> = {};
    item.reactions.forEach(r => {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { count: 0, mine: false };
      reactionMap[r.emoji].count++;
      if (r.user_id === profile?.id) reactionMap[r.emoji].mine = true;
    });

    const parts = item.content ? item.content.split(/(@\S+)/g) : [];

    const bubble = (
      <View>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          {!isMe && (
            <Text style={styles.senderName}>
              {(item.sender as any)?.full_name ?? '不明'}
            </Text>
          )}
          {/* 画像添付 */}
          {item.attachment_type === 'image' && item.attachment_url && (
            <TouchableOpacity onPress={() => setPreviewImage(item.attachment_url!)}>
              <Image
                source={{ uri: item.attachment_url }}
                style={styles.attachImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}
          {/* ファイル添付 */}
          {item.attachment_type === 'file' && item.attachment_url && (
            <TouchableOpacity
              style={styles.fileChip}
              onPress={() => Linking.openURL(item.attachment_url!)}
            >
              <Text style={styles.fileChipIcon}>📄</Text>
              <Text style={[styles.fileChipName, isMe && { color: '#fff' }]} numberOfLines={1}>
                {item.attachment_url.split('/').pop()}
              </Text>
            </TouchableOpacity>
          )}
          {/* テキスト */}
          {item.content ? (
            <Text style={[styles.msgText, isMe && styles.msgTextMe]}>
              {parts.map((p, i) =>
                p.startsWith('@')
                  ? <Text key={i} style={styles.mention}>{p}</Text>
                  : p
              )}
            </Text>
          ) : null}
          <Text style={[styles.timeText, isMe && styles.timeTextMe]}>{time}</Text>
        </View>
        {Object.keys(reactionMap).length > 0 && (
          <View style={[styles.reactionsRow, isMe && styles.reactionsRowMe]}>
            {Object.entries(reactionMap).map(([emoji, { count, mine }]) => (
              <TouchableOpacity
                key={emoji}
                style={[styles.reactionChip, mine && styles.reactionChipMine]}
                onPress={() => toggleReaction(item.id, emoji)}
              >
                <Text style={styles.reactionText}>{emoji} {count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
        {Platform.OS === 'web' ? (
          <Pressable
            onHoverIn={() => setHoveredMsgId(item.id)}
            onHoverOut={() => setHoveredMsgId(null)}
            style={{ flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 4 }}
          >
            {bubble}
            {hoveredMsgId === item.id && (
              <TouchableOpacity style={styles.emojiTrigger} onPress={() => setSelectedMsg(item)}>
                <Text style={{ fontSize: 18 }}>😊</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        ) : (
          <TouchableOpacity onLongPress={() => setSelectedMsg(item)} delayLongPress={400}>
            {bubble}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>まだメッセージがありません</Text>
            <Text style={styles.emptySubText}>最初のメッセージを送ってみましょう 💬</Text>
          </View>
        }
      />

      {/* 入力エリア */}
      <View style={styles.inputArea}>
        {/* @メンション候補 */}
        {showMentions && (
          <View style={styles.mentionList}>
            <TouchableOpacity style={[styles.mentionItem, styles.mentionAllItem]} onPress={insertMentionAll}>
              <View style={[styles.mentionAvatar, { backgroundColor: '#059669' }]}>
                <Text style={styles.mentionAvatarText}>全</Text>
              </View>
              <Text style={[styles.mentionName, { color: '#059669' }]}>@All（全員）</Text>
            </TouchableOpacity>
            {filteredMembers.map(m => (
              <TouchableOpacity key={m.id} style={styles.mentionItem} onPress={() => insertMention(m)}>
                <View style={styles.mentionAvatar}>
                  <Text style={styles.mentionAvatarText}>{m.full_name[0]}</Text>
                </View>
                <Text style={styles.mentionName}>{m.full_name}</Text>
              </TouchableOpacity>
            ))}
            {filteredMembers.length === 0 && (
              <View style={{ padding: 12 }}>
                <Text style={{ color: '#9ca3af', fontSize: 13 }}>メンバーが見つかりません</Text>
              </View>
            )}
          </View>
        )}

        {/* 入力欄 */}
        <View style={styles.inputRow}>
          {/* 📎添付ボタン */}
          <TouchableOpacity style={styles.iconBtn} onPress={openAttachMenu}>
            <Text style={styles.iconBtnText}>📎</Text>
          </TouchableOpacity>
          {/* @ボタン */}
          <TouchableOpacity
            style={styles.atBtn}
            onPress={() => { setShowMentions(prev => !prev); setMentionQuery(''); }}
          >
            <Text style={styles.atBtnText}>@</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={handleTextChange}
            placeholder="メッセージを入力..."
            multiline
            maxLength={1000}
            onSubmitEditing={Platform.OS === 'web' ? sendMessage : undefined}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendBtnText}>送信</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Android用添付メニュー */}
      <Modal visible={showAttachMenu} transparent animationType="slide">
        <Pressable style={styles.attachOverlay} onPress={() => setShowAttachMenu(false)}>
          <View style={styles.attachSheet}>
            <Text style={styles.attachTitle}>添付ファイルを選択</Text>
            <TouchableOpacity style={styles.attachItem} onPress={pickFromCamera}>
              <Text style={styles.attachItemIcon}>📷</Text>
              <Text style={styles.attachItemText}>カメラ撮影</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachItem} onPress={pickFromGallery}>
              <Text style={styles.attachItemIcon}>🖼️</Text>
              <Text style={styles.attachItemText}>ギャラリーから選択</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachItem} onPress={pickDocument}>
              <Text style={styles.attachItemIcon}>📄</Text>
              <Text style={styles.attachItemText}>ファイルを選択（PDF等）</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachCancel} onPress={() => setShowAttachMenu(false)}>
              <Text style={styles.attachCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* 画像プレビューModal */}
      <Modal visible={!!previewImage} transparent animationType="fade">
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewImage(null)}>
          <Image source={{ uri: previewImage! }} style={styles.previewImage} resizeMode="contain" />
          <Text style={styles.previewClose}>✕ 閉じる</Text>
        </Pressable>
      </Modal>

      {/* リアクションピッカー */}
      <Modal visible={!!selectedMsg} transparent animationType="fade">
        <Pressable style={styles.pickerOverlay} onPress={() => setSelectedMsg(null)}>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>リアクション</Text>
            <View style={styles.pickerRow}>
              {EMOJIS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={styles.pickerEmoji}
                  onPress={() => selectedMsg && toggleReaction(selectedMsg.id, e)}
                >
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#f0f2f5',
    ...(Platform.OS === 'web' ? {
      maxWidth: 800, marginHorizontal: 'auto' as any, width: '100%',
      boxShadow: '0 0 20px rgba(0,0,0,0.08)' as any,
    } : {}),
  },
  list: { padding: 12, paddingBottom: 8, flexGrow: 1 },
  msgRow: { marginBottom: 8, width: '100%' },
  msgRowMe: { alignItems: 'flex-end' },
  msgRowThem: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: 300, borderRadius: 16, paddingHorizontal: 14,
    paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 4, elevation: 2, flexShrink: 1,
  },
  bubbleMe: { backgroundColor: '#059669', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#ffffff', borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 2 },
  msgText: { fontSize: 15, color: '#374151', lineHeight: 20 },
  msgTextMe: { color: '#ffffff' },
  mention: { color: '#60a5fa', fontWeight: '700' },
  timeText: { fontSize: 10, color: '#9ca3af', marginTop: 3, textAlign: 'right' },
  timeTextMe: { color: 'rgba(255,255,255,0.7)' },
  attachImage: {
    width: 200, height: 150, borderRadius: 10, marginBottom: 4,
  },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4,
  },
  fileChipIcon: { fontSize: 18 },
  fileChipName: { fontSize: 13, color: '#374151', flex: 1 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3, marginLeft: 4 },
  reactionsRowMe: { justifyContent: 'flex-end', marginLeft: 0, marginRight: 4 },
  reactionChip: {
    backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 12,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  reactionChipMine: { backgroundColor: '#dbeafe', borderWidth: 1, borderColor: '#93c5fd' },
  reactionText: { fontSize: 12 },
  emojiTrigger: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  inputArea: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  mentionList: {
    backgroundColor: '#fff', maxHeight: 200,
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, margin: 8,
    overflow: 'hidden',
  },
  mentionItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 10,
  },
  mentionAllItem: { borderBottomWidth: 2, borderBottomColor: '#d1fae5', backgroundColor: '#f0fdf4' },
  mentionAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#1a56db', alignItems: 'center', justifyContent: 'center',
  },
  mentionAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  mentionName: { fontSize: 14, color: '#374151', fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 6,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { fontSize: 18 },
  atBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center',
  },
  atBtnText: { fontSize: 16, fontWeight: '700', color: '#0369a1' },
  input: {
    flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, minHeight: 42,
  },
  sendBtn: {
    backgroundColor: '#059669', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  sendBtnDisabled: { backgroundColor: '#9ca3af' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#6b7280' },
  emptySubText: { fontSize: 13, color: '#9ca3af', marginTop: 6 },
  // 添付メニュー（Android）
  attachOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  attachSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  attachTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 16, textAlign: 'center' },
  attachItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  attachItemIcon: { fontSize: 24 },
  attachItemText: { fontSize: 16, color: '#374151' },
  attachCancel: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#f3f4f6', borderRadius: 12,
  },
  attachCancelText: { fontSize: 16, color: '#6b7280', fontWeight: '600' },
  // 画像プレビュー
  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center', alignItems: 'center',
  },
  previewImage: { width: '95%', height: '80%' },
  previewClose: {
    color: '#fff', fontSize: 16, marginTop: 16, fontWeight: '600',
  },
  // リアクションピッカー
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  pickerBox: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', width: 320,
  },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 14 },
  pickerRow: { flexDirection: 'row', gap: 10 },
  pickerEmoji: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
  },
});
