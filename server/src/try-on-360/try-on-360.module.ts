import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { GeminiHelpers } from '../gemini/helpers';
import { S3Module } from '../s3/s3.module';
import { TryOn360Controller } from './try-on-360.controller';
import { TryOn360Service } from './try-on-360.service';

// ---- Test routes only ----
// POST /api/stylist/try-on-360 (+ /base, /direct): the 360° try-on on photos
// sent with the request. The real try-on is TryOnService
// (gemini/try-on/service.ts), behind POST /api/stylist/try-on. Kept in its own
// module so it can be deleted: remove this folder and its import in
// app.module.ts.
// - GeminiModule gives us TryOnService (loadItems).
// - GeminiHelpers (the Gemini client) isn't exported from GeminiModule, so
//   it's provided here too, as in stylist.module.ts.
@Module({
  imports: [GeminiModule, S3Module],
  controllers: [TryOn360Controller],
  providers: [TryOn360Service, GeminiHelpers],
})
export class TryOn360Module {}
