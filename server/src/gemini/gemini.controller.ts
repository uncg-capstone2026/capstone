import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GeminiService } from './gemini.service';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly gemini: GeminiService) {}

  @Post('expand-query')
  async expandQuery(@Body() body: { userRequest: string }) {
    try {
      return await this.gemini.expandQuery(body.userRequest);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  // DELETE LATER: temporary route for manually testing expandAndEmbedQuery from Bruno
  @Post('expand-and-embed')
  async expandAndEmbed(@Body() body: { userRequest: string }) {
    try {
      return await this.gemini.expandAndEmbedQuery(body.userRequest);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  // DELETE LATER: temporary route for manually testing embedImage from Bruno
  @Post('embed-image')
  @UseInterceptors(FileInterceptor('image'))
  async embedImage(
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('Missing "image" file field');
    try {
      const vector = await this.gemini.embedImage(file.buffer, file.mimetype);
      return { dimensions: vector.length, vector };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
