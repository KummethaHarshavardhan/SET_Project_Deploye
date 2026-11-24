import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  FaMicrophone,
  FaStop,
  FaSpinner,
  FaCheck,
  FaEdit,
  FaTimes,
  FaPaperPlane,
  FaRobot,
  FaVolumeUp,
  FaVolumeMute,
  FaTrash,
  FaRedo,
} from "react-icons/fa";
import {
  confirmVoiceTransactions,
  cancelVoiceExtraction,
} from "../services/recordingService";
import {
  getAiHealth,
  getAiHistory,
  clearAiHistory,
  sendAiTextMessage,
  sendAiVoiceMessage,
  updateAiMessageStatus,
} from "../services/aiService";
import { useToast } from "../context/ToastContext";
import "../styles/voiceRecorder.css";

const PUBLIC_AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/"];

const EXPENSE_CATEGORIES = [
  "Food",
  "Groceries",
  "Fuel",
  "Travel",
  "Bills",
  "Shopping",
  "Entertainment",
  "Healthcare",
  "Others",
];

const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Business",
  "Investment",
  "Gift",
  "Other Income",
  "Others",
];

const PAYMENT_METHODS = ["PhonePe", "UPI", "Cash", "Card", "Bank Transfer"];

function formatMsgTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function VoiceRecorder() {
  const toast = useToast();
  const location = useLocation();

  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [inputText, setInputText] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isSavingTx, setIsSavingTx] = useState(false);
  const [duration, setDuration] = useState(0);

  // Explicit connection state: 'online' | 'thinking' | 'busy' | 'offline'
  const [connectionState, setConnectionState] = useState("online");
  const [statusLabel, setStatusLabel] = useState("Online");

  // Track inline edits per messageId -> txIndex
  const [draftEdits, setDraftEdits] = useState({});
  const [editingKey, setEditingKey] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const speechRecRef = useRef(null);
  const liveTranscriptRef = useRef("");
  const timerIntervalRef = useRef(null);
  const chatEndRef = useRef(null);
  const pendingRequestRef = useRef(false);

  useEffect(() => {
    setToken(localStorage.getItem("token"));
  }, [location.pathname]);

  useEffect(() => {
    const handleAuthChange = () => {
      setToken(localStorage.getItem("token"));
      setHistoryLoaded(false);
      setMessages([]);
    };
    window.addEventListener("storage", handleAuthChange);
    window.addEventListener("auth-changed", handleAuthChange);
    return () => {
      window.removeEventListener("storage", handleAuthChange);
      window.removeEventListener("auth-changed", handleAuthChange);
    };
  }, []);

  const isAuthRoute = PUBLIC_AUTH_ROUTES.includes(location.pathname);
  const isAuthenticated = Boolean(token && !isAuthRoute);

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback(
    (text) => {
      if (!ttsEnabled || !text) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        utterance.rate = 1.0;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        setIsSpeaking(false);
      }
    },
    [ttsEnabled, language]
  );

  const cleanupRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.onresult = null;
        speechRecRef.current.onerror = null;
        speechRecRef.current.stop();
      } catch (e) {}
      speechRecRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    setDuration(0);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      cleanupRecording();
      stopSpeech();
      setPanelOpen(false);
    }
  }, [isAuthenticated, cleanupRecording, stopSpeech]);

  useEffect(() => {
    return () => {
      cleanupRecording();
      stopSpeech();
    };
  }, [cleanupRecording, stopSpeech]);

  // Check health and restore conversation history when panel opens
  useEffect(() => {
    if (!panelOpen || !isAuthenticated) return;

    getAiHealth()
      .then((health) => {
        if (health?.ok) {
          setConnectionState("online");
          setStatusLabel("Online");
        }
      })
      .catch(() => {
        setConnectionState("offline");
        setStatusLabel("Offline");
      });

    if (!historyLoaded) {
      getAiHistory()
        .then((hist) => {
          setMessages(hist);
          setHistoryLoaded(true);
        })
        .catch(() => {
          setHistoryLoaded(true);
        });
    }
  }, [panelOpen, isAuthenticated, historyLoaded]);

  useEffect(() => {
    if (panelOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking, panelOpen]);

  if (!isAuthenticated) {
    return null;
  }

  const handleClosePanel = () => {
    cleanupRecording();
    stopSpeech();
    setPanelOpen(false);
  };

  const handleToggleFloatingButton = () => {
    if (panelOpen) {
      handleClosePanel();
    } else {
      setPanelOpen(true);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSendText = async (overrideText, { isRetry = false, failedErrorId = null } = {}) => {
    const textToSend = (overrideText ?? inputText).trim();
    if (!textToSend || pendingRequestRef.current) return;

    pendingRequestRef.current = true;
    if (!overrideText && !isRetry) setInputText("");

    const tempUserId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (isRetry && failedErrorId) {
      // Remove only the single failed error bubble; keep the existing user message
      setMessages((prev) => prev.filter((m) => m._id !== failedErrorId));
    } else {
      setMessages((prev) => [
        ...prev,
        {
          _id: tempUserId,
          role: "user",
          text: textToSend,
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    setIsThinking(true);
    setConnectionState("thinking");
    setStatusLabel("Thinking...");

    try {
      const data = await sendAiTextMessage(textToSend, language);
      setMessages((prev) => {
        // Replace the last matching pending user message (or tempUserId) with saved backend messages
        const filtered = isRetry
          ? prev.slice(0, -1)
          : prev.filter((m) => m._id !== tempUserId);
        return [...filtered, data.userMessage, data.aiMessage];
      });
      setConnectionState("online");
      setStatusLabel("Online");
      speakText(data.aiMessage?.text);
    } catch (err) {
      const isNetworkDown =
        typeof navigator !== "undefined" && !navigator.onLine;
      const errMsg =
        err?.message ||
        "AI assistant is temporarily busy due to high demand. Please retry.";
      setConnectionState(isNetworkDown ? "offline" : "busy");
      setStatusLabel(isNetworkDown ? "Offline" : "Temporarily Busy");

      const errorBubbleId = `err-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          _id: errorBubbleId,
          role: "assistant",
          text: errMsg,
          isError: true,
          retryText: textToSend,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsThinking(false);
      pendingRequestRef.current = false;
    }
  };

  const startPanelRecording = async () => {
    if (pendingRequestRef.current || isRecording) return;
    stopSpeech();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      liveTranscriptRef.current = "";
      setLiveTranscript("");

      // Optional live speech-to-text preview via Web Speech API
      const SpeechRec =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = language;
          rec.interimResults = true;
          rec.continuous = true;
          rec.onresult = (event) => {
            let transcript = "";
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript + " ";
            }
            const cleaned = transcript.trim();
            liveTranscriptRef.current = cleaned;
            setLiveTranscript(cleaned);
          };
          rec.onerror = () => {};
          rec.start();
          speechRecRef.current = rec;
        } catch (e) {}
      }

      let mimeType = "audio/webm";
      if (typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          mimeType = "audio/ogg;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const capturedText = liveTranscriptRef.current;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (speechRecRef.current) {
          try {
            speechRecRef.current.stop();
          } catch (e) {}
          speechRecRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        setLiveTranscript("");
        liveTranscriptRef.current = "";

        // If browser SpeechRecognition captured clear words, send as fast text query
        if (capturedText && capturedText.length >= 2) {
          await handleSendText(capturedText);
          return;
        }

        if (audioBlob.size === 0 || pendingRequestRef.current) {
          toast.warning("Recording was empty.");
          return;
        }

        pendingRequestRef.current = true;
        const ext = mimeType.includes("mp4")
          ? "mp4"
          : mimeType.includes("ogg")
          ? "ogg"
          : "webm";

        const formData = new FormData();
        formData.append("audio", audioBlob, `voice_chat_${Date.now()}.${ext}`);
        formData.append("language", language);

        setIsThinking(true);
        setConnectionState("thinking");
        setStatusLabel("Processing voice...");

        try {
          const data = await sendAiVoiceMessage(formData);
          setMessages((prev) => [...prev, data.userMessage, data.aiMessage]);
          setConnectionState("online");
          setStatusLabel("Online");
          speakText(data.aiMessage?.text);
        } catch (err) {
          const msg =
            err?.message ||
            "Voice processing is temporarily unavailable. Please try typing or retry.";
          setConnectionState("busy");
          setStatusLabel("Temporarily Busy");
          setMessages((prev) => [
            ...prev,
            {
              _id: `err-${Date.now()}`,
              role: "assistant",
              text: msg,
              isError: true,
              timestamp: new Date().toISOString(),
            },
          ]);
        } finally {
          setIsThinking(false);
          setDuration(0);
          pendingRequestRef.current = false;
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setConnectionState("thinking");
      setStatusLabel("Listening...");
      setDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error(
        err?.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow microphone access."
          : err?.message || "Could not access microphone."
      );
    }
  };

  const stopPanelRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelPanelRecording = () => {
    cleanupRecording();
    setConnectionState("online");
    setStatusLabel("Online");
  };

  const getDraftTransactions = (msg) => {
    return draftEdits[msg._id] || msg.transactionPreview || [];
  };

  const handleEditTxField = (msg, txIdx, field, value) => {
    const current = [...getDraftTransactions(msg)];
    const updated = { ...current[txIdx], [field]: value };
    if (field === "type") {
      updated.category = value === "income" ? "Other Income" : "Others";
    }
    current[txIdx] = updated;
    setDraftEdits((prev) => ({ ...prev, [msg._id]: current }));
  };

  const handleRemoveDraftTx = (msg, txIdx) => {
    const current = [...getDraftTransactions(msg)].filter((_, idx) => idx !== txIdx);
    setDraftEdits((prev) => ({ ...prev, [msg._id]: current }));
    setEditingKey(null);
  };

  const handleConfirmPreview = async (msg) => {
    if (isSavingTx) return;
    const txs = getDraftTransactions(msg);
    const invalid =
      txs.length === 0 ||
      txs.some(
        (t) =>
          !["income", "expense"].includes(t.type) ||
          !t.amount ||
          Number(t.amount) <= 0
      );

    if (invalid) {
      toast.warning("Please provide a valid type and positive amount first.");
      return;
    }

    setIsSavingTx(true);
    try {
      const res = await confirmVoiceTransactions({
        extractionId: msg.extractionId,
        transactions: txs.map((t) => ({ ...t, amount: Number(t.amount) })),
      });

      const savedCount =
        (res.incomes?.length || 0) + (res.expenses?.length || 0);
      const first = txs[0];
      const successReply =
        savedCount === 1
          ? `Your ₹${Number(first.amount).toLocaleString()} ${first.category} ${first.type} has been added successfully.`
          : `${savedCount} transactions have been saved to your records successfully.`;

      const updatedMsgs = await updateAiMessageStatus(
        msg._id,
        "confirmed",
        successReply
      );
      setMessages(updatedMsgs);
      setEditingKey(null);
      window.dispatchEvent(new CustomEvent("transactions-updated"));
      toast.success("Transaction saved!");
      speakText(successReply);
    } catch (err) {
      toast.error(err?.message || "Failed to save transaction.");
    } finally {
      setIsSavingTx(false);
    }
  };

  const handleCancelPreview = async (msg) => {
    try {
      if (msg.extractionId) {
        await cancelVoiceExtraction(msg.extractionId);
      }
      const updatedMsgs = await updateAiMessageStatus(
        msg._id,
        "cancelled",
        "Okay, I cancelled that transaction."
      );
      setMessages(updatedMsgs);
      setEditingKey(null);
    } catch (err) {
      toast.error("Could not cancel transaction.");
    }
  };

  const handleClearChat = async () => {
    stopSpeech();
    try {
      await clearAiHistory();
      setMessages([]);
      setConnectionState("online");
      setStatusLabel("Online");
    } catch (e) {
      toast.error("Failed to clear conversation.");
    }
  };

  return (
    <>
      {/* Existing Floating AI Assistant Button (Single Entry Point) */}
      <div className="voice-recorder-container" aria-live="polite">
        <button
          type="button"
          id="voice-recorder-btn"
          className={`voice-recorder-btn ai-fab-glow ${panelOpen ? "active-panel" : ""}`}
          onClick={handleToggleFloatingButton}
          title="AI Financial Assistant"
          aria-label="AI Financial Assistant"
        >
          <FaRobot />
        </button>
      </div>

      {panelOpen && (
        <div className="ai-panel-backdrop" onClick={handleClosePanel} />
      )}

      <aside
        className={`ai-assistant-panel ${panelOpen ? "open" : ""}`}
        aria-label="AI Financial Assistant"
      >
        {/* HEADER */}
        <div className="ai-panel-header">
          <div className="ai-panel-title-wrap">
            <span className="ai-panel-icon">
              <FaRobot />
            </span>
            <div>
              <h3>AI Financial Assistant</h3>
              <span className="ai-panel-status">
                <span
                  className={`ai-status-dot ${
                    isRecording
                      ? "recording"
                      : isThinking
                      ? "thinking"
                      : connectionState
                  }`}
                />
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="ai-panel-header-actions">
            {isSpeaking && (
              <button
                type="button"
                className="ai-stop-speak-btn"
                onClick={stopSpeech}
                title="Stop speaking"
              >
                <FaStop />
                <span>Stop</span>
              </button>
            )}

            <select
              className="ai-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Assistant language"
              title="Voice & Reply Language"
            >
              <option value="en-IN">EN</option>
              <option value="te-IN">TE</option>
            </select>

            <button
              type="button"
              className="ai-icon-btn"
              onClick={() => {
                if (ttsEnabled) stopSpeech();
                setTtsEnabled((v) => !v);
              }}
              title={ttsEnabled ? "Mute voice replies" : "Enable voice replies"}
              aria-label="Toggle voice output"
            >
              {ttsEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
            </button>

            <button
              type="button"
              className="ai-icon-btn"
              onClick={handleClearChat}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <FaTrash />
            </button>

            <button
              type="button"
              className="ai-icon-btn"
              onClick={handleClosePanel}
              title="Close assistant"
              aria-label="Close AI Assistant"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        {/* CHAT AREA */}
        <div className="ai-chat-body">
          {messages.length === 0 && !isThinking && (
            <div className="ai-welcome-box">
              <p>
                Hi! Ask me about your real finances or log expenses and income
                by text or voice.
              </p>
              <div className="ai-quick-prompts">
                {[
                  "How much did I spend on food this month?",
                  "What is my current balance?",
                  "I spent 1000 rupees on food",
                  "Rahul sent me 2000 rupees",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="ai-quick-chip"
                    onClick={() => handleSendText(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const txs = getDraftTransactions(msg);
            const hasPendingPreview =
              !isUser && msg.previewStatus === "pending" && txs.length > 0;

            return (
              <div
                key={msg._id}
                className={`ai-msg-row ${isUser ? "user" : "assistant"}`}
              >
                <div
                  className={`ai-msg-bubble ${isUser ? "user" : "assistant"} ${
                    msg.isError ? "error" : ""
                  }`}
                >
                  <p className="ai-msg-text">{msg.text}</p>

                  {msg.isError && msg.retryText && (
                    <button
                      type="button"
                      className="ai-inline-retry-btn"
                      onClick={() =>
                        handleSendText(msg.retryText, {
                          isRetry: true,
                          failedErrorId: msg._id,
                        })
                      }
                      disabled={isThinking}
                    >
                      <FaRedo />
                      <span>Retry</span>
                    </button>
                  )}

                  {hasPendingPreview && (
                    <div className="ai-tx-preview-wrap">
                      {txs.map((tx, txIdx) => {
                        const key = `${msg._id}-${txIdx}`;
                        const isEditing = editingKey === key;
                        const categories =
                          tx.type === "income"
                            ? INCOME_CATEGORIES
                            : EXPENSE_CATEGORIES;

                        return (
                          <div key={txIdx} className="ai-tx-preview-card">
                            <div className="ai-tx-preview-top">
                              <span
                                className={`voice-tx-badge ${
                                  tx.type === "income"
                                    ? "badge-income"
                                    : "badge-expense"
                                }`}
                              >
                                {tx.type?.toUpperCase()}
                              </span>
                              <div className="ai-tx-card-btns">
                                <button
                                  type="button"
                                  className="ai-tx-edit-toggle"
                                  onClick={() =>
                                    setEditingKey(isEditing ? null : key)
                                  }
                                >
                                  <FaEdit />
                                  <span>{isEditing ? "Done" : "Edit"}</span>
                                </button>
                                {txs.length > 1 && (
                                  <button
                                    type="button"
                                    className="ai-tx-edit-toggle danger"
                                    onClick={() =>
                                      handleRemoveDraftTx(msg, txIdx)
                                    }
                                    title="Remove item"
                                  >
                                    <FaTimes />
                                  </button>
                                )}
                              </div>
                            </div>

                            {!isEditing ? (
                              <div className="ai-tx-details">
                                <div>
                                  <strong>Amount:</strong> ₹{tx.amount || 0}
                                </div>
                                <div>
                                  <strong>Category:</strong> {tx.category}
                                </div>
                                {tx.sender && (
                                  <div>
                                    <strong>Sender:</strong> {tx.sender}
                                  </div>
                                )}
                                <div>
                                  <strong>Date:</strong> {tx.date}
                                </div>
                                {tx.description && (
                                  <div className="ai-tx-desc-line">
                                    <strong>Note:</strong> {tx.description}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="ai-tx-edit-fields">
                                <select
                                  value={tx.type}
                                  onChange={(e) =>
                                    handleEditTxField(
                                      msg,
                                      txIdx,
                                      "type",
                                      e.target.value
                                    )
                                  }
                                >
                                  <option value="expense">Expense</option>
                                  <option value="income">Income</option>
                                </select>
                                <input
                                  type="number"
                                  min="1"
                                  value={tx.amount ?? ""}
                                  onChange={(e) =>
                                    handleEditTxField(
                                      msg,
                                      txIdx,
                                      "amount",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Amount"
                                />
                                <select
                                  value={
                                    categories.includes(tx.category)
                                      ? tx.category
                                      : "Others"
                                  }
                                  onChange={(e) =>
                                    handleEditTxField(
                                      msg,
                                      txIdx,
                                      "category",
                                      e.target.value
                                    )
                                  }
                                >
                                  {categories.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={
                                    PAYMENT_METHODS.includes(tx.paymentMethod)
                                      ? tx.paymentMethod
                                      : "Cash"
                                  }
                                  onChange={(e) =>
                                    handleEditTxField(
                                      msg,
                                      txIdx,
                                      "paymentMethod",
                                      e.target.value
                                    )
                                  }
                                >
                                  {PAYMENT_METHODS.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="date"
                                  value={tx.date}
                                  onChange={(e) =>
                                    handleEditTxField(
                                      msg,
                                      txIdx,
                                      "date",
                                      e.target.value
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  value={tx.description || ""}
                                  onChange={(e) =>
                                    handleEditTxField(
                                      msg,
                                      txIdx,
                                      "description",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Description"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="ai-tx-actions">
                        <button
                          type="button"
                          className="ai-tx-confirm"
                          onClick={() => handleConfirmPreview(msg)}
                          disabled={isSavingTx}
                        >
                          <FaCheck />
                          <span>{isSavingTx ? "Saving..." : "Confirm"}</span>
                        </button>
                        <button
                          type="button"
                          className="ai-tx-cancel"
                          onClick={() => handleCancelPreview(msg)}
                          disabled={isSavingTx}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <span className="ai-msg-time">
                    {formatMsgTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            );
          })}

          {isThinking && (
            <div className="ai-msg-row assistant">
              <div className="ai-msg-bubble assistant typing">
                <span className="ai-typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* BOTTOM INPUT AREA */}
        <form
          className="ai-chat-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendText();
          }}
        >
          {isRecording ? (
            <div className="ai-recording-pill">
              <span className="voice-recorder-blink-dot" />
              <span className="ai-rec-text">
                {liveTranscript
                  ? `"${liveTranscript}"`
                  : `Listening ${formatTimer(duration)}`}
              </span>
              <button
                type="button"
                className="ai-rec-cancel-btn"
                onClick={cancelPanelRecording}
                title="Cancel recording"
              >
                <FaTimes />
              </button>
            </div>
          ) : (
            <input
              type="text"
              className="ai-chat-input"
              placeholder="Ask a question or type an expense..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isThinking}
            />
          )}

          <button
            type="button"
            className={`ai-mic-btn ${isRecording ? "recording" : ""}`}
            onClick={isRecording ? stopPanelRecording : startPanelRecording}
            disabled={isThinking}
            title={isRecording ? "Stop & send voice" : "Speak to AI Assistant"}
            aria-label={isRecording ? "Stop recording" : "Start voice input"}
          >
            {isThinking ? (
              <FaSpinner className="recorder-spinner" />
            ) : isRecording ? (
              <FaStop />
            ) : (
              <FaMicrophone />
            )}
          </button>

          {!isRecording && (
            <button
              type="submit"
              className="ai-send-btn"
              disabled={!inputText.trim() || isThinking}
              title="Send message"
              aria-label="Send message"
            >
              <FaPaperPlane />
            </button>
          )}
        </form>
      </aside>
    </>
  );
}

export default VoiceRecorder;
