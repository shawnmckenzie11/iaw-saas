import { prisma } from '../config/db';

export type QueuePosition = 'top' | 'bottom' | { afterWaybillNumber: string };

export interface AssignmentQueueOptions {
  driverId: string;
  waybillNumber: string;
  priority: 'REGULAR' | 'RUSH';
  queuePosition?: QueuePosition;
}

/**
 * Resolves a driver's queue rank for a newly assigned waybill.
 */
export async function resolveDriverQueueRank(options: AssignmentQueueOptions): Promise<number> {
  const { driverId, waybillNumber, priority, queuePosition } = options;

  const active = await prisma.deliveryRecord.findMany({
    where: {
      driverId,
      status: { in: ['DRAFT', 'PICKED_UP'] },
      waybillNumber: { not: waybillNumber },
    },
    orderBy: [{ driverQueueRank: 'asc' }, { capturedAt: 'asc' }],
    select: { waybillNumber: true, driverQueueRank: true },
  });

  if (active.length === 0) {
    return priority === 'RUSH' ? 0 : 100;
  }

  const ranks = active.map((row) => row.driverQueueRank ?? 100);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const resolvedPosition = queuePosition ?? (priority === 'RUSH' ? 'top' : 'bottom');

  if (resolvedPosition === 'top') {
    return minRank - 10;
  }

  if (resolvedPosition === 'bottom') {
    return maxRank + 10;
  }

  const anchor = active.find((row) => row.waybillNumber === resolvedPosition.afterWaybillNumber);
  if (!anchor) {
    return maxRank + 10;
  }

  const anchorRank = anchor.driverQueueRank ?? maxRank;
  const next = active.find((row) => (row.driverQueueRank ?? 0) > anchorRank);
  if (!next) {
    return anchorRank + 10;
  }

  const nextRank = next.driverQueueRank ?? anchorRank + 20;
  return Math.floor((anchorRank + nextRank) / 2);
}

/**
 * Builds assignment event data with a resolved queue rank for dispatcher assigns.
 */
export async function buildAssignmentEventData(input: {
  driverId: string | null;
  waybillNumber: string;
  priority?: 'REGULAR' | 'RUSH';
  queuePosition?: QueuePosition;
}): Promise<Record<string, unknown>> {
  if (input.driverId === null) {
    return {
      driverId: null,
      driverQueueRank: null,
      priority: input.priority,
      priorityLabel: null,
    };
  }

  const priority = input.priority ?? 'REGULAR';
  const driverQueueRank = await resolveDriverQueueRank({
    driverId: input.driverId,
    waybillNumber: input.waybillNumber,
    priority,
    queuePosition: input.queuePosition,
  });

  return {
    driverId: input.driverId,
    driverQueueRank,
    priority,
    priorityLabel: priority === 'RUSH' ? 'RUSH' : null,
  };
}
