import { Global, Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OutboxService } from './outbox.service';
import { RabbitMqService } from './rabbitmq.service';
import { OutboxRelayService } from './outbox-relay.service';
import { CatalogSyncConsumerService } from './catalog-sync-consumer.service';

@Global()
@Module({
  imports: [CatalogModule],
  providers: [OutboxService, RabbitMqService, OutboxRelayService, CatalogSyncConsumerService],
  exports: [OutboxService],
})
export class EventsModule {}
