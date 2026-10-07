import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { S3Module } from './s3/s3.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ItemsModule } from './items/items.module';
import { GeminiModule } from './gemini/gemini.module';
import { WeatherModule } from './weather/weather.module';
import { PhotosModule } from './photos/photos.module';
import { StylistModule } from './stylist/stylist.module';
import { OutfitsModule } from './outfits/outfits.module';
import { CollectionsModule } from './collections/collections.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    S3Module,
    AuthModule,
    ItemsModule,
    GeminiModule,
    WeatherModule,
    PhotosModule,
    StylistModule,
    OutfitsModule,
    CollectionsModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}