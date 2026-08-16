import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * 乐观锁更新的统一收口。项目里"先 findOneOrThrow 读出 before，内存里比较
 * before.version !== expectedVersion，再 delegate.update({ where: { id }, ... })"这个
 * 一直沿用的模式，校验和落库之间存在并发窗口：两个并发请求都读到同一份旧数据、都通过
 * 内存校验后，后到达数据库的那次 update 会静默覆盖前一次的结果（because `where` 只有
 * id，没有 version 条件），前端完全感知不到冲突。
 *
 * 修复方式：调用方在 update 的 where 里把 version 也带上（`where: { id, version:
 * expectedVersion }`），用这个函数包一层——如果这一行的 version 已经被别的并发请求
 * 改掉，Prisma 会因为 where 匹配不到任何行而抛 P2025，这里转换成和"内存校验不通过"
 * 一样的 409，而不是让后到达的写入悄悄覆盖前一个。内存里的前置校验不用删，它能在冲突
 * 发生前给出更快的失败（不用真的打一次数据库才知道冲突），这里只是补上数据库层面的
 * 兜底，两层校验不冲突。
 */
export async function runVersionedUpdate<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    throw err;
  }
}

/**
 * 给"读当前值→基于当前值算出新值（比如移动加权平均成本这类没法用纯 increment/decrement
 * 表达的计算）→带 version 条件写回"这类场景用的重试封装。attemptFn 每次调用都必须重新
 * 读取最新数据、重新计算，不能复用上一次失败时算出的旧值——因为失败原因就是数据已经变了。
 * 两类错误都当并发冲突重试：P2025（写回时 where 的 version 条件没匹配到行，说明记录已
 * 存在但被别人改过）、P2002（记录当时读到"不存在"于是走 create 分支，但落库前别的并发
 * 请求已经把它建出来了，唯一约束冲突）。重试耗尽则报 409，不让原始 Prisma 报错泄漏上层。
 */
export async function retryOnVersionConflict<T>(attemptFn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attemptFn();
    } catch (err) {
      const isRetryable = err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2025' || err.code === 'P2002');
      if (!isRetryable) throw err;
      if (i === maxAttempts - 1) throw new ConflictException('数据并发修改过于频繁，请重试');
    }
  }
  throw new ConflictException('数据并发修改过于频繁，请重试');
}
