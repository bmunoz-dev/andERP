import { dismissNotificationSchema, type Notifications } from '@anderp/shared';
import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ObligationsModule } from '../obligations/obligations.module';
import { NotificationsService } from './notifications.service';
import { RequiresModule } from '../auth/http/guards';

class DismissNotificationDto extends createZodDto(dismissNotificationSchema) {}

/** F14: panel de notificaciones (las alertas de la Agenda). */
@ApiTags('notifications')
@RequiresModule('agenda')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(): Promise<Notifications> {
    return this.notifications.list();
  }

  @Post('seen')
  @HttpCode(204)
  markSeen(): Promise<void> {
    return this.notifications.markSeen();
  }

  @Post('dismiss')
  @HttpCode(204)
  dismiss(@Body() body: DismissNotificationDto): Promise<void> {
    return this.notifications.dismiss(body);
  }
}

@Module({
  imports: [ObligationsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
