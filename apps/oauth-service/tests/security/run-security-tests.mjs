#!/usr/bin/env node
/**
 * Security Test Runner
 * Runs all standalone security verification scripts
 * Add new security tests to the tests array below
 */

import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Define security tests to run
const securityTests = [
  'verify-sql-injection-protection.mjs',
  // Add future tests here:
  // 'verify-xss-protection.mjs',
  // 'verify-csrf-protection.mjs',
  // 'verify-auth-bypass.mjs',
  // 'verify-rate-limiting.mjs',
];

async function runSecurityTest(testFile) {
  console.log(`\n📋 Running ${testFile}...`);
  console.log('═'.repeat(50));
  
  return new Promise((resolve) => {
    const child = spawn('node', [join(__dirname, testFile)], {
      stdio: 'inherit',
    });
    
    child.on('exit', (code) => {
      resolve({ test: testFile, passed: code === 0 });
    });
  });
}

async function discoverSecurityTests() {
  // Optionally auto-discover all verify-*.mjs files
  const files = await readdir(__dirname);
  return files.filter(f => f.startsWith('verify-') && f.endsWith('.mjs'));
}

async function main() {
  console.log('🔒 Starting Security Test Suite');
  console.log('═'.repeat(50));
  
  // Option: Use auto-discovery instead of manual list
  // const tests = await discoverSecurityTests();
  const tests = securityTests;
  
  const results = [];
  
  for (const test of tests) {
    const result = await runSecurityTest(test);
    results.push(result);
  }
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Security Test Summary:');
  console.log('═'.repeat(50));
  
  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  
  passed.forEach(r => console.log(`✅ ${r.test}`));
  failed.forEach(r => console.log(`❌ ${r.test}`));
  
  console.log(`\nTotal: ${passed.length}/${results.length} passed`);
  
  if (failed.length > 0) {
    console.log('\n❌ Some security tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All security tests passed!');
    process.exit(0);
  }
}

main().catch(console.error);