import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageProcessingService } from './image-processing/service';
import { QueryExpansionService } from './query-expansion/service';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly imageProcessing: ImageProcessingService, private readonly queryExpansion: QueryExpansionService)
  {}

  // ==================== TEST / DEBUG ONLY (DELETE LATER) ====================
  // Manual Bruno test routes. Upload and outfit planning call the services directly.

  // Test expandQuery
  @Post('expand-query')
  async expandQuery(@Body() body: { userRequest: string })
  {
    try {
      return await this.queryExpansion.expandQuery(body.userRequest);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  // Test expandAndEmbedQuery
  @Post('expand-and-embed')
  async expandAndEmbed(@Body() body: { userRequest: string })
  {
    try {
      return await this.queryExpansion.expandAndEmbedQuery(body.userRequest);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  // Test embedImage (multipart, file field "image")
  @Post('embed-image')
  @UseInterceptors(FileInterceptor('image'))
  async embedImage(@UploadedFile() file?: { buffer: Buffer; mimetype: string })
  {
    if (!file) throw new BadRequestException('Missing "image" file field');
    try {
      const vector = await this.imageProcessing.embedImage(file.buffer, file.mimetype);
      return { dimensions: vector.length, vector };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  // Test extractImageAttributes (multipart, file field "image")
  @Post('image-attributes')
  @UseInterceptors(FileInterceptor('image'))
  async imageAttributes(@UploadedFile() file?: { buffer: Buffer; mimetype: string })
  {
    if (!file) throw new BadRequestException('Missing "image" file field');
    try {
      return await this.imageProcessing.extractImageAttributes(
        file.buffer,
        file.mimetype,
      );
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  // ==================== END TEST / DEBUG ====================
}
