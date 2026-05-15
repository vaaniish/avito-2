import type { PrismaClient } from "@prisma/client";

export class AdminFinanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findTransactions() {
    return this.prisma.platformTransaction.findMany({
      include: {
        buyer: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        order: {
          include: {
            buyer: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            seller: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            items: {
              orderBy: [{ id: "asc" }],
              include: {
                listing: {
                  select: {
                    public_id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
  }

  findTransactionsForAnalytics(params: {
    from: Date;
    to: Date;
    transactionStatus: string | null;
    orderStatus: string | null;
  }) {
    return this.prisma.platformTransaction.findMany({
      where: {
        created_at: {
          gte: params.from,
          lte: params.to,
        },
        ...(params.transactionStatus ? { status: params.transactionStatus as any } : {}),
        ...(params.orderStatus ? { order: { status: params.orderStatus as any } } : {}),
      },
      include: {
        buyer: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        order: {
          include: {
            buyer: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            seller: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            items: {
              orderBy: [{ id: "asc" }],
              include: {
                listing: {
                  select: {
                    public_id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
  }
}
