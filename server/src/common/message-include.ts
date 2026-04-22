import type { Prisma } from '@prisma/client';

/** Shared message relations for reaction avatars + media. */
export const MESSAGE_RELATIONS_INCLUDE = {
  media: { orderBy: { createdAt: 'asc' } },
  reactions: {
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.MessageInclude;
