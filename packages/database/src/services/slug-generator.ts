import { prisma } from '../index';
import crypto from 'crypto';

// Word lists for memorable slugs
const ADJECTIVES = [
  'happy', 'swift', 'brave', 'clever', 'bright',
  'calm', 'eager', 'gentle', 'jolly', 'kind',
  'lively', 'merry', 'noble', 'proud', 'quick',
  'sharp', 'smart', 'witty', 'bold', 'cool',
  'fair', 'glad', 'grand', 'neat', 'wise',
  'warm', 'wild', 'zesty', 'dandy', 'fancy',
  'peppy', 'perky', 'sunny', 'super', 'vivid',
  'agile', 'alert', 'brave', 'crisp', 'deft',
  'elite', 'fresh', 'great', 'keen', 'loyal',
  'nice', 'prime', 'royal', 'solid', 'sweet',
  'tough', 'ultra', 'vital', 'young', 'zippy',
  'cosmic', 'divine', 'epic', 'heroic', 'magic',
  'mystic', 'rapid', 'serene', 'stellar', 'vibrant'
];

const NOUNS = [
  'dolphin', 'canyon', 'sunset', 'river', 'mountain',
  'ocean', 'forest', 'meadow', 'thunder', 'lightning',
  'phoenix', 'dragon', 'falcon', 'eagle', 'hawk',
  'lion', 'tiger', 'panther', 'wolf', 'bear',
  'storm', 'breeze', 'cloud', 'rain', 'snow',
  'star', 'moon', 'comet', 'nebula', 'galaxy',
  'tree', 'flower', 'garden', 'valley', 'peak',
  'aurora', 'beacon', 'castle', 'desert', 'ember',
  'flame', 'glacier', 'harbor', 'island', 'jungle',
  'knight', 'lagoon', 'meteor', 'nova', 'oasis',
  'planet', 'quest', 'realm', 'summit', 'temple',
  'unicorn', 'vortex', 'wave', 'zenith', 'horizon',
  'crystal', 'diamond', 'element', 'fortress', 'guardian'
];

export class SlugGenerator {
  /**
   * Generate a memorable user slug
   * Format: {adjective}-{noun}-{number}
   * Example: happy-dolphin-42
   */
  static async generateUserSlug(tx?: any): Promise<string> {
    const maxAttempts = 50; // Increase attempts due to limited word pool
    const db = tx || prisma; // Use transaction client if provided
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const adjective = this.getRandomElement(ADJECTIVES);
      const noun = this.getRandomElement(NOUNS);
      const number = Math.floor(Math.random() * 100); // 0-99
      
      const slug = `${adjective}-${noun}-${number}`;
      
      // Check if slug already exists
      const existing = await db.user.findUnique({
        where: { slug },
        select: { id: true }
      });
      
      if (!existing) {
        return slug;
      }
    }
    
    // Fallback: add 2-byte hex suffix if we can't find a unique combination
    // This gives us 65,536 additional possibilities per adjective-noun pair
    const fallbackAttempts = 20;
    for (let i = 0; i < fallbackAttempts; i++) {
      const adjective = this.getRandomElement(ADJECTIVES);
      const noun = this.getRandomElement(NOUNS);
      const randomHex = crypto.randomBytes(2).toString('hex');
      const slug = `${adjective}-${noun}-${randomHex}`;
      
      const existing = await db.user.findUnique({
        where: { slug },
        select: { id: true }
      });
      
      if (!existing) {
        return slug;
      }
    }
    
    // If we still can't find a unique slug after 20 attempts, 
    // the system is at capacity and needs intervention
    throw new Error('Unable to generate unique slug - system may be at capacity');
  }

  /**
   * Get a random element from an array
   */
  private static getRandomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Validate slug format (for input validation)
   */
  static isValidSlug(slug: string): boolean {
    // Match: word-word-number or word-word-hex
    const pattern = /^[a-z]+-[a-z]+-([0-9]{1,2}|[a-f0-9]{4})$/;
    return pattern.test(slug);
  }

  /**
   * Check if a slug is available
   */
  static async isSlugAvailable(slug: string): Promise<boolean> {
    const existing = await prisma.user.findUnique({
      where: { slug },
      select: { id: true }
    });
    
    return !existing;
  }
}