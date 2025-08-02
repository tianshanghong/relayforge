import { prisma } from '../index';
import type { Usage, ServicePricing } from '@prisma/client';

export interface TrackUsageInput {
  userId: string;
  identifier: string;
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
    const { userId, identifier, service, method, success = true } = input;

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
        identifier,
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
    // Use raw SQL for efficient aggregation to avoid N+1 queries
    if (startDate && endDate) {
      const detailedStats = await prisma.$queryRaw<Array<{
        service: string;
        call_count: bigint;
        total_credits: number;
        success_count: bigint;
        last_used: Date;
      }>>`
        SELECT 
          service,
          COUNT(*)::bigint as call_count,
          COALESCE(SUM(credits), 0)::int as total_credits,
          COUNT(CASE WHEN success = true THEN 1 END)::bigint as success_count,
          MAX(timestamp) as last_used
        FROM usage
        WHERE "userId" = ${userId}
          AND timestamp >= ${startDate}
          AND timestamp <= ${endDate}
        GROUP BY service
        ORDER BY total_credits DESC
      `;
      
      return detailedStats.map(stat => ({
        service: stat.service,
        callCount: Number(stat.call_count),
        totalCredits: stat.total_credits,
        successRate: Number(stat.call_count) > 0 
          ? (Number(stat.success_count) / Number(stat.call_count)) * 100 
          : 0,
        lastUsed: stat.last_used,
      }));
    } else if (startDate) {
      const detailedStats = await prisma.$queryRaw<Array<{
        service: string;
        call_count: bigint;
        total_credits: number;
        success_count: bigint;
        last_used: Date;
      }>>`
        SELECT 
          service,
          COUNT(*)::bigint as call_count,
          COALESCE(SUM(credits), 0)::int as total_credits,
          COUNT(CASE WHEN success = true THEN 1 END)::bigint as success_count,
          MAX(timestamp) as last_used
        FROM usage
        WHERE "userId" = ${userId}
          AND timestamp >= ${startDate}
        GROUP BY service
        ORDER BY total_credits DESC
      `;
      
      return detailedStats.map(stat => ({
        service: stat.service,
        callCount: Number(stat.call_count),
        totalCredits: stat.total_credits,
        successRate: Number(stat.call_count) > 0 
          ? (Number(stat.success_count) / Number(stat.call_count)) * 100 
          : 0,
        lastUsed: stat.last_used,
      }));
    } else {
      const detailedStats = await prisma.$queryRaw<Array<{
        service: string;
        call_count: bigint;
        total_credits: number;
        success_count: bigint;
        last_used: Date;
      }>>`
        SELECT 
          service,
          COUNT(*)::bigint as call_count,
          COALESCE(SUM(credits), 0)::int as total_credits,
          COUNT(CASE WHEN success = true THEN 1 END)::bigint as success_count,
          MAX(timestamp) as last_used
        FROM usage
        WHERE "userId" = ${userId}
        GROUP BY service
        ORDER BY total_credits DESC
      `;
      
      return detailedStats.map(stat => ({
        service: stat.service,
        callCount: Number(stat.call_count),
        totalCredits: stat.total_credits,
        successRate: Number(stat.call_count) > 0 
          ? (Number(stat.success_count) / Number(stat.call_count)) * 100 
          : 0,
        lastUsed: stat.last_used,
      }));
    }
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