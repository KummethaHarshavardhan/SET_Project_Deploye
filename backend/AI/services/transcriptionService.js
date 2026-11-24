import fs from 'fs';
import { Type } from '@google/genai';
import { generateContentWithRetry, getGeminiModel } from '../config/gemini.js';

/**
 * Transcribes an audio file on disk using Google Gemini multimodal audio understanding.
 * @param {string} filePath - Absolute path to the audio file
 * @param {string} mimeType - MIME type (e.g. 'audio/webm', 'audio/mp4', 'audio/ogg')
 * @returns {Promise<string>} Clean verbatim transcript
 */
const transcribeAudioFile = async (filePath, mimeType = 'audio/webm') => {
  const model = getGeminiModel();

  const audioBuffer = await fs.promises.readFile(filePath);
  const base64Audio = audioBuffer.toString('base64');

  // Normalize browser-specific codec suffixes like "audio/webm;codecs=opus" -> "audio/webm"
  const cleanMimeType = (mimeType || 'audio/webm').split(';')[0].trim();

  const response = await generateContentWithRetry({
    model,
    contents: [
      {
        inlineData: {
          data: base64Audio,
          mimeType: cleanMimeType === 'video/webm' ? 'audio/webm' : cleanMimeType,
        },
      },
      'Transcribe this audio recording accurately and verbatim. Return only the spoken text.',
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: {
            type: Type.STRING,
            description: 'Verbatim transcription of the audio recording',
          },
        },
        required: ['transcript'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  return (parsed.transcript || '').trim();
};

export {
  transcribeAudioFile,
};
