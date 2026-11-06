import { Global, Module } from '@nestjs/common';
import { ProductInventoryEventsHandler } from './handlers/product-inventory-events.handler';
import { SalesPosEventsHandler } from './handlers/sales-pos-events.handler';
import { EventDispatcherService } from './event-dispatcher.service';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service';

@Global()
@Module({
  providers: [
    ProductInventoryEventsHandler,
    SalesPosEventsHandler,
    EventDispatcherService,
    RabbitMqConsumerService,
  ],
  exports: [EventDispatcherService, ProductInventoryEventsHandler, SalesPosEventsHandler],
})
export class EventsModule {}
