const DAY = 86400_000;

export interface ConflictOccupancy {
  id: string;
  roomId: string;
  occupancyNo: string;
  status: 'RESERVED' | 'CHECKED_IN';
  plannedCheckIn: Date;
  plannedCheckOut: Date;
  createdAt: Date;
  contractId: string | null;
  contractStatus?: string | null;
  customerName: string;
  roomNo: string;
}

export interface RoomConflict {
  roomId: string;
  roomNo: string;
  a: ConflictBrief;
  b: ConflictBrief;
  /** 日期实际重叠的天数；0 表示日期没重叠，只是两位之间的间隔不够整理房间 */
  overlapDays: number;
  bufferOnly: boolean;
  /** 重叠开始的日期（离现在还有几天，负数=已经开始） */
  startsInDays: number;
  /** 系统建议先调整哪一位：优先级低的；一样就建议后预订的 */
  suggestId: string;
}

export interface ConflictBrief {
  id: string;
  occupancyNo: string;
  customerName: string;
  status: 'RESERVED' | 'CHECKED_IN';
  plannedCheckIn: Date;
  plannedCheckOut: Date;
  /** SIGNED=已签合同（优先保留）；INTENT=只有意向 */
  priority: 'SIGNED' | 'INTENT';
}

export const brief = (o: ConflictOccupancy): ConflictBrief => ({
  id: o.id,
  occupancyNo: o.occupancyNo,
  customerName: o.customerName,
  status: o.status,
  plannedCheckIn: o.plannedCheckIn,
  plannedCheckOut: o.plannedCheckOut,
  priority: o.contractId && o.contractStatus === 'ACTIVE' ? 'SIGNED' : 'INTENT',
});

/** 两段占用（含房间整理间隔）是否冲突：[入住, 离店+间隔) 互相有交集。 */
export function overlapsWithBuffer(aIn: Date, aOut: Date, bIn: Date, bOut: Date, bufferDays: number): boolean {
  const buf = bufferDays * DAY;
  return aIn.getTime() < bOut.getTime() + buf && bIn.getTime() < aOut.getTime() + buf;
}

/** 在一批生效中的占用记录里找出同一间房里互相冲突的两两组合（按重叠开始时间排序）。 */
export function computeConflicts(rows: ConflictOccupancy[], bufferDays: number, now = new Date()): RoomConflict[] {
  const byRoom = new Map<string, ConflictOccupancy[]>();
  for (const r of rows) byRoom.set(r.roomId, [...(byRoom.get(r.roomId) ?? []), r]);
  const out: RoomConflict[] = [];
  for (const list of byRoom.values()) {
    const sorted = [...list].sort((x, y) => x.plannedCheckIn.getTime() - y.plannedCheckIn.getTime());
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (!overlapsWithBuffer(a.plannedCheckIn, a.plannedCheckOut, b.plannedCheckIn, b.plannedCheckOut, bufferDays)) continue;
        const start = Math.max(a.plannedCheckIn.getTime(), b.plannedCheckIn.getTime());
        const end = Math.min(a.plannedCheckOut.getTime(), b.plannedCheckOut.getTime());
        const overlapDays = Math.max(0, Math.round((end - start) / DAY));
        const ba = brief(a);
        const bb = brief(b);
        // 已入住的那位不能“被调整”（人已经在住了），建议调整另一位
        let suggest = bb.id;
        if (a.status === 'CHECKED_IN' && b.status !== 'CHECKED_IN') suggest = bb.id;
        else if (b.status === 'CHECKED_IN' && a.status !== 'CHECKED_IN') suggest = ba.id;
        else if (ba.priority !== bb.priority) suggest = ba.priority === 'INTENT' ? ba.id : bb.id;
        else suggest = a.createdAt.getTime() > b.createdAt.getTime() ? ba.id : bb.id;
        out.push({
          roomId: a.roomId,
          roomNo: a.roomNo,
          a: ba,
          b: bb,
          overlapDays,
          bufferOnly: overlapDays === 0,
          startsInDays: Math.ceil((start - now.getTime()) / DAY),
          suggestId: suggest,
        });
      }
    }
  }
  return out.sort((x, y) => x.startsInDays - y.startsInDays);
}
