import { Body, Controller, Post } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import {
  QUERY_EXPANSION_PROMPT,
  QUERY_EXPANSION_RESPONSE_SCHEMA,
} from './prompts';
import { CLOTHING_TYPES } from './constants';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly gemini: GeminiService) {}

  @Post('expand-query')
  async expandQuery(@Body() body: { userRequest: string }) {
    const promptWithTypes = QUERY_EXPANSION_PROMPT.replace(
      '{available_types}',
      CLOTHING_TYPES.join(', '),
    );
    const fullPrompt = `${promptWithTypes}\n\nUser request: ${body.userRequest}`;
    const text = await this.gemini.generateJson(
      fullPrompt,
      QUERY_EXPANSION_RESPONSE_SCHEMA,
    );
    return JSON.parse(text);
  }
}
