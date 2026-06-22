import { Module } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { CurriculumController } from './curriculum.controller';

@Module({
  providers: [CurriculumService],
  controllers: [CurriculumController],
})
export class CurriculumModule {}
