import { UserService, prisma } from '@relayforge/database';

export class BillingService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async checkCredits(userId: string, service: string): Promise<boolean> {
    return this.userService.checkCredits(userId, service);
  }

  async chargeCredits(userId: string, service: string): Promise<boolean> {
    return this.userService.deductCredits(userId, service);
  }

  async getServicePricing(service: string): Promise<{ pricePerCall: number } | null> {
    return this.userService.getServicePricing(service);
  }

  async getCurrentCredits(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    return user?.credits ?? 0;
  }

  async trackUsage(
    tokenId: string,
    userId: string,
    service: string,
    credits: number,
    success: boolean,
    method: string
  ): Promise<void> {
    try {
      await prisma.usage.create({
        data: {
          tokenId,
          userId,
          service,
          method,
          credits,
          success,
        },
      });
    } catch (error) {
      console.error('Failed to track usage:', error);
    }
  }
}