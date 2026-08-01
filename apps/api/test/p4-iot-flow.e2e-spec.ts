import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { Customer, Device, DeviceEvent, DeviceShadow, DeviceType, Room, RoomCall, RoomOccupancy, UtilityExpense } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P4遗留补齐：IoT设备网关端到端集成测试。用HTTP接口模拟真实MQTT网关的"设备上报"，
 * 验证"上报→业务记录自动生成"链路：呼叫/客房服务(CALL_SERVICE -> RoomCall)、
 * 能耗计量(UTILITY_METER -> UtilityExpense按门店+月份+费用类型覆盖登记)。
 * 其余类别（本测试用体征监测代表）只留痕不做业务转换。另外验证 Device Shadow
 * 期望态/上报态两步同步机制，以及设备类型(总部主数据)/设备台账(店长可管理)的权限边界。
 * 见业务规则确认记录"P4遗留IoT设备网关框架补齐"。
 */
describe('P4遗留 IoT设备网关 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  /** 能耗计量事件按"门店+月份+费用类型"覆盖登记，用运行时刻派生一个几乎不会跨次冲突的 YYYY-MM。 */
  function derivePeriod(offsetMonths: number): string {
    const totalMonths = 40 + (Number(runTag) % 40);
    const date = new Date(2031, totalMonths + offsetMonths, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  let adminToken: string;
  let storeManagerToken: string;
  let otherStoreManagerToken: string; // test_user，绑定另一门店，用于验证跨店越权已修复
  let storeId: string;
  let otherStoreId: string;
  let customerId: string;
  let roomAId: string; // 有在住占用（CHECKED_IN），呼叫事件应能成功转换
  let roomBId: string; // 占用记录仍是 RESERVED（未入住），呼叫事件应转换失败但事件仍留痕
  let otherStoreCallDeviceId: string; // 另一门店的呼叫设备，用于验证跨店房间注入已被拦截

  let callDeviceTypeId: string;
  let utilityDeviceTypeId: string;
  let vitalDeviceTypeId: string;
  let callDeviceId: string;
  let noOccupancyCallDeviceId: string;
  let utilityDeviceId: string;
  let vitalDeviceId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const adminLogin = await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: SEED_PASSWORD }).expect(201);
    adminToken = body<LoginResponse>(adminLogin).accessToken;
    const storeManagerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'store_manager', password: SEED_PASSWORD })
      .expect(201);
    storeManagerToken = body<LoginResponse>(storeManagerLogin).accessToken;
    const otherLogin = await request(server).post('/api/v1/auth/login').send({ username: 'test_user', password: SEED_PASSWORD }).expect(201);
    otherStoreManagerToken = body<LoginResponse>(otherLogin).accessToken;

    const stores = await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200);
    storeId = body<{ id: string }[]>(stores)[0].id;
    // test_user 的门店范围来自角色的门店级授权(AccountRoleAssignment.scopeId)，不是 Account.storeId
    // （该账号是HQ级测试账号，homeStore为空，只靠角色授权限定在另一门店）。
    const accounts = body<{ id: string; username: string }[]>(await request(server).get('/api/v1/platform/accounts').set(authed(adminToken)).expect(200));
    const testUserId = accounts.find((a) => a.username === 'test_user')!.id;
    const testUserDetail = body<{ roleAssignments: { scopeType: string; scopeId: string | null }[] }>(
      await request(server).get(`/api/v1/platform/accounts/${testUserId}`).set(authed(adminToken)).expect(200),
    );
    otherStoreId = testUserDetail.roleAssignments.find((a) => a.scopeType === 'STORE')!.scopeId!;

    const createdCustomer = await request(server)
      .post('/api/v1/crm/customers')
      .set(authed(adminToken))
      .send({ name: 'E2E IoT测试客户', phone: `139${runTag}`, source: 'ONLINE_AD' })
      .expect(201);
    customerId = body<Customer>(createdCustomer).id;

    const roomTypes = await request(server).get('/api/v1/room/types').set(authed(adminToken)).expect(200);
    let roomTypeId = body<{ id: string }[]>(roomTypes)[0]?.id;
    if (!roomTypeId) {
      const createdType = await request(server)
        .post('/api/v1/room/types')
        .set(authed(adminToken))
        .send({ code: `E2E-IOT-${runTag}`, name: 'E2E IoT测试房型' })
        .expect(201);
      roomTypeId = body<{ id: string }>(createdType).id;
    }

    const roomA = await request(server)
      .post('/api/v1/room/rooms')
      .set(authed(adminToken))
      .send({ storeId, roomTypeId, roomNo: `IOT-A-${runTag}`, floor: '1F' })
      .expect(201);
    roomAId = body<Room>(roomA).id;

    const roomB = await request(server)
      .post('/api/v1/room/rooms')
      .set(authed(adminToken))
      .send({ storeId, roomTypeId, roomNo: `IOT-B-${runTag}`, floor: '1F' })
      .expect(201);
    roomBId = body<Room>(roomB).id;

    const occupancyA = await request(server)
      .post('/api/v1/room/occupancies')
      .set(authed(adminToken))
      .send({ roomId: roomAId, storeId, customerId, plannedCheckIn: '2031-01-01T00:00:00.000Z', plannedCheckOut: '2031-02-12T00:00:00.000Z' })
      .expect(201);
    const occupancyAId = body<RoomOccupancy>(occupancyA).id;
    await request(server)
      .post(`/api/v1/room/occupancies/${occupancyAId}/check-in`)
      .set(authed(adminToken))
      .send({ version: 0 })
      .expect(201);

    // roomB 只有预订记录，不入住，验证呼叫事件转换失败但事件本身仍会留痕
    await request(server)
      .post('/api/v1/room/occupancies')
      .set(authed(adminToken))
      .send({ roomId: roomBId, storeId, customerId, plannedCheckIn: '2031-03-01T00:00:00.000Z', plannedCheckOut: '2031-04-12T00:00:00.000Z' })
      .expect(201);

    const callType = await request(server)
      .post('/api/v1/iot/device-types')
      .set(authed(adminToken))
      .send({ category: 'CALL_SERVICE', name: `呼叫器-${runTag}`, protocol: 'MQTT' })
      .expect(201);
    callDeviceTypeId = body<DeviceType>(callType).id;

    const utilityType = await request(server)
      .post('/api/v1/iot/device-types')
      .set(authed(adminToken))
      .send({ category: 'UTILITY_METER', name: `智能电表-${runTag}`, protocol: 'MQTT / RS485 转网关' })
      .expect(201);
    utilityDeviceTypeId = body<DeviceType>(utilityType).id;

    const vitalType = await request(server)
      .post('/api/v1/iot/device-types')
      .set(authed(adminToken))
      .send({ category: 'VITAL_SIGN', name: `智能手环-${runTag}`, protocol: 'MQTT / BLE 网关上报' })
      .expect(201);
    vitalDeviceTypeId = body<DeviceType>(vitalType).id;

    const callDevice = await request(server)
      .post('/api/v1/iot/devices')
      .set(authed(storeManagerToken))
      .send({ storeId, deviceTypeId: callDeviceTypeId, code: `CALL-A-${runTag}`, name: 'A房呼叫器', roomId: roomAId })
      .expect(201);
    callDeviceId = body<Device>(callDevice).id;

    const noOccupancyCallDevice = await request(server)
      .post('/api/v1/iot/devices')
      .set(authed(storeManagerToken))
      .send({ storeId, deviceTypeId: callDeviceTypeId, code: `CALL-B-${runTag}`, name: 'B房呼叫器', roomId: roomBId })
      .expect(201);
    noOccupancyCallDeviceId = body<Device>(noOccupancyCallDevice).id;

    const utilityDevice = await request(server)
      .post('/api/v1/iot/devices')
      .set(authed(storeManagerToken))
      .send({ storeId, deviceTypeId: utilityDeviceTypeId, code: `METER-${runTag}`, name: '总电表' })
      .expect(201);
    utilityDeviceId = body<Device>(utilityDevice).id;

    const vitalDevice = await request(server)
      .post('/api/v1/iot/devices')
      .set(authed(storeManagerToken))
      .send({ storeId, deviceTypeId: vitalDeviceTypeId, code: `BAND-${runTag}`, name: '妈妈体征手环', roomId: roomAId })
      .expect(201);
    vitalDeviceId = body<Device>(vitalDevice).id;

    // 另一门店(test_user)自己的呼叫设备，用于验证"跨店房间注入"越权是否已被拦截
    const otherStoreCallDevice = await request(server)
      .post('/api/v1/iot/devices')
      .set(authed(otherStoreManagerToken))
      .send({ storeId: otherStoreId, deviceTypeId: callDeviceTypeId, code: `OTHER-CALL-${runTag}`, name: '异店呼叫器' })
      .expect(201);
    otherStoreCallDeviceId = body<Device>(otherStoreCallDevice).id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 权限边界 ====================

  it('1. 设备类型是总部主数据：店长可查看（登记设备台账时需要选择类型，同 logistics.vehicle 口径）但无权限新建', async () => {
    await request(server).get('/api/v1/iot/device-types').set(authed(storeManagerToken)).expect(200);
    await request(server)
      .post('/api/v1/iot/device-types')
      .set(authed(storeManagerToken))
      .send({ category: 'PRINTING', name: '不应创建成功', protocol: 'LAN' })
      .expect(403);
  });

  it('2. 设备台账是门店资产：店长可自行管理（同 room.room/warehouse 口径）', async () => {
    await request(server).get('/api/v1/iot/devices').set(authed(storeManagerToken)).expect(200);
    const found = body<Device[]>(await request(server).get('/api/v1/iot/devices').set(authed(storeManagerToken)).expect(200)).find((d) => d.id === callDeviceId);
    expect(found?.status).toBe('OFFLINE'); // 尚未上报过事件
  });

  // ==================== 呼叫/客房服务 → RoomCall ====================

  it('3. 模拟呼叫事件上报：房间有在住占用，自动生成 RoomCall，设备转为 ONLINE', async () => {
    const reported = await request(server)
      .post('/api/v1/iot/gateway/events')
      .set(authed(storeManagerToken))
      .send({ deviceId: callDeviceId, eventType: 'CALL_TRIGGER', payload: { roomId: roomAId, reason: '需要热水（设备模拟）' } })
      .expect(201);
    const event = body<DeviceEvent>(reported);
    expect(event.businessRefType).toBe('RoomCall');
    expect(event.businessRefId).toBeTruthy();
    expect(event.processingError).toBeNull();

    const calls = body<RoomCall[]>(await request(server).get('/api/v1/room/calls').set(authed(adminToken)).query({ storeId }).expect(200));
    const generated = calls.find((c) => c.id === event.businessRefId);
    expect(generated).toBeTruthy();
    expect(generated?.reason).toBe('需要热水（设备模拟）');

    const devices = body<Device[]>(await request(server).get('/api/v1/iot/devices').set(authed(storeManagerToken)).expect(200));
    expect(devices.find((d) => d.id === callDeviceId)?.status).toBe('ONLINE');
  });

  it('4. 模拟呼叫事件上报：房间没有在住占用记录时，事件仍留痕但转换失败并记录原因', async () => {
    const reported = await request(server)
      .post('/api/v1/iot/gateway/events')
      .set(authed(storeManagerToken))
      .send({ deviceId: noOccupancyCallDeviceId, eventType: 'CALL_TRIGGER', payload: { roomId: roomBId } })
      .expect(201);
    const event = body<DeviceEvent>(reported);
    expect(event.businessRefType).toBeNull();
    expect(event.processingError).toContain('没有在住占用记录');
  });

  // ==================== 能耗计量 → UtilityExpense ====================

  it('5. 模拟能耗计量事件上报：首次生成登记，再次上报按同一期间覆盖更新而非新增', async () => {
    const period = derivePeriod(0);
    const first = await request(server)
      .post('/api/v1/iot/gateway/events')
      .set(authed(storeManagerToken))
      .send({ deviceId: utilityDeviceId, eventType: 'METER_READING', payload: { period, expenseType: 'ELECTRICITY', amount: 100000 } })
      .expect(201);
    const firstEvent = body<DeviceEvent>(first);
    expect(firstEvent.businessRefType).toBe('UtilityExpense');

    const second = await request(server)
      .post('/api/v1/iot/gateway/events')
      .set(authed(storeManagerToken))
      .send({ deviceId: utilityDeviceId, eventType: 'METER_READING', payload: { period, expenseType: 'ELECTRICITY', amount: 156000 } })
      .expect(201);
    const secondEvent = body<DeviceEvent>(second);
    expect(secondEvent.businessRefId).toBe(firstEvent.businessRefId); // 同一条记录被覆盖更新

    const expenses = body<UtilityExpense[]>(
      await request(server).get('/api/v1/logistics/utility-expenses').set(authed(adminToken)).query({ storeId, period }).expect(200),
    );
    const matched = expenses.filter((e) => e.expenseType === 'ELECTRICITY');
    expect(matched.length).toBe(1); // 未产生第二条记录
    expect(matched[0].amount).toBe(156000); // 金额已被最新一次上报覆盖
  });

  // ==================== 其余类别：只留痕，不做业务转换 ====================

  it('6. 体征监测等本轮未接入业务转换的类别：事件正常留痕，businessRefType 为空', async () => {
    const reported = await request(server)
      .post('/api/v1/iot/gateway/events')
      .set(authed(storeManagerToken))
      .send({ deviceId: vitalDeviceId, eventType: 'TEMPERATURE_READING', payload: { celsius: 36.8 } })
      .expect(201);
    const event = body<DeviceEvent>(reported);
    expect(event.businessRefType).toBeNull();
    expect(event.processingError).toBeNull();
    expect(event.processedAt).toBeTruthy();
  });

  // ==================== Device Shadow：期望态/上报态两步同步 ====================

  it('7. 下发指令写入期望态，设备确认前上报态不变；确认后两态同步', async () => {
    const before = body<DeviceShadow>(await request(server).get(`/api/v1/iot/gateway/devices/${vitalDeviceId}/shadow`).set(authed(storeManagerToken)).expect(200));
    expect(before.desiredVersion).toBe(0);

    const issued = body<DeviceShadow>(
      await request(server)
        .post(`/api/v1/iot/gateway/devices/${vitalDeviceId}/commands`)
        .set(authed(storeManagerToken))
        .send({ desiredState: { samplingIntervalSeconds: 60 } })
        .expect(201),
    );
    expect(issued.desiredVersion).toBe(1);
    expect(issued.reportedVersion).toBe(0); // 设备尚未确认，上报态不应变化

    const confirmed = body<DeviceShadow>(
      await request(server).post(`/api/v1/iot/gateway/devices/${vitalDeviceId}/commands/confirm`).set(authed(storeManagerToken)).send({}).expect(201),
    );
    expect(confirmed.reportedVersion).toBe(1);
    expect(confirmed.reportedState).toEqual({ samplingIntervalSeconds: 60 });

    await request(server).post(`/api/v1/iot/gateway/devices/${vitalDeviceId}/commands/confirm`).set(authed(storeManagerToken)).send({}).expect(400);
  });

  it('8. 事件日志查询：可按设备过滤', async () => {
    const events = body<DeviceEvent[]>(
      await request(server).get('/api/v1/iot/gateway/events').set(authed(storeManagerToken)).query({ deviceId: callDeviceId }).expect(200),
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.deviceId === callDeviceId)).toBe(true);
  });

  // ==================== 安全回归：跨门店越权（安全审查发现，已修复） ====================

  it('9. 设备台账列表不再泄露其他门店：不传storeId时只看到自己门店的设备，显式查询他店storeId会被拒绝', async () => {
    const ownList = body<Device[]>(await request(server).get('/api/v1/iot/devices').set(authed(otherStoreManagerToken)).expect(200));
    expect(ownList.every((d) => d.id !== callDeviceId)).toBe(true); // 看不到 storeId(示例店) 的设备
    expect(ownList.some((d) => d.id === otherStoreCallDeviceId)).toBe(true); // 能看到自己门店的设备

    await request(server).get('/api/v1/iot/devices').set(authed(otherStoreManagerToken)).query({ storeId }).expect(403);
  });

  it('10. 跨门店不能查看/下发指令到他店设备的 Shadow', async () => {
    await request(server).get(`/api/v1/iot/gateway/devices/${vitalDeviceId}/shadow`).set(authed(otherStoreManagerToken)).expect(403);
    await request(server)
      .post(`/api/v1/iot/gateway/devices/${vitalDeviceId}/commands`)
      .set(authed(otherStoreManagerToken))
      .send({ desiredState: { hacked: true } })
      .expect(403);
  });

  it('11. 跨门店呼叫事件注入已被拦截：异店设备引用示例店房间不再生成 RoomCall', async () => {
    const reported = await request(server)
      .post('/api/v1/iot/gateway/events')
      .set(authed(otherStoreManagerToken))
      .send({ deviceId: otherStoreCallDeviceId, eventType: 'CALL_TRIGGER', payload: { roomId: roomAId, reason: '跨店伪造呼叫' } })
      .expect(201);
    const event = body<DeviceEvent>(reported);
    expect(event.businessRefType).toBeNull(); // 未生成 RoomCall
    expect(event.processingError).toContain('没有在住占用记录'); // 因为按device.storeId限定后查不到该房间
  });
});
