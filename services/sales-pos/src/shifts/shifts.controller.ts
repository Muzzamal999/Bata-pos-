import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { RecordCashMovementDto } from './dto/cash-movement.dto';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @RequirePermissions(PERMISSIONS.SHIFTS_OPEN)
  @Post()
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenShiftDto) {
    return this.shifts.open(user, dto);
  }

  @RequirePermissions(PERMISSIONS.SHIFTS_READ)
  @Get('current')
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.shifts.findCurrent(user);
  }

  @RequirePermissions(PERMISSIONS.SHIFTS_READ)
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.findOne(user, id);
  }

  @RequirePermissions(PERMISSIONS.SHIFTS_CLOSE)
  @Post(':id/close')
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseShiftDto,
  ) {
    return this.shifts.close(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.SHIFTS_OPEN)
  @Post(':id/cash-movements')
  recordCashMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCashMovementDto,
  ) {
    return this.shifts.recordCashMovement(user, id, dto);
  }
}
