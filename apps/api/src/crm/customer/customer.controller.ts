import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MaskEntity } from '../../common/decorators/mask-entity.decorator';
import { AuditSensitiveQuery } from '../../common/decorators/audit-sensitive-query.decorator';
import { TagService } from '../../platform/tag/tag.service';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ArchiveCustomerDto } from './dto/archive-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { SetCustomerTagDto } from './dto/set-customer-tag.dto';

const CUSTOMER_ENTITY_TYPE = 'Customer';

@ApiTags('crm/customer')
@Controller('crm/customers')
@MaskEntity('Customer')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly tagService: TagService,
  ) {}

  @Get()
  @RequirePermission('crm.customer.view')
  @AuditSensitiveQuery()
  findAll(@Query() query: QueryCustomerDto) {
    return this.customerService.findMany(query);
  }

  // 客户分类标签(A-E)/客户类型标签(鹰派萌派等)走这几个接口，挂在crm.customer权限点下
  // 而不是platform.tag——打标签是"编辑这个客户档案"的日常操作，销售/店长都应该能做，
  // 不应该要求平台标签管理(platform.tag.*)那个更高的权限，标签目录本身怎么配置
  // （新增/改名/停用哪些分类可选项）才是platform.tag.*管的事，两者是不同的权限维度。
  // 注意路由顺序：这个静态路径必须排在下面的 ':id' 前面注册，否则 "tag-catalog" 会被
  // Nest当成 :id 参数匹配到 GET ':id' (findOne)去——两者都是单段路径，Nest路由匹配是
  // 按声明顺序的，先声明的静态/参数路由先命中。
  @Get('tag-catalog')
  @RequirePermission('crm.customer.view')
  tagCatalog(@Query('category') category: string) {
    return this.tagService.listByCategory(category);
  }

  // 以下三个是"新建/编辑客户"页面的选择器数据，同样必须排在 ':id' 前面。
  /** 员工下拉：电话销售员/门店销售员/抄送人。不要求 platform.account 权限，店员也能选。 */
  @Get('staff-options')
  @RequirePermission('crm.customer.view')
  staffOptions(@Query('keyword') keyword?: string, @Query('salesOnly') salesOnly?: string) {
    return this.customerService.staffOptions(keyword, salesOnly === '1');
  }

  /** 推荐人搜索：老客户 + 员工，支持姓名/手机号/拼音简拼。 */
  @Get('referrer-search')
  @RequirePermission('crm.customer.view')
  referrerSearch(@Query('keyword') keyword = '') {
    return this.customerService.searchReferrers(keyword);
  }

  /** "身份证号码验证"按钮：校验长度/出生日期/校验位，返回出生日期。 */
  @Get('id-card-check')
  @RequirePermission('crm.customer.view')
  idCardCheck(@Query('idCardNo') idCardNo = '') {
    return this.customerService.checkIdCard(idCardNo);
  }

  @Get(':id')
  @RequirePermission('crm.customer.view')
  @AuditSensitiveQuery()
  findOne(@Param('id') id: string) {
    return this.customerService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('crm.customer.create')
  create(@Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('crm.customer.update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    const { version, ...data } = dto;
    return this.customerService.update(id, data, version);
  }

  @Get(':id/delete-check')
  @RequirePermission('crm.customer.archive')
  deleteCheck(@Param('id') id: string) {
    return this.customerService.getDeleteCheck(id);
  }

  /** 删除建错的客户：有合同/入住/收款等的拒绝（只能归档）；有母婴档案/销售机会/跟进的要输入客户姓名确认。需要 crm.customer.delete。 */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('crm.customer.delete')
  remove(@Param('id') id: string, @Query('confirmName') confirmName?: string) {
    return this.customerService.remove(id, confirmName);
  }

  /** 归档客户：用过的客户不删，列表默认隐藏、不能再新建预订/合同，可恢复 */
  @Post(':id/archive')
  @HttpCode(204)
  @RequirePermission('crm.customer.archive')
  archive(@Param('id') id: string, @Body() dto: ArchiveCustomerDto) {
    return this.customerService.archive(id, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(204)
  @RequirePermission('crm.customer.archive')
  restore(@Param('id') id: string) {
    return this.customerService.restore(id);
  }

  @Get(':id/tags')
  @RequirePermission('crm.customer.view')
  listTags(@Param('id') id: string) {
    return this.tagService.listActiveBindings(CUSTOMER_ENTITY_TYPE, id);
  }

  @Get(':id/tags/history')
  @RequirePermission('crm.customer.view')
  listTagHistory(@Param('id') id: string, @Query('category') category?: string) {
    return this.tagService.listBindingHistory(CUSTOMER_ENTITY_TYPE, id, category);
  }

  @Post(':id/tags')
  @RequirePermission('crm.customer.update')
  setTag(@Param('id') id: string, @Body() dto: SetCustomerTagDto) {
    return this.tagService.setExclusiveTag(CUSTOMER_ENTITY_TYPE, id, dto.category, dto.tagId);
  }

  @Delete(':id/tags/:bindingId')
  @RequirePermission('crm.customer.update')
  unbindTag(@Param('bindingId') bindingId: string) {
    return this.tagService.unbind(bindingId);
  }
}
