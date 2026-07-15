import 'dotenv/config';
import { db, pool } from '../src/db/client.js';
import { users, domains, recipients, aliases, deliveryFailureLog } from '../src/db/schema.js';
import { register, login } from '../src/modules/auth/auth.service.js';
import { runProvisioning } from '../src/modules/admin/provision-admin.service.js';
import { redis } from '../src/lib/redis.js';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../src/app.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

async function runTest() {
  console.log('--- STARTING QA INTEGRATION TEST ---');
  const app = createApp();

  let originalDomain: string | undefined = undefined;
  let platformDomainModified = false;
  let adminToken: string | undefined = undefined;

  try {
    // 1. Cleanup any previous test runs
    console.log('Cleaning up old test users and resources...');
    const oldUsers = await db.select().from(users).where(inArray(users.email, ['qa-user1@example.com', 'qa-user2@example.com']));
    if (oldUsers.length > 0) {
      const userIds = oldUsers.map(u => u.id);
      // Cascadable deletes will clean up aliases, recipients, domains automatically
      await db.delete(users).where(inArray(users.id, userIds));
    }

    // 2. Create two normal users through supported registration
    console.log('Registering two normal users...');
    const user1 = await register({ email: 'qa-user1@example.com', password: 'Password12345!' });
    const user2 = await register({ email: 'qa-user2@example.com', password: 'Password12345!' });

    console.log(`User 1 registered: ${user1.user.email} (ID: ${user1.user.id}, Role: ${user1.user.role})`);
    console.log(`User 2 registered: ${user2.user.email} (ID: ${user2.user.id}, Role: ${user2.user.role})`);

    // Verify initial role is 'user'
    if (user1.user.role !== 'user' || user2.user.role !== 'user') {
      throw new Error('Initial roles are not "user"');
    }

    // 3. User 1 creates domains, recipients, aliases, and delivery failure logs for isolation tests
    console.log('User 1 creating isolated test resources...');
    const domainRes = await request(app)
      .post('/api/domains')
      .set('Authorization', `Bearer ${user1.accessToken}`)
      .send({ domain: 'qa-user1-domain.com' });
    if (domainRes.status !== 201) {
      throw new Error(`Failed to create domain for User 1: ${domainRes.text}`);
    }
    const domainId = domainRes.body.domain.id;
    console.log(`Created Domain ID: ${domainId}`);

    // Auto-verify domain in DB for test purposes
    await db.update(domains)
      .set({ status: 'verified', verifiedAt: new Date() })
      .where(eq(domains.id, domainId));

    const recRes = await request(app)
      .post('/api/recipients')
      .set('Authorization', `Bearer ${user1.accessToken}`)
      .send({ email: 'qa-recipient@example.com' });
    if (recRes.status !== 201) {
      throw new Error(`Failed to create recipient for User 1: ${recRes.text}`);
    }
    const recipientId = recRes.body.recipient.id;
    console.log(`Created Recipient ID: ${recipientId}`);

    // Auto-verify recipient in DB
    await db.update(recipients)
      .set({ status: 'verified', verifiedAt: new Date() })
      .where(eq(recipients.id, recipientId));

    const aliasRes = await request(app)
      .post('/api/aliases')
      .set('Authorization', `Bearer ${user1.accessToken}`)
      .send({ localPart: 'qaalias', domainId, recipientId });
    if (aliasRes.status !== 201) {
      throw new Error(`Failed to create alias for User 1: ${aliasRes.text}`);
    }
    const aliasId = aliasRes.body.alias.id;
    console.log(`Created Alias ID: ${aliasId}`);

    // Seed a mock delivery failure log in DB
    const [failureRow] = await db.insert(deliveryFailureLog)
      .values({
        aliasId,
        aliasAddress: 'qaalias@qa-user1-domain.com',
        recipient: 'qa-recipient@example.com',
        provider: 'resend',
        reason: 'bounce',
        failureDetail: 'Permanent bounce mock',
        timestamp: new Date()
      })
      .returning();
    console.log(`Created Delivery Failure Log ID: ${failureRow.id}`);

    // 4. Provision one disposable admin through the new mechanism
    console.log('Promoting User 1 to admin...');
    const promoteResult = await runProvisioning('promote', { email: 'qa-user1@example.com', confirm: true });
    console.log('Promotion result:', JSON.stringify(promoteResult, null, 2));

    // 5. Verify role is represented in newly issued signed access tokens
    console.log('Logging in promoted User 1 to get new access token...');
    const user1Login = await login({ email: 'qa-user1@example.com', password: 'Password12345!' });
    adminToken = user1Login.accessToken;
    const decoded = jwt.decode(adminToken) as any;
    console.log('Decoded new token role:', decoded.role);
    if (decoded.role !== 'admin') {
      throw new Error('Role in new access token is not "admin"');
    }

    // Verify that the old token for user 1 does not silently gain admin privilege
    const oldDecoded = jwt.decode(user1.accessToken) as any;
    console.log('Decoded old token role:', oldDecoded.role);
    if (oldDecoded.role === 'admin') {
      throw new Error('Old access token silently gained admin role');
    }

    // 6. Verify normal user is denied admin API
    console.log('Verifying User 2 (normal user) is denied admin API...');
    const user2Res = await request(app)
      .get('/api/admin/config')
      .set('Authorization', `Bearer ${user2.accessToken}`);
    console.log(`User 2 response status: ${user2Res.status}`);
    if (user2Res.status !== 403) {
      throw new Error(`Expected status 403, got ${user2Res.status}`);
    }

    // 7. Verify disposable admin is allowed admin API
    console.log('Verifying User 1 (disposable admin) is allowed admin API...');
    const adminRes = await request(app)
      .get('/api/admin/config')
      .set('Authorization', `Bearer ${adminToken}`);
    console.log(`Admin response status: ${adminRes.status}`);
    if (adminRes.status !== 200) {
      throw new Error(`Expected status 200, got ${adminRes.status}`);
    }

    // 8. Test Settings / platformDomain Update & Safe Restoration
    console.log('Verifying admin settings configuration changes...');
    originalDomain = adminRes.body.platformDomain;

    console.log('Updating platformDomain via admin API...');
    platformDomainModified = true;
    const updateConfigRes = await request(app)
      .post('/api/admin/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ platformDomain: 'new-temp-domain.com' });
    if (updateConfigRes.status !== 200 || updateConfigRes.body.platformDomain !== 'new-temp-domain.com') {
      throw new Error(`Failed to update platformDomain, status: ${updateConfigRes.status}`);
    }

    console.log('Restoring platformDomain to original value...');
    const restoreConfigRes = await request(app)
      .post('/api/admin/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ platformDomain: originalDomain || undefined });
    if (restoreConfigRes.status !== 200) {
      throw new Error(`Failed to restore platformDomain, status: ${restoreConfigRes.status}`);
    }
    platformDomainModified = false;
    console.log('Successfully tested admin settings configuration CRUD and restored settings.');

    // 9. Verify cross-user isolation remains strictly enforced
    console.log('Verifying cross-user access block (isolation tests)...');

    // Verify list endpoints don't mix records
    const user2Aliases = await request(app)
      .get('/api/aliases')
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (user2Aliases.status !== 200 || user2Aliases.body.aliases.some((a: any) => a.id === aliasId)) {
      throw new Error('User 2 is seeing User 1 aliases in list response');
    }

    const user2Domains = await request(app)
      .get('/api/domains')
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (user2Domains.status !== 200 || user2Domains.body.domains.some((d: any) => d.id === domainId)) {
      throw new Error('User 2 is seeing User 1 domains in list response');
    }

    const user2Recipients = await request(app)
      .get('/api/recipients')
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (user2Recipients.status !== 200 || user2Recipients.body.recipients.some((r: any) => r.id === recipientId)) {
      throw new Error('User 2 is seeing User 1 recipients in list response');
    }

    // Verify direct resource accesses fail with 404
    const getDomainCross = await request(app)
      .get(`/api/domains/${domainId}`)
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (getDomainCross.status !== 404) {
      throw new Error(`Expected 404 for cross-user domain GET, got ${getDomainCross.status}`);
    }

    const getRecipientCross = await request(app)
      .get(`/api/recipients/${recipientId}`)
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (getRecipientCross.status !== 404) {
      throw new Error(`Expected 404 for cross-user recipient GET, got ${getRecipientCross.status}`);
    }

    const getAliasCross = await request(app)
      .get(`/api/aliases/${aliasId}`)
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (getAliasCross.status !== 404) {
      throw new Error(`Expected 404 for cross-user alias GET, got ${getAliasCross.status}`);
    }

    const getFailuresCross = await request(app)
      .get(`/api/delivery-failures/aliases/${aliasId}`)
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (getFailuresCross.status !== 404) {
      throw new Error(`Expected 404 for cross-user delivery failures GET, got ${getFailuresCross.status}`);
    }

    // Verify destructive actions fail with 404
    const deleteAliasCross = await request(app)
      .delete(`/api/aliases/${aliasId}`)
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (deleteAliasCross.status !== 404) {
      throw new Error(`Expected 404 for cross-user alias DELETE, got ${deleteAliasCross.status}`);
    }

    const deleteDomainCross = await request(app)
      .delete(`/api/domains/${domainId}`)
      .set('Authorization', `Bearer ${user2.accessToken}`);
    if (deleteDomainCross.status !== 404) {
      throw new Error(`Expected 404 for cross-user domain DELETE, got ${deleteDomainCross.status}`);
    }

    console.log('Cross-user isolation tests PASSED.');

    // 10. Demote disposable admin, revoke sessions, and prove subsequent admin access fails
    console.log('Demoting User 1...');
    const demoteResult = await runProvisioning('demote', { email: 'qa-user1@example.com', confirm: true });
    console.log('Demote result:', JSON.stringify(demoteResult, null, 2));

    // Prove that the original admin access token fails immediately after demotion
    console.log('Verifying that the original admin access token fails immediately after demotion...');
    const oldAdminRes = await request(app)
      .get('/api/admin/config')
      .set('Authorization', `Bearer ${adminToken}`);
    console.log(`Original admin token status after demotion: ${oldAdminRes.status}`);
    if (oldAdminRes.status !== 403) {
      throw new Error(`Expected status 403 for old admin token after demotion, got ${oldAdminRes.status}`);
    }

    // Log in again to verify new tokens are demoted
    console.log('Logging in User 1 after demotion...');
    const user1PostDemoteLogin = await login({ email: 'qa-user1@example.com', password: 'Password12345!' });
    const postDemoteToken = user1PostDemoteLogin.accessToken;
    const decodedPostDemote = jwt.decode(postDemoteToken) as any;
    console.log('Decoded token role after demotion:', decodedPostDemote.role);
    if (decodedPostDemote.role !== 'user') {
      throw new Error('Role in access token after demotion is not "user"');
    }

    // Prove subsequent admin access fails with post-demotion token
    console.log('Verifying post-demotion token is denied admin API...');
    const postDemoteRes = await request(app)
      .get('/api/admin/config')
      .set('Authorization', `Bearer ${postDemoteToken}`);
    console.log(`Post-demotion response status: ${postDemoteRes.status}`);
    if (postDemoteRes.status !== 403) {
      throw new Error(`Expected status 403, got ${postDemoteRes.status}`);
    }

    console.log('--- QA INTEGRATION TEST PASSED SUCCESSFULLY ---');
  } finally {
    console.log('Entering QA integration test cleanup/restoration finally block...');
    if (platformDomainModified && adminToken && originalDomain !== undefined) {
      console.log('Test failed or interrupted after platformDomain modification. Restoring platformDomain to:', originalDomain);
      try {
        await request(app)
          .post('/api/admin/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ platformDomain: originalDomain || undefined });
        console.log('platformDomain successfully restored during cleanup.');
      } catch (cleanupErr) {
        console.error('Failed to restore platformDomain during cleanup:', cleanupErr);
      }
    }

    console.log('Cleaning up test users and associated resources...');
    try {
      const oldUsers = await db.select().from(users).where(inArray(users.email, ['qa-user1@example.com', 'qa-user2@example.com']));
      if (oldUsers.length > 0) {
        const userIds = oldUsers.map(u => u.id);
        await db.delete(users).where(inArray(users.id, userIds));
        console.log('Test users successfully cleaned up.');
      }
    } catch (cleanupErr) {
      console.error('Failed to clean up test users during cleanup:', cleanupErr);
    }
  }
}

runTest()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await redis.quit();
  });
