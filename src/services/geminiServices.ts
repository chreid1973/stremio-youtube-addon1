import { GoogleGenAI } from '@google/genai';
import { Channel } from '../types';

const API_KEY = import.meta.env.VITE_API_KEY;

let ai: GoogleGenAI | null = null;

if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
  console.warn('VITE_API_KEY is not set. Gemini features will be unavailable.');
}

export const getSummary = async (channel: Channel): Promise<string> => {
  if (!ai) {
    return 'Gemini API key is not configured. Please add VITE_API_KEY to your .env file.';
  }

  let prompt: string;

  if (channel.type === 'youtube') {
    prompt = `Summarize the YouTube channel "${channel.name}". Its description is: "${channel.description}". What is this channel likely about? Keep it brief and engaging, under 40 words.`;
  } else {
    prompt = `Summarize the GitHub repository "${channel.name}". Its description is: "${channel.description}". What is the purpose of this repository? Keep it brief and clear, under 40 words.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error('Error generating summary with Gemini API:', error);
    return 'Could not generate AI summary.';
  }
};