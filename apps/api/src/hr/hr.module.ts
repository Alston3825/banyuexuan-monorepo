import { Module } from '@nestjs/common';
import { EmployeeProfileModule } from './employee-profile/employee-profile.module';
import { ShiftDefinitionModule } from './shift-definition/shift-definition.module';
import { ScheduleEntryModule } from './schedule-entry/schedule-entry.module';
import { CommissionRecordModule } from './commission-record/commission-record.module';
import { PayrollRecordModule } from './payroll-record/payroll-record.module';

@Module({
  imports: [EmployeeProfileModule, ShiftDefinitionModule, ScheduleEntryModule, CommissionRecordModule, PayrollRecordModule],
})
export class HrModule {}
