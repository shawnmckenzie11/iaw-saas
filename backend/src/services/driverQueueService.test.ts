import { resolveDriverQueueRank } from './driverQueueService';
import { prisma } from '../config/db';

jest.mock('../config/db', () => ({
  prisma: {
    deliveryRecord: {
      findMany: jest.fn(),
    },
  },
}));

const mockedFindMany = prisma.deliveryRecord.findMany as jest.MockedFunction<
  typeof prisma.deliveryRecord.findMany
>;

describe('resolveDriverQueueRank', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('places rush jobs at the top of an existing driver queue by default', async () => {
    mockedFindMany.mockResolvedValue([
      { waybillNumber: 'W-1', driverQueueRank: 100 },
      { waybillNumber: 'W-2', driverQueueRank: 110 },
    ] as never);

    const rank = await resolveDriverQueueRank({
      driverId: 'drv-01',
      waybillNumber: 'REQ-9',
      priority: 'RUSH',
    });

    expect(rank).toBe(90);
  });

  it('places regular jobs at the bottom of the queue by default', async () => {
    mockedFindMany.mockResolvedValue([
      { waybillNumber: 'W-1', driverQueueRank: 100 },
    ] as never);

    const rank = await resolveDriverQueueRank({
      driverId: 'drv-01',
      waybillNumber: 'REQ-9',
      priority: 'REGULAR',
    });

    expect(rank).toBe(110);
  });
});
