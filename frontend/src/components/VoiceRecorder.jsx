import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  FaMicrophone,
  FaStop,
  FaSpinner,
  FaCheck,
  FaEdit,
  FaTimes,
  FaTrash,
  FaExclamationTriangle,
} from "react-icons/fa";
import {
  processVoiceAudio,
  confirmVoiceTransactions,
  cancelVoiceExtraction,
} from "../services/recordingService";
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

function VoiceRecorder() {
  const toast = useToast();
  const location = useLocation();

  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [duration, setDuration] = useState(0);
  const [saveAudioConsent, setSaveAudioConsent] = useState(false);

  // Extracted voice transaction modal state
  const [extraction, setExtraction] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const durationRef = useRef(0);
  const saveConsentRef = useRef(false);

  useEffect(() => {
    saveConsentRef.current = saveAudioConsent;
  }, [saveAudioConsent]);

  // Sync token state on route transition or auth events
  useEffect(() => {
    setToken(localStorage.getItem("token"));
  }, [location.pathname]);

  useEffect(() => {
    const handleAuthChange = () => {
      setToken(localStorage.getItem("token"));
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

  // Stop recording and release microphone if user logs out or leaves authenticated pages
  useEffect(() => {
    if (!isAuthenticated) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        try {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
        } catch (e) {
          // Ignore error on abort
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
      setIsProcessing(false);
      setDuration(0);
      durationRef.current = 0;
      setExtraction(null);
      setTransactions([]);
    }
  }, [isAuthenticated, location.pathname]);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    const currentToken = localStorage.getItem("token");
    if (!currentToken) {
      toast.warning("Please log in to use voice tracking.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

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
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const finalDuration = durationRef.current;

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        if (audioBlob.size === 0) {
          toast.warning("Recording was empty.");
          return;
        }

        setIsProcessing(true);
        try {
          const ext = mimeType.includes("mp4")
            ? "mp4"
            : mimeType.includes("ogg")
            ? "ogg"
            : "webm";

          const formData = new FormData();
          formData.append(
            "audio",
            audioBlob,
            `voice_recording_${Date.now()}.${ext}`
          );
          formData.append("duration", finalDuration.toString());
          formData.append("recordedAt", new Date().toISOString());
          formData.append("saveRecording", saveConsentRef.current ? "true" : "false");

          const data = await processVoiceAudio(formData);

          if (data.recordingSaved) {
            window.dispatchEvent(new CustomEvent("recording-created"));
          }

          if (!data.transactions || data.transactions.length === 0) {
            toast.warning(
              data.transcript
                ? `Heard: "${data.transcript}", but no transaction was detected.`
                : "Could not detect any transaction in the recording."
            );
            return;
          }

          setExtraction({
            extractionId: data.extractionId,
            transcript: data.transcript,
            needsClarification: data.needsClarification,
          });
          setTransactions(data.transactions);

          // Automatically open editor for the first item needing clarification
          const firstUncertain = data.transactions.findIndex(
            (t) => t.needsClarification || t.type === "unknown" || !t.amount
          );
          setEditingIndex(firstUncertain >= 0 ? firstUncertain : null);
        } catch (err) {
          console.error("Voice AI processing failed:", err);
          toast.error(err?.message || "Failed to process voice recording.");
        } finally {
          setIsProcessing(false);
          setDuration(0);
          durationRef.current = 0;
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setDuration(0);
      durationRef.current = 0;

      timerIntervalRef.current = setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1;
          durationRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error("Microphone access error:", err);
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        toast.error(
          "Microphone permission denied. Please allow microphone access in your browser settings."
        );
      } else if (
        err.name === "NotFoundError" ||
        err.name === "DevicesNotFoundError"
      ) {
        toast.error("No microphone found on your device.");
      } else {
        toast.error(err.message || "Failed to access microphone.");
      }
    }
  };

  const stopRecording = () => {
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

  const handleClick = () => {
    if (isProcessing) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleTxChange = (index, field, value) => {
    setTransactions((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "type") {
          updated.category = value === "income" ? "Other Income" : "Others";
        }
        const validType = updated.type === "income" || updated.type === "expense";
        const validAmount = Number(updated.amount) > 0;
        if (validType && validAmount) {
          updated.needsClarification = false;
        }
        return updated;
      })
    );
  };

  const handleRemoveTx = (index) => {
    setTransactions((prev) => prev.filter((_, idx) => idx !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleCancelModal = async () => {
    const id = extraction?.extractionId;
    setExtraction(null);
    setTransactions([]);
    setEditingIndex(null);
    if (id) {
      try {
        await cancelVoiceExtraction(id);
      } catch (e) {
        // Non-blocking
      }
    }
  };

  const hasInvalidTransactions =
    transactions.length === 0 ||
    transactions.some(
      (t) =>
        !["income", "expense"].includes(t.type) ||
        !t.amount ||
        Number(t.amount) <= 0 ||
        !t.date
    );

  const handleConfirmSave = async () => {
    if (hasInvalidTransactions) {
      toast.warning("Please resolve all highlighted fields before saving.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        extractionId: extraction?.extractionId,
        transactions: transactions.map((t) => ({
          ...t,
          amount: Number(t.amount),
        })),
      };
      const res = await confirmVoiceTransactions(payload);
      const count = (res.incomes?.length || 0) + (res.expenses?.length || 0);
      toast.success(
        `Saved ${count} ${count === 1 ? "transaction" : "transactions"} via Voice AI!`
      );
      window.dispatchEvent(new CustomEvent("transactions-updated"));
      setExtraction(null);
      setTransactions([]);
      setEditingIndex(null);
    } catch (err) {
      console.error("Failed to save voice transactions:", err);
      toast.error(err?.message || "Failed to save transactions.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="voice-recorder-container" aria-live="polite">
        {isRecording && (
          <div className="voice-recorder-timer">
            <span className="voice-recorder-blink-dot" />
            <span>REC {formatTimer(duration)}</span>
            <label
              className="voice-save-toggle"
              title="Keep audio file in Recordings"
            >
              <input
                type="checkbox"
                checked={saveAudioConsent}
                onChange={(e) => setSaveAudioConsent(e.target.checked)}
              />
              <span>Save audio</span>
            </label>
          </div>
        )}

        {isProcessing && (
          <div className="voice-recorder-timer">
            <FaSpinner className="recorder-spinner" />
            <span>Analyzing with Gemini AI...</span>
          </div>
        )}

        <button
          type="button"
          id="voice-recorder-btn"
          className={`voice-recorder-btn ${isRecording ? "recording" : ""}`}
          onClick={handleClick}
          title={
            isProcessing
              ? "Analyzing voice with Gemini AI..."
              : isRecording
              ? "Click to stop recording"
              : "Click to record voice transaction"
          }
          aria-label={
            isRecording ? "Stop voice recording" : "Start voice recording"
          }
          disabled={isProcessing}
        >
          {isProcessing ? (
            <FaSpinner className="recorder-spinner" />
          ) : isRecording ? (
            <FaStop />
          ) : (
            <FaMicrophone />
          )}
        </button>
      </div>

      {extraction && (
        <div className="voice-modal-overlay" role="dialog" aria-modal="true">
          <div className="voice-modal">
            <div className="voice-modal-header">
              <div>
                <h3>Confirm Voice Transactions</h3>
                <p>Review Gemini AI extracted details before saving.</p>
              </div>
              <button
                type="button"
                className="voice-modal-close"
                onClick={handleCancelModal}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            {extraction.transcript && (
              <div className="voice-transcript-box">
                <span className="voice-transcript-label">Transcript:</span>
                <p>“{extraction.transcript}”</p>
              </div>
            )}

            <div className="voice-tx-list">
              {transactions.map((tx, idx) => {
                const isEditing = editingIndex === idx;
                const isUncertain =
                  tx.needsClarification ||
                  !["income", "expense"].includes(tx.type) ||
                  !tx.amount ||
                  Number(tx.amount) <= 0;
                const categories =
                  tx.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

                return (
                  <div
                    key={idx}
                    className={`voice-tx-card ${isUncertain ? "uncertain" : ""}`}
                  >
                    {isUncertain && (
                      <div className="voice-tx-warning">
                        <FaExclamationTriangle />
                        <span>
                          {tx.clarificationQuestion ||
                            "Please clarify or complete missing details."}
                        </span>
                      </div>
                    )}

                    <div className="voice-tx-card-top">
                      <span
                        className={`voice-tx-badge ${
                          tx.type === "income"
                            ? "badge-income"
                            : tx.type === "expense"
                            ? "badge-expense"
                            : "badge-unknown"
                        }`}
                      >
                        {tx.type.toUpperCase()}
                      </span>

                      <div className="voice-tx-actions">
                        <button
                          type="button"
                          className="voice-tx-icon-btn"
                          onClick={() =>
                            setEditingIndex(isEditing ? null : idx)
                          }
                          title={isEditing ? "Done editing" : "Edit Transaction"}
                        >
                          <FaEdit />
                          <span>{isEditing ? "Done" : "Edit"}</span>
                        </button>
                        {transactions.length > 1 && (
                          <button
                            type="button"
                            className="voice-tx-icon-btn danger"
                            onClick={() => handleRemoveTx(idx)}
                            title="Remove transaction"
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    </div>

                    {!isEditing ? (
                      <div className="voice-tx-summary">
                        <div className="voice-tx-main">
                          <strong>{tx.title || "Untitled"}</strong>
                          <span className="voice-tx-amount">
                            {tx.amount ? `₹${tx.amount}` : "Amount missing"}
                          </span>
                        </div>
                        <div className="voice-tx-meta">
                          <span>Category: {tx.category}</span>
                          <span>Method: {tx.paymentMethod}</span>
                          <span>Date: {tx.date}</span>
                          {tx.sender && <span>Sender: {tx.sender}</span>}
                          {tx.receiver && <span>To: {tx.receiver}</span>}
                        </div>
                        {tx.description && (
                          <p className="voice-tx-desc">{tx.description}</p>
                        )}
                      </div>
                    ) : (
                      <div className="voice-tx-edit-grid">
                        <label>
                          Type
                          <select
                            value={tx.type}
                            onChange={(e) =>
                              handleTxChange(idx, "type", e.target.value)
                            }
                          >
                            <option value="unknown">Select Type</option>
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                          </select>
                        </label>

                        <label>
                          Amount (₹)
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={tx.amount ?? ""}
                            onChange={(e) =>
                              handleTxChange(idx, "amount", e.target.value)
                            }
                            placeholder="Enter amount"
                          />
                        </label>

                        <label>
                          Title
                          <input
                            type="text"
                            value={tx.title}
                            onChange={(e) =>
                              handleTxChange(idx, "title", e.target.value)
                            }
                          />
                        </label>

                        <label>
                          Category
                          <select
                            value={
                              categories.includes(tx.category)
                                ? tx.category
                                : "Others"
                            }
                            onChange={(e) =>
                              handleTxChange(idx, "category", e.target.value)
                            }
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Payment Method
                          <select
                            value={
                              PAYMENT_METHODS.includes(tx.paymentMethod)
                                ? tx.paymentMethod
                                : "Cash"
                            }
                            onChange={(e) =>
                              handleTxChange(
                                idx,
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
                        </label>

                        <label>
                          Date
                          <input
                            type="date"
                            value={tx.date}
                            onChange={(e) =>
                              handleTxChange(idx, "date", e.target.value)
                            }
                          />
                        </label>

                        {tx.type === "income" ? (
                          <label>
                            Sender
                            <input
                              type="text"
                              value={tx.sender}
                              onChange={(e) =>
                                handleTxChange(idx, "sender", e.target.value)
                              }
                              placeholder="e.g. Rahul"
                            />
                          </label>
                        ) : (
                          <label>
                            Receiver / Merchant
                            <input
                              type="text"
                              value={tx.receiver}
                              onChange={(e) =>
                                handleTxChange(idx, "receiver", e.target.value)
                              }
                              placeholder="Optional"
                            />
                          </label>
                        )}

                        <label className="full-width">
                          Description
                          <input
                            type="text"
                            value={tx.description}
                            onChange={(e) =>
                              handleTxChange(idx, "description", e.target.value)
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="voice-modal-footer">
              <button
                type="button"
                className="voice-btn-cancel"
                onClick={handleCancelModal}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="voice-btn-confirm"
                onClick={handleConfirmSave}
                disabled={isSaving || hasInvalidTransactions}
              >
                {isSaving ? (
                  <>
                    <FaSpinner className="recorder-spinner" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <FaCheck />
                    <span>Confirm and Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default VoiceRecorder;
