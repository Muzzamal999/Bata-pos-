import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Runs `work` exactly once per event id. Checks-and-inserts the idempotency
 * ledger row as the FIRST statement of the transaction, so a duplicate
 * delivery (at-least-once RabbitMQ semantics, or a genuine retry) either
 * never reaches `work` at all, or - if two deliveries race - exactly one of
 * them wins the insert and the other's transaction rolls back cleanly.
 * Returns false if the event had already been processed (a no-op skip).
 */
export async function withIdempotency(
  prisma: PrismaService,
  eventId: string,
  eventType: string,
  work: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<boolean> {
  const already = await prisma.processedEvent.findUnique({ where: { id: eventId } });
  if (already) {
    return false;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.processedEvent.create({ data: { id: eventId, eventType } });
      await work(tx);
    });
    return true;
  } catch (error) {
    // Two concurrent deliveries both passed the pre-check above; the second
    // one to reach here collides on the primary key - that's the expected
    // "lost the race, already handled by the other delivery" case, not a
    // real failure.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}
