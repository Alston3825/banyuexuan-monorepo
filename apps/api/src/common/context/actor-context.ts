/**
 * 显式传递的操作者上下文——WorkflowEngineService 等需要同时被 HTTP 请求
 * （有 RequestContextService）和 BullMQ 后台任务（无 HTTP 请求、无法解析
 * 请求级 provider）调用的服务，统一通过此接口接收上下文，而不直接依赖
 * REQUEST-scoped 的 RequestContextService，避免在队列消费者里解析请求作用域失败。
 */
export interface ActorContext {
  accountId?: string;
  tenantId?: string | null;
  storeId?: string | null;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export const SYSTEM_ACTOR: ActorContext = { accountId: 'SYSTEM' };
