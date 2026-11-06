import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxRelayService } from './outbox-relay.service';
import { RabbitMqService } from './rabbitmq.service';

@Global()
@Module({
  providers: [OutboxService, OutboxRelayService, RabbitMqService],
  exports: [OutboxService, OutboxRelayService, RabbitMqService],
})
export class EventsModule {}
