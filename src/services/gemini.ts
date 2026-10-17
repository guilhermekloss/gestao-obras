import { GoogleGenAI } from "@google/genai";

export function analiseIaDisponivel(): boolean {
  return Boolean(process.env.GEMINI_PROJETO || process.env.GEMINI_API_KEY);
}

export function clienteGemini(): GoogleGenAI {
  const projeto = process.env.GEMINI_PROJETO;
  if (projeto) {
    return new GoogleGenAI({ vertexai: true, project: projeto, location: process.env.GEMINI_LOCAL || "global" });
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}
