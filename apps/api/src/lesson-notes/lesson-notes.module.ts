import { Module } from '@nestjs/common';
import { LessonNotesService } from './lesson-notes.service';
import { LessonNotesController } from './lesson-notes.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [LessonNotesService],
  controllers: [LessonNotesController],
})
export class LessonNotesModule {}
