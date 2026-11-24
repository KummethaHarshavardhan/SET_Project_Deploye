import api from "./api";

export const getAiHealth = async () => {
  const response = await api.get("/ai/health");
  return response.data;
};

export const getAiHistory = async () => {
  const response = await api.get("/ai/history");
  return response.data.messages || [];
};

export const clearAiHistory = async () => {
  const response = await api.delete("/ai/history");
  return response.data;
};

export const sendAiTextMessage = async (message, language = "en-IN") => {
  const response = await api.post("/ai/chat", { message, language });
  return response.data;
};

export const sendAiVoiceMessage = async (formData) => {
  const response = await api.post("/ai/chat", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const updateAiMessageStatus = async (messageId, status, replyText) => {
  const response = await api.patch(`/ai/message/${messageId}/status`, {
    status,
    replyText,
  });
  return response.data.messages || [];
};
