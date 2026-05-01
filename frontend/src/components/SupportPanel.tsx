import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  type KeyboardEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supportApi } from "../api/support";
import { Session, SupportCategory, SupportMessage, SupportThread } from "../types/models";

const categories: Array<{ key: SupportCategory; label: string }> = [
  { key: "technical_failure", label: "Ð¢ÐµÑ…. ÑÐ±Ð¾Ð¹" },
  { key: "suppliers_failure", label: "Ð¡Ð±Ð¾Ð¹ Ð¿Ð¾ÑÑ‚Ð°Ð²ÐºÐ¸" },
  { key: "client_conflict", label: "ÐšÐ¾Ð½Ñ„Ð»Ð¸ÐºÑ‚ Ñ ÐºÐ»Ð¸ÐµÐ½Ñ‚Ð¾Ð¼" },
];

const categoryLabel = (category: SupportCategory) =>
  categories.find((item) => item.key === category)?.label ?? category;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "ÐžÑˆÐ¸Ð±ÐºÐ° ÑÐµÑ€Ð²ÐµÑ€Ð°.";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const sortThreads = (threads: SupportThread[]) =>
  [...threads].sort(
    (a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt),
  );

const lastMessage = (thread: SupportThread): SupportMessage | null =>
  thread.messages.length ? thread.messages[thread.messages.length - 1] : null;

export const SupportPanel = ({ session }: { session: Session }) => {
  const messagesScrollRef = useRef<ScrollView>(null);
  const baseWindowHeightRef = useRef(Dimensions.get("window").height);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<SupportCategory>("technical_failure");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyPhotoUrl, setReplyPhotoUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [chatMode, setChatMode] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [windowHeight, setWindowHeight] = useState(baseWindowHeightRef.current);
  const canManage = session.user.role === "manager";

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const loadThreads = async () => {
    try {
      setLoading(true);
      setError("");
      const fetched = sortThreads(await supportApi.list(session.token));
      setThreads(fetched);
      if (activeThreadId && !fetched.some((thread) => thread.id === activeThreadId)) {
        setActiveThreadId("");
        setChatMode(false);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThreads();
  }, [session.token]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const onShow = (event: KeyboardEvent) => {
      setKeyboardInset(event.endCoordinates.height);
      messagesScrollRef.current?.scrollToEnd({ animated: true });
    };
    const onHide = () => {
      setKeyboardInset(0);
    };

    const showSub = Keyboard.addListener("keyboardDidShow", onShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const dimensionsSub = Dimensions.addEventListener("change", ({ window }) => {
      setWindowHeight(window.height);
    });

    return () => {
      dimensionsSub.remove();
    };
  }, []);

  const androidKeyboardLift = useMemo(() => {
    if (Platform.OS !== "android" || keyboardInset <= 0) {
      return 0;
    }

    // In resize mode Android already shrinks window; we only apply the uncovered remainder.
    const resizedBy = Math.max(0, baseWindowHeightRef.current - windowHeight);
    return Math.max(0, keyboardInset - resizedBy);
  }, [keyboardInset, windowHeight]);

  const openThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setChatMode(true);
    setReplyBody("");
      setReplyPhotoUrl("");
    setError("");
  };

  const createThread = async () => {
    if (!subject.trim() || (!body.trim() && !photoUrl.trim())) {
      setError("Ð—Ð°Ð¿Ð¾Ð»Ð½Ð¸Ñ‚Ðµ Ñ‚ÐµÐ¼Ñƒ Ð¸ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ.");
      return;
    }
    try {
      setSending(true);
      const created = await supportApi.create(session.token, {
        category,
        subject: subject.trim(),
        body: body.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
      });
      setThreads((current) =>
        sortThreads([created, ...current.filter((thread) => thread.id !== created.id)]),
      );
      setSubject("");
      setBody("");
      setPhotoUrl("");
      setError("");
      openThread(created.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!activeThreadId || (!replyBody.trim() && !replyPhotoUrl.trim())) {
      setError("Ð’Ð²ÐµÐ´Ð¸Ñ‚Ðµ ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ðµ Ð´Ð»Ñ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²ÐºÐ¸.");
      return;
    }
    try {
      setSending(true);
      const message = await supportApi.sendMessage(session.token, activeThreadId, {
        body: replyBody.trim() || undefined,
        photoUrl: replyPhotoUrl.trim() || undefined,
      });
      setThreads((current) =>
        sortThreads(
          current.map((thread) =>
            thread.id === activeThreadId
              ? {
                  ...thread,
                  updatedAt: message.createdAt,
                  messages: [...thread.messages, message],
                }
              : thread,
          ),
        ),
      );
      setReplyBody("");
      setReplyPhotoUrl("");
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const renderThreadList = () => (
    <View style={styles.listWrap}>
      <Text style={styles.sectionTitle}>{canManage ? "Ð’ÑÐµ Ð¾Ð±Ñ€Ð°Ñ‰ÐµÐ½Ð¸Ñ" : "ÐœÐ¾Ð¸ Ð¾Ð±Ñ€Ð°Ñ‰ÐµÐ½Ð¸Ñ"}</Text>
      <ScrollView style={styles.threadList} contentContainerStyle={styles.threadListContent}>
        {!threads.length && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>ÐŸÐ¾ÐºÐ° Ð½ÐµÑ‚ Ð¾Ð±Ñ€Ð°Ñ‰ÐµÐ½Ð¸Ð¹.</Text>
          </View>
        )}
        {threads.map((thread) => {
          const latest = lastMessage(thread);
          const active = thread.id === activeThreadId;
          return (
            <Pressable
              key={thread.id}
              style={[styles.threadCard, active && styles.threadCardActive]}
              onPress={() => openThread(thread.id)}
            >
              <View style={styles.threadTopRow}>
                <Text style={styles.threadSubject} numberOfLines={1}>
                  {thread.subject}
                </Text>
                <Text style={styles.threadDate}>{formatDate(thread.updatedAt)}</Text>
              </View>
              <Text style={styles.threadMeta}>
                {categoryLabel(thread.category)} Â· {thread.status} Â· {thread.createdByDisplayName}
              </Text>
              <Text style={styles.threadPreview} numberOfLines={2}>
                {latest ? `${latest.authorDisplayName}: ${latest.body}` : "Ð‘ÐµÐ· ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ð¹"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderChat = () => {
    if (!activeThread) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Ð’Ñ‹Ð±ÐµÑ€Ð¸Ñ‚Ðµ Ð¾Ð±Ñ€Ð°Ñ‰ÐµÐ½Ð¸Ðµ Ð¸Ð· ÑÐ¿Ð¸ÑÐºÐ°.</Text>
        </View>
      );
    }

    return (
      <View style={styles.chatWrap}>
        <View style={styles.chatHeader}>
          <Pressable style={styles.backButton} onPress={() => setChatMode(false)}>
            <Text style={styles.backButtonText}>Ðš ÑÐ¿Ð¸ÑÐºÑƒ</Text>
          </Pressable>
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatSubject} numberOfLines={1}>
              {activeThread.subject}
            </Text>
            <Text style={styles.chatMeta}>
              {categoryLabel(activeThread.category)} Â· {activeThread.createdByDisplayName}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={messagesScrollRef}
          style={styles.messagesWrap}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {activeThread.messages.map((message) => {
            const mine = message.authorId === session.user.id;
            return (
              <View
                key={message.id}
                style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}
              >
                <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                  {!mine && <Text style={styles.messageAuthor}>{message.authorDisplayName}</Text>}
                  {!!message.body && <Text style={styles.messageBody}>{message.body}</Text>}
                  {!!message.photoUrl && (
                    <View style={styles.messagePhotoWrap}>
                      <Image source={{ uri: message.photoUrl }} style={styles.messagePhoto} />
                      <Text style={styles.messagePhotoCaption}>Фото вложено</Text>
                    </View>
                  )}
                  <Text style={styles.messageDate}>{formatDate(message.createdAt)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View
          style={[
            styles.replyBox,
            Platform.OS === "android" && androidKeyboardLift > 0 && { marginBottom: androidKeyboardLift },
          ]}
        >
          <TextInput
            value={replyBody}
            onChangeText={setReplyBody}
            style={[styles.input, styles.replyInput]}
            placeholder="Ð’Ð²ÐµÐ´Ð¸Ñ‚Ðµ ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ðµ"
            placeholderTextColor="#7a8b7f"
            multiline
            onFocus={() => messagesScrollRef.current?.scrollToEnd({ animated: true })}
          />
          <TextInput
            value={replyPhotoUrl}
            onChangeText={setReplyPhotoUrl}
            style={styles.input}
            placeholder="Ð¡ÑÑ‹Ð»ÐºÐ° Ð½Ð° Ñ„Ð¾Ñ‚Ð¾ (Ð¾Ð¿Ñ†Ð¸Ð¾Ð½Ð°Ð»ÑŒÐ½Ð¾)"
            placeholderTextColor="#7a8b7f"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={sendReply}
            disabled={sending}
          >
            <Text style={styles.sendButtonText}>{sending ? "ÐžÑ‚Ð¿Ñ€Ð°Ð²ÐºÐ°..." : "ÐžÑ‚Ð¿Ñ€Ð°Ð²Ð¸Ñ‚ÑŒ"}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardWrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
      <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>ÐŸÐ¾Ð´Ð´ÐµÑ€Ð¶ÐºÐ°</Text>
        <Pressable style={styles.refreshButton} onPress={loadThreads}>
          <Text style={styles.refreshButtonText}>ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚ÑŒ</Text>
        </Pressable>
      </View>

      {!canManage && !chatMode && (
        <View style={styles.createBox}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {categories.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.categoryButton, category === item.key && styles.categoryButtonActive]}
                onPress={() => setCategory(item.key)}
              >
                <Text
                  style={[
                    styles.categoryButtonText,
                    category === item.key && styles.categoryButtonTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
            placeholder="Ð¢ÐµÐ¼Ð° Ð¾Ð±Ñ€Ð°Ñ‰ÐµÐ½Ð¸Ñ"
            placeholderTextColor="#7a8b7f"
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            style={[styles.input, styles.bodyInput]}
            placeholder="ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð¿Ñ€Ð¾Ð±Ð»ÐµÐ¼Ñ‹"
            placeholderTextColor="#7a8b7f"
            multiline
          />
          <TextInput
            value={photoUrl}
            onChangeText={setPhotoUrl}
            style={styles.input}
            placeholder="Ð¡ÑÑ‹Ð»ÐºÐ° Ð½Ð° Ñ„Ð¾Ñ‚Ð¾ (Ð¼Ð¾Ð¶Ð½Ð¾ Ð±ÐµÐ· Ñ‚ÐµÐºÑÑ‚Ð°)"
            placeholderTextColor="#7a8b7f"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={createThread}
            disabled={sending}
          >
            <Text style={styles.sendButtonText}>{sending ? "ÐžÑ‚Ð¿Ñ€Ð°Ð²ÐºÐ°..." : "Ð¡Ð¾Ð·Ð´Ð°Ñ‚ÑŒ Ð¾Ð±Ñ€Ð°Ñ‰ÐµÐ½Ð¸Ðµ"}</Text>
          </Pressable>
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#2f6f4f" />
        </View>
      ) : chatMode ? (
        renderChat()
      ) : (
        renderThreadList()
      )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardWrap: {
    flex: 1,
  },
  panel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#b7c5b8",
    backgroundColor: "#f3f7f3",
    padding: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1f2f26",
  },
  refreshButton: {
    borderRadius: 12,
    backgroundColor: "#dbe4dc",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: "#294033",
    fontSize: 14,
    fontWeight: "700",
  },
  createBox: {
    gap: 10,
    marginBottom: 10,
  },
  categoryRow: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryButton: {
    borderRadius: 12,
    backgroundColor: "#edf3ee",
    borderWidth: 1,
    borderColor: "#c8d3ca",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  categoryButtonActive: {
    backgroundColor: "#2f6f4f",
    borderColor: "#2f6f4f",
  },
  categoryButtonText: {
    color: "#334b3d",
    fontWeight: "700",
    fontSize: 13,
  },
  categoryButtonTextActive: {
    color: "#fff",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c6d3c8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1f2f26",
  },
  bodyInput: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  replyInput: {
    minHeight: 58,
    maxHeight: 110,
    textAlignVertical: "top",
  },
  sendButton: {
    borderRadius: 12,
    backgroundColor: "#2f6f4f",
    paddingVertical: 12,
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  error: {
    color: "#af4234",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 8,
  },
  loadingBox: {
    paddingVertical: 12,
    alignItems: "center",
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
  },
  sectionTitle: {
    color: "#2a4033",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 8,
  },
  threadList: {
    flex: 1,
  },
  threadListContent: {
    gap: 9,
    paddingBottom: 4,
  },
  threadCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cfdbd1",
    backgroundColor: "#fff",
    padding: 11,
    gap: 4,
  },
  threadCardActive: {
    borderColor: "#2f6f4f",
    backgroundColor: "#f5fbf7",
  },
  threadTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  threadSubject: {
    color: "#1d2f24",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  threadDate: {
    color: "#4e6456",
    fontSize: 11,
    fontWeight: "600",
  },
  threadMeta: {
    color: "#4c6153",
    fontSize: 12,
    fontWeight: "600",
  },
  threadPreview: {
    color: "#3f5447",
    fontSize: 12,
    fontWeight: "500",
  },
  chatWrap: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#c6d3c8",
    backgroundColor: "#fff",
  },
  backButtonText: {
    color: "#2c4134",
    fontWeight: "700",
    fontSize: 12,
  },
  chatHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  chatSubject: {
    color: "#1f2f26",
    fontWeight: "800",
    fontSize: 15,
  },
  chatMeta: {
    marginTop: 2,
    color: "#4f6256",
    fontWeight: "600",
    fontSize: 12,
  },
  messagesWrap: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cfdbd1",
    backgroundColor: "#e8efe9",
  },
  messagesContent: {
    padding: 10,
    gap: 7,
  },
  messageRow: {
    width: "100%",
    flexDirection: "row",
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  messageBubbleMine: {
    backgroundColor: "#d5f0de",
    borderTopRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 4,
  },
  messageAuthor: {
    color: "#3b5647",
    fontSize: 11,
    fontWeight: "700",
  },
  messageBody: {
    color: "#203127",
    fontSize: 14,
    fontWeight: "500",
  },
  messagePhotoWrap: {
    marginTop: 6,
    gap: 4,
  },
  messagePhoto: {
    width: 190,
    height: 190,
    borderRadius: 10,
    backgroundColor: "#dbe4dc",
  },
  messagePhotoCaption: {
    color: "#4d6155",
    fontSize: 11,
    fontWeight: "600",
  },
  messageDate: {
    color: "#5a6f61",
    fontSize: 10,
    fontWeight: "600",
    alignSelf: "flex-end",
  },
  replyBox: {
    gap: 8,
    paddingTop: 2,
  },
  emptyState: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cfdbd1",
    backgroundColor: "#fff",
    padding: 14,
  },
  emptyText: {
    color: "#476053",
    fontSize: 13,
    fontWeight: "600",
  },
});

