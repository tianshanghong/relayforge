#!/usr/bin/env tsx

// Import from the built database package
import { mcpTokenService, prisma } from '../packages/database/dist/index.js';

async function createToken() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('Usage: tsx create-token.ts <email>');
    process.exit(1);
  }

  try {
    // Find user by email
    const user = await prisma.user.findFirst({
      where: {
        linkedEmails: {
          some: {
            email: email.toLowerCase()
          }
        }
      }
    });

    if (!user) {
      console.error(`User not found with email: ${email}`);
      process.exit(1);
    }

    // Create new token
    const token = await mcpTokenService.createToken({
      userId: user.id,
      name: `CLI Token - ${new Date().toISOString()}`
    });

    console.log('\n✅ Token created successfully!\n');
    console.log('User:', email);
    console.log('MCP URL:', `http://localhost:3001/mcp/u/${user.slug}`);
    console.log('Bearer Token:', token.plainToken);
    console.log('\nAdd to your MCP client config:');
    console.log('Authorization: Bearer', token.plainToken);
    console.log('\n⚠️  This token is shown only once. Save it securely!');

  } catch (error) {
    console.error('Error creating token:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createToken();