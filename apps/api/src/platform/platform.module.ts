import { Module } from '@nestjs/common';
import { RegionModule } from './region/region.module';
import { StoreModule } from './store/store.module';
import { DepartmentModule } from './department/department.module';
import { TeamModule } from './team/team.module';
import { PositionModule } from './position/position.module';
import { AccountModule } from './account/account.module';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';
import { ApplicationModule } from './application/application.module';
import { TagModule } from './tag/tag.module';
import { ParameterModule } from './parameter/parameter.module';

@Module({
  imports: [
    RegionModule,
    StoreModule,
    DepartmentModule,
    TeamModule,
    PositionModule,
    AccountModule,
    RoleModule,
    PermissionModule,
    ApplicationModule,
    TagModule,
    ParameterModule,
  ],
})
export class PlatformModule {}
