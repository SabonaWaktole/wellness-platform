import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { PrismaInteractionTimelineSource } from './PrismaInteractionTimelineSource';
import { PrismaAppointmentTimelineSource } from './PrismaAppointmentTimelineSource';
import { PrismaContactTimelineSource } from './PrismaContactTimelineSource';
import { PrismaQuotationTimelineSource } from './PrismaQuotationTimelineSource';
import { PrismaContractTimelineSource } from './PrismaContractTimelineSource';
import { PrismaPaymentTimelineSource } from './PrismaPaymentTimelineSource';

/** Every source of a company's timeline (FR-CMP-05). M2 adds deals here. */
export const companyTimelineSources = (prisma: PrismaClient): TimelineSource[] => [
  new PrismaContactTimelineSource(prisma),
  new PrismaInteractionTimelineSource(prisma, 'NOTE'),
  new PrismaInteractionTimelineSource(prisma, 'ACTIVITY'),
  new PrismaAppointmentTimelineSource(prisma),
  new PrismaQuotationTimelineSource(prisma),
  new PrismaContractTimelineSource(prisma),
  new PrismaPaymentTimelineSource(prisma),
];
