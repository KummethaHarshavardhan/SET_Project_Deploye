import { API_BASE_URL } from "./apiConfig";
import api from "./api";

export const getRecordings = async () => {
  const response = await api.get("/recordings");
  return response.data.recordings || [];
};

export const uploadRecording = async (formData) => {
  const response = await api.post("/recordings", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const deleteRecording = async (id) => {
  const response = await api.delete(`/recordings/${id}`);
  return response.data;
};

export const getAudioStreamUrl = (id) => {
  const baseURL = API_BASE_URL;
  const token = localStorage.getItem("token");
  return `${baseURL}/recordings/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
};

export const processVoiceAudio = async (formData) => {
  const response = await api.post("/voice/process", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const confirmVoiceTransactions = async (payload) => {
  const response = await api.post("/voice/confirm", payload);
  return response.data;
};

export const cancelVoiceExtraction = async (extractionId) => {
  const response = await api.post("/voice/cancel", { extractionId });
  return response.data;
};
