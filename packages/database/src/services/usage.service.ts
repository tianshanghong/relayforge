import { prisma } from '../index';
import type { Usage, ServicePricing } from '@prisma/client';

export interface TrackUsageInput {
  userId: string;
  sessionId: string;
  service: string;
  method?: string;
  success?: boolean;
}

export interface UsageSummary {
  service: string;
  callCount: number;
  totalCredits: number;
  successRate: number;
  lastUsed: Date;
}

export interface BillingPeriodSummary {
  startDate: Date;
  endDate: Date;
  totalCredits: number;
  totalCalls: number;
  byService: UsageSummary[];
}

export class UsageService {
  /**
   * Track a service usage
   */
  async trackUsage(input: TrackUsageInput): Promise<Usage> {
    const { userId, sessionId, service, method, success = true } = input;

    // Get service pricing
    const pricing = await prisma.servicePricing.findUnique({
      where: { service },
    });

    if (!pricing || !pricing.active) {
      throw new Error(`Service ${service} is not available`);
    }

    // Record usage
    return prisma.usage.create({
      data: {
        userId,
        sessionId,
        service,
        method,
        credits: pricing.pricePerCall,
        success,
      },
    });
  }

  /**
   * Get usage history for a user
   */
  async getUserUsage(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<Usage[]> {
    return prisma.usage.findMany({
      where: {
        userId,
        ...(startDate && {
          timestamp: {
            gte: startDate,
            ...(endDate && { lte: endDate }),
          },
        }),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Get usage summary by service for a user
   */
  async getUsageSummary(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageSummary[]> {
    const usages = await prisma.usage.groupBy({
      by: ['service'],
      where: {
        userId,
        ...(startDate && {
          timestamp: {
            gte: startDate,
            ...(endDate && { lte: endDate }),
          },
        }),
      },
      _count: {
        id: true,
      },
      _sum: {
        credits: true,
      },
    });

    // Get success rates and last used dates
    const summaries: UsageSummary[] = [];
    
    for (const usage of usages) {
      const serviceUsages = await prisma.usage.findMany({
        where: {
          userId,
          service: usage.service,
          ...(startDate && {
            timestamp: {
              gte: startDate,
              ...(endDate && { lte: endDate }),
            },
          }),
        },
        orderBy: { timestamp: 'desc' },
        take: 1,
        select: {
          timestamp: true,
        },
      });

      const successCount = await prisma.usage.count({
        where: {
          userId,
          service: usage.service,
          success: true,
          ...(startDate && {
            timestamp: {
              gte: startDate,
              ...(endDate && { lte: endDate }),
            },
          }),
        },
      });

      summaries.push({
        service: usage.service,
        callCount: usage._count.id,
        totalCredits: usage._sum.credits || 0,
        successRate: (successCount / usage._count.id) * 100,
        lastUsed: serviceUsages[0]?.timestamp || new Date(0),
      });
    }

    return summaries.sort((a, b) => b.totalCredits - a.totalCredits);
  }

  /**
   * Get billing period summary (e.g., monthly)
   */
  async getBillingPeriodSummary(
    userId: string,
    year: number,
    month: number
  ): Promise<BillingPeriodSummary> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const totalResult = await prisma.usage.aggregate({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        credits: true,
      },
      _count: {
        id: true,
      },
    });

    const byService = await this.getUsageSummary(userId, startDate, endDate);

    return {
      startDate,
      endDate,
      totalCredits: totalResult._sum.credits || 0,
      totalCalls: totalResult._count.id,
      byService,
    };
  }

  /**
   * Get service pricing information
   */
  async getServicePricing(
    activeOnly: boolean = true
  ): Promise<ServicePricing[]> {
    return prisma.servicePricing.findMany({
      where: {
        ...(activeOnly && { active: true }),
      },
      orderBy: [
        { category: 'asc' },
        { service: 'asc' },
      ],
    });
  }

  /**
   * Get top services by usage for a user
   */
  async getTopServices(
    userId: string,
    limit: number = 5,
    days: number = 30
  ): Promise<Array<{ service: string; calls: number; credits: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await prisma.usage.groupBy({
      by: ['service'],
      where: {
        userId,
        timestamp: {
          gte: startDate,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        credits: true,
      },
      orderBy: {
        _sum: {
          credits: 'desc',
        },
      },
      take: limit,
    });

    return results.map((r) => ({
      service: r.service,
      calls: r._count.id,
      credits: r._sum.credits || 0,
    }));
  }

  /**
   * Calculate estimated monthly spend based on recent usage
   */
  async estimateMonthlySpend(
    userId: string,
    basedOnDays: number = 7
  ): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - basedOnDays);

    const totalCredits = await prisma.usage.aggregate({
      where: {
        userId,
        timestamp: {
          gte: startDate,
        },
      },
      _sum: {
        credits: true,
      },
    });

    const dailyAverage = (totalCredits._sum.credits || 0) / basedOnDays;
    return Math.round(dailyAverage * 30);
  }
}