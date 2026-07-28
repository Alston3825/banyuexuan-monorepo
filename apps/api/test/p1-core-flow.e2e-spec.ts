import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  Contract,
  Customer,
  Lead,
  Payment,
  Room,
  RoomOccupancy,
  SalesOpportunity,
  WorkflowInstance,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import type { PaymentContractSummary } from '../src/payment/payment-record/payment-record.service';

/**
 * P1 核心交易主线端到端集成测试：线索 -> 分配 -> 跟进 -> 转化建档 -> 销售机会
 * -> 合同签约(签署->提交->两级审批) -> 收款(含退款审批) -> 房间预订(预订->入住->离店) -> 续签。
 *
 * 对应《软件项目开发计划》P1 退出标准：
 *   1) 新线索到入住的完整闭环可跑通；
 *   2) 合同、收款、占房三方数据一致；
 *   3) 关键状态机（合同/房态/收款）稳定运行。
 *
 * 说明：直接连本地开发数据库（apps/api/.env 的 DATABASE_URL），不做测试库隔离——
 * 与本项目"产品负责人 + AI Agent"小规模协同开发的现实相符（见开发计划 0.1 节）。
 * 所有测试数据使用运行时时间戳生成唯一编号，不与既有种子/演示数据冲突，也不做清理
 * （保留在库里便于失败时人工排查，与 seed 数据一样是"可随时重置的开发库"的一部分）。
 */
describe('P1 核心交易主线 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23'; // 与 prisma/seed.ts 的 SEED_PASSWORD 默认值一致
  const runTag = Date.now().toString().slice(-8);
  const testPhone = `138${runTag}`;

  let adminToken: string;
  let adminAccountId: string;
  let storeManagerToken: string;
  let otherStoreManagerToken: string;
  let storeId: string;
  let roomId: string;

  let leadId: string;
  let leadVersion: number;
  let customerId: string;
  let opportunityId: string;
  let contractId: string;
  let contractVersion: number;
  let paymentId: string;
  let occupancyId: string;
  let renewedContractId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  /** supertest 的 res.body 类型是 any，这里统一收口做一次断言转换，避免每处调用都触发 eslint 的 no-unsafe-* 规则。 */
  function body<T>(res: request.Response): T {
    return res.body as T;
  }

  interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    account: { id: string; username: string; realName: string };
  }

  interface ConvertLeadResponse {
    lead: Lead;
    customer: Customer;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();

    const adminLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: SEED_PASSWORD })
      .expect(201);
    adminToken = body<LoginResponse>(adminLogin).accessToken;
    adminAccountId = body<LoginResponse>(adminLogin).account.id;

    const storeManagerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'store_manager', password: SEED_PASSWORD })
      .expect(201);
    storeManagerToken = body<LoginResponse>(storeManagerLogin).accessToken;

    // 现有种子数据里 test_user 账号也持有 STORE_MANAGER 角色（另一门店）。角色型审批人当前按
    // 角色全局解析、不按业务单据所属门店过滤（见 WorkflowEngineService.resolveApprovers），
    // 所以同角色的每个账号都会拿到待审批任务，需要全部批准节点才能推进——如实反映现状，
    // 而非测试脚本的问题；这一点已作为发现记录在 docs/业务规则确认记录.md。
    const otherStoreManagerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'test_user', password: SEED_PASSWORD })
      .expect(201);
    otherStoreManagerToken = body<LoginResponse>(
      otherStoreManagerLogin,
    ).accessToken;

    const stores = await request(server)
      .get('/api/v1/platform/stores')
      .set(authed(adminToken))
      .expect(200);
    storeId = body<{ id: string }[]>(stores)[0].id;

    const roomTypes = await request(server)
      .get('/api/v1/room/types')
      .set(authed(adminToken))
      .expect(200);
    let roomTypeId = body<{ id: string }[]>(roomTypes)[0]?.id;
    if (!roomTypeId) {
      const createdType = await request(server)
        .post('/api/v1/room/types')
        .set(authed(adminToken))
        .send({ code: `E2E-${runTag}`, name: 'E2E 测试房型' })
        .expect(201);
      roomTypeId = body<{ id: string }>(createdType).id;
    }

    // 用独立新建的房间跑本测试，避免和既有演示数据的占用记录产生日期冲突。
    const createdRoom = await request(server)
      .post('/api/v1/room/rooms')
      .set(authed(adminToken))
      .send({ storeId, roomTypeId, roomNo: `E2E-${runTag}`, floor: '9F' })
      .expect(201);
    roomId = body<Room>(createdRoom).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 创建线索：状态为 NEW', async () => {
    const res = await request(server)
      .post('/api/v1/crm/leads')
      .set(authed(adminToken))
      .send({
        name: 'E2E测试客户',
        phone: testPhone,
        source: 'ONLINE_AD',
        storeId,
        remark: '端到端测试线索',
      })
      .expect(201);
    expect(body<Lead>(res).status).toBe('NEW');
    leadId = body<Lead>(res).id;
    leadVersion = body<Lead>(res).version;
  });

  it('2. 分配线索：首次分配后状态推进为 ASSIGNED', async () => {
    const res = await request(server)
      .post(`/api/v1/crm/leads/${leadId}/assign`)
      .set(authed(adminToken))
      .send({ assignedToId: adminAccountId, version: leadVersion })
      .expect(201);
    expect(body<Lead>(res).status).toBe('ASSIGNED');
    expect(body<Lead>(res).assignedToId).toBe(adminAccountId);
    leadVersion = body<Lead>(res).version;
  });

  it('3. 添加跟进记录：线索联动推进为 FOLLOWING', async () => {
    await request(server)
      .post('/api/v1/crm/follow-ups')
      .set(authed(adminToken))
      .send({
        businessType: 'LEAD',
        businessId: leadId,
        type: 'PHONE_CALL',
        content: '电话沟通，客户对月子套餐有明确意向',
      })
      .expect(201);

    const lead = await request(server)
      .get(`/api/v1/crm/leads/${leadId}`)
      .set(authed(adminToken))
      .expect(200);
    expect(body<Lead>(lead).status).toBe('FOLLOWING');
    leadVersion = body<Lead>(lead).version;
  });

  it('4. 转化建档：生成客户，线索状态变为 CONVERTED', async () => {
    const res = await request(server)
      .post(`/api/v1/crm/leads/${leadId}/convert`)
      .set(authed(adminToken))
      .send({ version: leadVersion })
      .expect(201);
    // LeadService.convert() 返回 { lead, customer } 组合结构，见 lead.service.ts。
    expect(body<ConvertLeadResponse>(res).lead.status).toBe('CONVERTED');
    customerId = body<ConvertLeadResponse>(res).customer.id;
    expect(customerId).toBeTruthy();

    const customer = await request(server)
      .get(`/api/v1/crm/customers/${customerId}`)
      .set(authed(adminToken))
      .expect(200);
    expect(body<Customer>(customer).phone).toBe(testPhone);
  });

  it('5. 创建销售机会并推进到 WON', async () => {
    const created = await request(server)
      .post('/api/v1/crm/opportunities')
      .set(authed(adminToken))
      .send({ customerId, leadId, amount: 8000000, remark: '月子套餐42天' })
      .expect(201);
    expect(body<SalesOpportunity>(created).stage).toBe('FOLLOWING');
    opportunityId = body<SalesOpportunity>(created).id;

    const quoted = await request(server)
      .post(`/api/v1/crm/opportunities/${opportunityId}/advance-stage`)
      .set(authed(adminToken))
      .send({
        targetStage: 'QUOTED',
        version: body<SalesOpportunity>(created).version,
      })
      .expect(201);
    expect(body<SalesOpportunity>(quoted).stage).toBe('QUOTED');

    const won = await request(server)
      .post(`/api/v1/crm/opportunities/${opportunityId}/advance-stage`)
      .set(authed(adminToken))
      .send({
        targetStage: 'WON',
        version: body<SalesOpportunity>(quoted).version,
      })
      .expect(201);
    expect(body<SalesOpportunity>(won).stage).toBe('WON');
  });

  it('6. 创建合同（DRAFT）', async () => {
    const res = await request(server)
      .post('/api/v1/contract/records')
      .set(authed(adminToken))
      .send({
        customerId,
        opportunityId,
        storeId,
        title: 'E2E测试-月子套餐合同',
        content:
          '甲方：E2E测试客户；乙方：伴月轩·示例店；套餐：温馨复式房42天。',
        amount: 8000000,
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2027-02-12T00:00:00.000Z',
      })
      .expect(201);
    expect(body<Contract>(res).status).toBe('DRAFT');
    contractId = body<Contract>(res).id;
    contractVersion = body<Contract>(res).version;
  });

  it('7. 客户签署合同后正文锁定，未签署前不允许提交审核', async () => {
    await request(server)
      .post(`/api/v1/contract/records/${contractId}/submit`)
      .set(authed(adminToken))
      .send({ version: contractVersion })
      .expect(400);

    const signed = await request(server)
      .post(`/api/v1/contract/records/${contractId}/sign`)
      .set(authed(adminToken))
      .send({ version: contractVersion })
      .expect(201);
    expect(body<Contract>(signed).signedByCustomerAt).toBeTruthy();
    contractVersion = body<Contract>(signed).version;
  });

  it('8. 提交签约审核：合同进入 PENDING_APPROVAL，生成审批实例', async () => {
    const res = await request(server)
      .post(`/api/v1/contract/records/${contractId}/submit`)
      .set(authed(adminToken))
      .send({ version: contractVersion })
      .expect(201);
    expect(body<Contract>(res).status).toBe('PENDING_APPROVAL');
    contractVersion = body<Contract>(res).version;
  });

  it('9. 两级审批（店长初审 -> 平台管理员终审）通过后，合同懒同步为 ACTIVE', async () => {
    const instance = await request(server)
      .get('/api/v1/workflow/instances')
      .query({ businessType: 'CONTRACT', businessId: contractId })
      .set(authed(adminToken))
      .expect(200);
    expect(body<WorkflowInstance>(instance).status).toBe('IN_REVIEW');
    expect(body<WorkflowInstance>(instance).currentNodeSeq).toBe(1);
    const instanceId = body<WorkflowInstance>(instance).id;

    // 第一级：店长初审。admin 此时不是该节点待审批人，应被拒绝。
    await request(server)
      .post(`/api/v1/workflow/instances/${instanceId}/approve`)
      .set(authed(adminToken))
      .send({})
      .expect(403);

    await request(server)
      .post(`/api/v1/workflow/instances/${instanceId}/approve`)
      .set(authed(storeManagerToken))
      .send({ comment: '店长初审通过' })
      .expect(201);
    // 同角色的另一账号（另一门店店长）也是待审批人，需一并批准节点才会推进到下一级。
    await request(server)
      .post(`/api/v1/workflow/instances/${instanceId}/approve`)
      .set(authed(otherStoreManagerToken))
      .send({ comment: '（另一门店店长）一并批准' })
      .expect(201);

    // 第二级：平台管理员终审。
    const approved = await request(server)
      .post(`/api/v1/workflow/instances/${instanceId}/approve`)
      .set(authed(adminToken))
      .send({ comment: '终审通过' })
      .expect(201);
    expect(body<WorkflowInstance>(approved).status).toBe('APPROVED');

    const contract = await request(server)
      .get(`/api/v1/contract/records/${contractId}`)
      .set(authed(adminToken))
      .expect(200);
    expect(body<Contract>(contract).status).toBe('ACTIVE');
    contractVersion = body<Contract>(contract).version;
  });

  it('10. 登记收款：合同收款汇总（已收/余额）计算正确', async () => {
    const payment = await request(server)
      .post('/api/v1/payment/records')
      .set(authed(adminToken))
      .send({
        contractId,
        customerId,
        storeId,
        amount: 3000000,
        method: 'WECHAT',
        remark: '定金',
      })
      .expect(201);
    expect(body<Payment>(payment).status).toBe('RECORDED');
    paymentId = body<Payment>(payment).id;

    const summary = await request(server)
      .get('/api/v1/payment/records/summary')
      .query({ contractId })
      .set(authed(adminToken))
      .expect(200);
    expect(body<PaymentContractSummary>(summary).contractAmount).toBe(8000000);
    expect(body<PaymentContractSummary>(summary).totalCollected).toBe(3000000);
    expect(body<PaymentContractSummary>(summary).balance).toBe(5000000);
  });

  it('11. 退款申请经店长审批通过后，收款状态变为 REFUNDED，合同余额恢复', async () => {
    const requested = await request(server)
      .post(`/api/v1/payment/records/${paymentId}/refund`)
      .set(authed(adminToken))
      .send({ refundReason: '客户要求取消部分服务', version: 0 })
      .expect(201);
    expect(body<Payment>(requested).status).toBe('PENDING_REFUND');

    const instance = await request(server)
      .get('/api/v1/workflow/instances')
      .query({ businessType: 'PAYMENT', businessId: paymentId })
      .set(authed(adminToken))
      .expect(200);
    const instanceId = body<WorkflowInstance>(instance).id;

    await request(server)
      .post(`/api/v1/workflow/instances/${instanceId}/approve`)
      .set(authed(storeManagerToken))
      .send({ comment: '同意退款' })
      .expect(201);
    // 同角色的另一账号也是待审批人，一并批准该唯一节点后审批实例才会终态 APPROVED。
    await request(server)
      .post(`/api/v1/workflow/instances/${instanceId}/approve`)
      .set(authed(otherStoreManagerToken))
      .send({ comment: '（另一门店店长）一并批准' })
      .expect(201);

    const payment = await request(server)
      .get(`/api/v1/payment/records/${paymentId}`)
      .set(authed(adminToken))
      .expect(200);
    expect(body<Payment>(payment).status).toBe('REFUNDED');

    const summary = await request(server)
      .get('/api/v1/payment/records/summary')
      .query({ contractId })
      .set(authed(adminToken))
      .expect(200);
    expect(body<PaymentContractSummary>(summary).totalCollected).toBe(0);
    expect(body<PaymentContractSummary>(summary).totalRefunded).toBe(3000000);
    expect(body<PaymentContractSummary>(summary).balance).toBe(8000000);

    // 补收全款，验证再次收款后余额归零，为后续"入住"提供已收清的合同状态。
    const fullPayment = await request(server)
      .post('/api/v1/payment/records')
      .set(authed(adminToken))
      .send({
        contractId,
        customerId,
        storeId,
        amount: 8000000,
        method: 'BANK_TRANSFER',
        remark: '全款',
      })
      .expect(201);
    expect(body<Payment>(fullPayment).status).toBe('RECORDED');
  });

  it('12. 预订房间（RESERVED）', async () => {
    const res = await request(server)
      .post('/api/v1/room/occupancies')
      .set(authed(adminToken))
      .send({
        roomId,
        storeId,
        customerId,
        contractId,
        plannedCheckIn: '2027-01-01T00:00:00.000Z',
        plannedCheckOut: '2027-02-12T00:00:00.000Z',
      })
      .expect(201);
    expect(body<RoomOccupancy>(res).status).toBe('RESERVED');
    occupancyId = body<RoomOccupancy>(res).id;
  });

  it('13. 入住（CHECKED_IN）', async () => {
    const res = await request(server)
      .post(`/api/v1/room/occupancies/${occupancyId}/check-in`)
      .set(authed(adminToken))
      .send({ version: 0 })
      .expect(201);
    expect(body<RoomOccupancy>(res).status).toBe('CHECKED_IN');
    expect(body<RoomOccupancy>(res).actualCheckInAt).toBeTruthy();
  });

  it('14. 离店（CHECKED_OUT），房间置为待清扫', async () => {
    const res = await request(server)
      .post(`/api/v1/room/occupancies/${occupancyId}/check-out`)
      .set(authed(adminToken))
      .send({ version: 1 })
      .expect(201);
    expect(body<RoomOccupancy>(res).status).toBe('CHECKED_OUT');
    expect(body<RoomOccupancy>(res).actualCheckOutAt).toBeTruthy();

    const room = await request(server)
      .get(`/api/v1/room/rooms/${roomId}`)
      .set(authed(adminToken))
      .expect(200);
    expect(body<Room>(room).needsCleaning).toBe(true);
  });

  it('15. 合同续签：生成新的 DRAFT 合同并关联回原合同，续签查询可检索到', async () => {
    const res = await request(server)
      .post(`/api/v1/contract/records/${contractId}/renew`)
      .set(authed(adminToken))
      .send({
        startDate: '2027-02-12T00:00:00.000Z',
        endDate: '2027-02-26T00:00:00.000Z',
        amount: 2000000,
        version: contractVersion,
      })
      .expect(201);
    expect(body<Contract>(res).status).toBe('DRAFT');
    expect(body<Contract>(res).renewalOfContractId).toBe(contractId);
    renewedContractId = body<Contract>(res).id;

    const renewals = await request(server)
      .get('/api/v1/contract/records')
      .query({ isRenewal: true, customerId })
      .set(authed(adminToken))
      .expect(200);
    expect(
      body<Contract[]>(renewals).some((c) => c.id === renewedContractId),
    ).toBe(true);

    const byOriginal = await request(server)
      .get('/api/v1/contract/records')
      .query({ renewalOfContractId: contractId })
      .set(authed(adminToken))
      .expect(200);
    expect(body<Contract[]>(byOriginal).map((c) => c.id)).toEqual([
      renewedContractId,
    ]);
  });

  it('16. 三方数据一致性核对：合同 ACTIVE、收款余额归零、占房 CHECKED_OUT 均指向同一客户/合同', async () => {
    const [contractRes, paymentsRes, occupancyRes] = await Promise.all([
      request(server)
        .get(`/api/v1/contract/records/${contractId}`)
        .set(authed(adminToken))
        .expect(200),
      request(server)
        .get('/api/v1/payment/records')
        .query({ contractId })
        .set(authed(adminToken))
        .expect(200),
      request(server)
        .get(`/api/v1/room/occupancies/${occupancyId}`)
        .set(authed(adminToken))
        .expect(200),
    ]);
    const contract = body<Contract>(contractRes);
    const payments = body<Payment[]>(paymentsRes);
    const occupancy = body<RoomOccupancy>(occupancyRes);

    expect(contract.status).toBe('ACTIVE');
    expect(occupancy.status).toBe('CHECKED_OUT');
    expect(occupancy.contractId).toBe(contractId);
    expect(occupancy.customerId).toBe(customerId);

    const recordedTotal = payments
      .filter((p) => p.status === 'RECORDED')
      .reduce((sum, p) => sum + p.amount, 0);
    expect(recordedTotal).toBe(contract.amount);
  });
});
