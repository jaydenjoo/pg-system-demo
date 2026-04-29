import { Global, Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { SlackChannel } from "./channels/slack.channel";
import { EmailChannel } from "./channels/email.channel";

@Global()
@Module({
  providers: [SlackChannel, EmailChannel, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
