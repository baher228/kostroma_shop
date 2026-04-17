import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supportApi } from '../api/support';
import { Session, SupportCategory, SupportThread } from '../types/models';

const categories: Array<{ key: SupportCategory; label: string }> = [
  { key: 'technical_failure', label: 'Тех. сбой' },
  { key: 'suppliers_failure', label: 'Сбой поставки' },
  { key: 'client_conflict', label: 'Конфликт с клиентом' },
];

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Ошибка сервера.');
const formatDate = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const SupportPanel = ({ session }: { session: Session }) => {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<SupportCategory>('technical_failure');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const canManage = session.user.role === 'manager';

  const loadThreads = async () => {
    try {
      setLoading(true);
      setError('');
      setThreads(await supportApi.list(session.token));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadThreads(); }, [session.token]);

  const createThread = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Заполните тему и описание.');
      return;
    }
    try {
      setSending(true);
      const created = await supportApi.create(session.token, { category, subject: subject.trim(), body: body.trim() });
      setThreads((current) => [created, ...current]);
      setSubject('');
      setBody('');
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };


  const sendReply = async () => {
    if (!activeThreadId || !replyBody.trim()) {
      setError('Введите сообщение для ответа.');
      return;
    }
    try {
      setSending(true);
      const message = await supportApi.sendMessage(session.token, activeThreadId, replyBody.trim());
      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeThreadId ? { ...thread, messages: [...thread.messages, message] } : thread,
        ),
      );
      setReplyBody('');
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Поддержка</Text>
        <Pressable style={styles.refreshButton} onPress={loadThreads}>
          <Text style={styles.refreshButtonText}>Обновить</Text>
        </Pressable>
      </View>
      {!canManage && <View style={styles.createBox}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map((item) => (
            <Pressable key={item.key} style={[styles.categoryButton, category === item.key && styles.categoryButtonActive]} onPress={() => setCategory(item.key)}>
              <Text style={[styles.categoryButtonText, category === item.key && styles.categoryButtonTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput value={subject} onChangeText={setSubject} style={styles.input} placeholder="Тема обращения" placeholderTextColor="#7a8b7f" />
        <TextInput value={body} onChangeText={setBody} style={[styles.input, styles.bodyInput]} placeholder="Описание проблемы" placeholderTextColor="#7a8b7f" multiline />
        <Pressable style={[styles.sendButton, sending && styles.sendButtonDisabled]} onPress={createThread} disabled={sending}>
          <Text style={styles.sendButtonText}>{sending ? 'Отправка...' : 'Создать обращение'}</Text>
        </Pressable>
      </View>}
      {canManage && (
        <View style={styles.createBox}>
          <Text style={styles.threadMeta}>Менеджер видит все обращения и отвечает в выбранный тред.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {threads.map((thread) => (
              <Pressable key={thread.id} style={[styles.categoryButton, activeThreadId === thread.id && styles.categoryButtonActive]} onPress={() => setActiveThreadId(thread.id)}>
                <Text style={[styles.categoryButtonText, activeThreadId === thread.id && styles.categoryButtonTextActive]} numberOfLines={1}>
                  {thread.subject}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput value={replyBody} onChangeText={setReplyBody} style={[styles.input, styles.bodyInput]} placeholder="Ответ менеджера" placeholderTextColor="#7a8b7f" multiline />
          <Pressable style={[styles.sendButton, sending && styles.sendButtonDisabled]} onPress={sendReply} disabled={sending}>
            <Text style={styles.sendButtonText}>{sending ? 'Отправка...' : 'Отправить ответ'}</Text>
          </Pressable>
        </View>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading ? <View style={styles.loadingBox}><ActivityIndicator color="#2f6f4f" /></View> : (
        <ScrollView style={styles.threadList} contentContainerStyle={styles.threadListContent}>
          {threads.map((thread) => (
            <View key={thread.id} style={styles.threadCard}>
              <Text style={styles.threadMeta}>{thread.category} · {thread.status} · {formatDate(thread.createdAt)}</Text>
              <Pressable onPress={() => setActiveThreadId(thread.id)}>
                </Pressable>
              {thread.messages.map((message) => (
                <Text key={message.id} style={styles.threadMessage}>{message.authorDisplayName}: {message.body}</Text>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#b7c5b8', backgroundColor: '#f3f7f3', padding: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: '#1f2f26' },
  refreshButton: { borderRadius: 12, backgroundColor: '#dbe4dc', paddingHorizontal: 14, paddingVertical: 10 },
  refreshButtonText: { color: '#294033', fontSize: 14, fontWeight: '700' },
  createBox: { gap: 10, marginBottom: 8 },
  categoryRow: { gap: 8, paddingVertical: 2 },
  categoryButton: { borderRadius: 12, backgroundColor: '#edf3ee', borderWidth: 1, borderColor: '#c8d3ca', paddingHorizontal: 14, paddingVertical: 10 },
  categoryButtonActive: { backgroundColor: '#2f6f4f', borderColor: '#2f6f4f' },
  categoryButtonText: { color: '#334b3d', fontWeight: '700', fontSize: 13 },
  categoryButtonTextActive: { color: '#fff' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#c6d3c8', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#1f2f26' },
  bodyInput: { minHeight: 90, textAlignVertical: 'top' },
  sendButton: { borderRadius: 12, backgroundColor: '#2f6f4f', paddingVertical: 12, alignItems: 'center' },
  sendButtonDisabled: { opacity: 0.7 },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  error: { color: '#af4234', fontWeight: '700', fontSize: 13, marginBottom: 6 },
  loadingBox: { paddingVertical: 12, alignItems: 'center' },
  threadList: { flex: 1 },
  threadListContent: { gap: 8, paddingBottom: 4 },
  threadCard: { borderRadius: 11, borderWidth: 1, borderColor: '#cfdbd1', backgroundColor: '#fff', padding: 10, gap: 4 },
  threadSubject: { color: '#1d2f24', fontSize: 15, fontWeight: '700' },
  threadMeta: { color: '#4c6153', fontSize: 12, fontWeight: '600' },
  threadMessage: { color: '#3e5145', fontSize: 12, fontWeight: '500' },
});
