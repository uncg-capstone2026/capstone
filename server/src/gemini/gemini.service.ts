import { Injectable } from '@nestjs/common';
import { GoogleGenAI, Schema } from '@google/genai';

@Injectable()
export class GeminiService {
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async generateJson(
    prompt: string,
    responseSchema: Schema,
    model = 'gemini-flash-latest',
  ): Promise<string> {
    const response = await this.ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
    return response.text ?? '';
  }
}
