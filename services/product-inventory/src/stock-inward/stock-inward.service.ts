import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { assertBranchAccess, assertTenantAccess } from '../common/utils/tenant-scope.util';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { AddLineDto } from './dto/add-line.dto';
import { UpdateLineDto } from './dto/update-line.dto';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto';
import { ListReceiptsQueryDto } from './dto/list-receipts-query.dto';

const RECEIPT_INCLUDE = { lines: true };

function generateReferenceNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = randomBytes(3).toString('hex').toUpperCase();
  return `GRN-${datePart}-${randomPart}`;
}

@Injectable()
export class StockInwardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  private requireTenant(caller: AuthenticatedUser): string {
    if (caller.tenantId === null) {
      throw new BadRequestException('A tenant context is required for stock inward operations');
    }
    return caller.tenantId;
  }

  async create(caller: AuthenticatedUser, dto: CreateReceiptDto) {
    const tenantId = this.requireTenant(caller);
    assertBranchAccess(caller, dto.branchId);
    return this.prisma.stockInwardReceipt.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        supplierReference: dto.supplierReference,
        referenceNumber: generateReferenceNumber(),
        createdByUserId: caller.userId,
      },
      include: RECEIPT_INCLUDE,
    });
  }

  async findAll(
    caller: AuthenticatedUser,
    query: ListReceiptsQueryDto,
  ): Promise<PaginatedResultDto<unknown>> {
    const tenantId = this.requireTenant(caller);
    if (query.branchId) {
      assertBranchAccess(caller, query.branchId);
    }
    const where = {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockInwardReceipt.findMany({
        where,
        include: RECEIPT_INCLUDE,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockInwardReceipt.count({ where }),
    ]);

    return new PaginatedResultDto(data, total, query.page, query.limit);
  }

  async findOne(caller: AuthenticatedUser, id: string) {
    const receipt = await this.prisma.stockInwardReceipt.findUnique({
      where: { id },
      include: RECEIPT_INCLUDE,
    });
    if (!receipt) {
      throw new NotFoundException();
    }
    assertTenantAccess(caller, receipt.tenantId);
    assertBranchAccess(caller, receipt.branchId);
    return receipt;
  }

  async addLine(caller: AuthenticatedUser, receiptId: string, dto: AddLineDto) {
    const receipt = await this.findOne(caller, receiptId);
    this.assertDraft(receipt.status);

    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId } });
    if (!variant || variant.tenantId !== receipt.tenantId) {
      throw new BadRequestException('Variant does not belong to this tenant');
    }

    return this.prisma.stockInwardLine.create({
      data: { receiptId, variantId: dto.variantId, expectedQty: dto.expectedQty },
    });
  }

  async updateLine(
    caller: AuthenticatedUser,
    receiptId: string,
    lineId: string,
    dto: UpdateLineDto,
  ) {
    const receipt = await this.findOne(caller, receiptId);
    this.assertDraft(receipt.status);

    const line = await this.prisma.stockInwardLine.findFirst({ where: { id: lineId, receiptId } });
    if (!line) {
      throw new NotFoundException('Line not found');
    }

    return this.prisma.stockInwardLine.update({
      where: { id: lineId },
      data: { expectedQty: dto.expectedQty },
    });
  }

  async confirm(caller: AuthenticatedUser, receiptId: string, dto: ConfirmReceiptDto) {
    const receipt = await this.findOne(caller, receiptId);
    this.assertDraft(receipt.status);

    if (receipt.lines.length === 0) {
      throw new BadRequestException('Cannot confirm a receipt with no lines');
    }

    const overrides = new Map((dto.lines ?? []).map((l) => [l.lineId, l.receivedQty]));

    for (const line of receipt.lines) {
      const receivedQty = overrides.get(line.id) ?? line.expectedQty;

      if (receivedQty > 0) {
        await this.inventoryService.stockIn(caller, {
          variantId: line.variantId,
          branchId: receipt.branchId,
          quantity: receivedQty,
          reference: `Stock inward ${receipt.referenceNumber}`,
          idempotencyKey: `inward:${receipt.id}:${line.id}`,
        });
      }

      await this.prisma.stockInwardLine.update({ where: { id: line.id }, data: { receivedQty } });
    }

    return this.prisma.stockInwardReceipt.update({
      where: { id: receiptId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
      include: RECEIPT_INCLUDE,
    });
  }

  private assertDraft(status: string): void {
    if (status !== 'DRAFT') {
      throw new BadRequestException('This receipt has already been confirmed');
    }
  }
}
