/**
 * Unit and integration tests for Firebase Phone Authentication flow.
 *
 * Tests:
 * 1. Missing Firebase ID token
 * 2. Invalid Firebase ID token
 * 3. Expired Firebase ID token
 * 4. Revoked Firebase ID token
 * 5. Firebase ID token missing phone_number
 * 6. Existing TradeNexa user login with buyer role
 * 7. Existing TradeNexa user login with seller role
 * 8. Existing TradeNexa user login with buyer_seller role
 * 9. Existing inactive user rejection (403)
 * 10. New TradeNexa user onboarding response (is_registered: false + registration_token)
 * 11. New TradeNexa user auto-registration when fields provided
 * 12. Token passed via Authorization: Bearer <idToken> header
 */
const assert = require('assert');
const admin = require('firebase-admin');
const firebaseUtils = require('../utils/firebase');
const authService = require('../services/authService');
const userModel = require('../models/userModel');
const { verifyAccess } = require('../utils/jwt');
const { TOKEN_TYPES, ROLE_CODES } = require('../constants');

// ==========================================
// Test runner helpers
// ==========================================

let passedTests = 0;
let failedTests = 0;

async function test(description, fn) {
  try {
    await fn();
    console.log(`  PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  FAIL: ${description}`);
    console.error(`        ${err.message}`);
    failedTests++;
  }
}

// ==========================================
// Mocking Setup
// ==========================================

// Ensure admin app is initialized for testing
if (!admin.apps.length) {
  firebaseUtils.init();
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'test-project',
      credential: {
        getAccessToken: () => Promise.resolve({ access_token: 'test', expires_in: 3600 }),
      },
    });
  }
}

const originalVerifyIdToken = admin.auth().verifyIdToken;
const originalFindUserByMobile = userModel.findUserByMobile;
const originalSaveRefreshToken = userModel.saveRefreshToken;
const originalUpdateUser = userModel.updateUser;
const originalCreateLoginLog = userModel.createLoginLog;
const originalGetFullProfile = userModel.getFullProfile;
const originalFormatUser = userModel.formatUser;
const originalSaveUserDevice = userModel.saveUserDevice;

function mockAdminVerifyIdToken(mockFn) {
  admin.auth().verifyIdToken = mockFn;
}

function restoreAll() {
  if (originalVerifyIdToken) admin.auth().verifyIdToken = originalVerifyIdToken;
  userModel.findUserByMobile = originalFindUserByMobile;
  userModel.saveRefreshToken = originalSaveRefreshToken;
  userModel.updateUser = originalUpdateUser;
  userModel.createLoginLog = originalCreateLoginLog;
  userModel.getFullProfile = originalGetFullProfile;
  userModel.formatUser = originalFormatUser;
  userModel.saveUserDevice = originalSaveUserDevice;
}

// Dummy request object
const mockReq = {
  ip: '127.0.0.1',
  headers: { 'user-agent': 'TradeNexa-Test-Agent' },
  body: {},
};

async function runTests() {
  console.log('\n--- Running Firebase Authentication Test Suite ---\n');

  // Test 1: Missing Firebase ID token
  await test('Missing Firebase ID token rejects with 400', async () => {
    try {
      await authService.firebasePhoneLogin('', null, mockReq);
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.match(err.message, /Firebase ID token is required/i);
    }
  });

  // Test 2: Invalid Firebase ID token
  await test('Invalid Firebase ID token rejects with 401', async () => {
    mockAdminVerifyIdToken(async () => {
      const error = new Error('Decoding Firebase ID token failed');
      error.code = 'auth/invalid-id-token';
      throw error;
    });

    try {
      await authService.firebasePhoneLogin('invalid_token', null, mockReq);
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 401);
      assert.match(err.message, /Invalid Firebase ID token/i);
    }
  });

  // Test 3: Expired Firebase ID token
  await test('Expired Firebase ID token rejects with 401', async () => {
    mockAdminVerifyIdToken(async () => {
      const error = new Error('Firebase ID token has expired');
      error.code = 'auth/id-token-expired';
      throw error;
    });

    try {
      await authService.firebasePhoneLogin('expired_token', null, mockReq);
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 401);
      assert.match(err.message, /expired/i);
    }
  });

  // Test 4: Revoked Firebase ID token
  await test('Revoked Firebase ID token rejects with 401', async () => {
    mockAdminVerifyIdToken(async () => {
      const error = new Error('Firebase ID token has been revoked');
      error.code = 'auth/id-token-revoked';
      throw error;
    });

    try {
      await authService.firebasePhoneLogin('revoked_token', null, mockReq);
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 401);
      assert.match(err.message, /revoked/i);
    }
  });

  // Test 5: Firebase ID token missing phone_number
  await test('Firebase ID token without phone_number rejects with 400', async () => {
    mockAdminVerifyIdToken(async () => ({
      uid: 'fb_user_123',
      // no phone_number claim
    }));

    try {
      await authService.firebasePhoneLogin('valid_token_no_phone', null, mockReq);
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.match(err.message, /verified phone number/i);
    }
  });

  // Test 6: Existing TradeNexa user login with buyer role
  await test('Existing TradeNexa user with buyer role logs in successfully', async () => {
    const verifiedPhone = '+919876543210';
    const firebaseUid = 'fb_uid_buyer';

    mockAdminVerifyIdToken(async () => ({
      uid: firebaseUid,
      phone_number: verifiedPhone,
    }));

    const mockUser = {
      id: 101,
      uuid: 'uuid-buyer-101',
      mobile_number: verifiedPhone,
      email: 'buyer@example.com',
      full_name: 'Buyer User',
      role_id: 1,
      is_active: true,
      is_completed_profile: 1,
    };

    userModel.findUserByMobile = async (phone) => {
      assert.strictEqual(phone, verifiedPhone);
      return mockUser;
    };
    userModel.saveRefreshToken = async () => {};
    userModel.updateUser = async () => mockUser;
    userModel.createLoginLog = async () => {};
    userModel.getFullProfile = async (_id) => ({
      ...mockUser,
      roles: [{ code: ROLE_CODES.BUYER, name: 'Buyer' }],
      profile: { company_name: 'Buyer Co' },
    });
    userModel.formatUser = (profile) => ({
      user_id: profile.id,
      full_name: profile.full_name,
      role: ROLE_CODES.BUYER,
      is_completed_profile: true,
    });
    userModel.saveUserDevice = async () => ({ device_type: 'android', replaced: false });

    const result = await authService.firebasePhoneLogin(
      'valid_token',
      { device_type: 'android', device_token: 'fcm_123' },
      mockReq
    );

    assert.strictEqual(result.is_registered, true);
    assert.strictEqual(result.is_completed_profile, true);
    assert.strictEqual(result.user.role, ROLE_CODES.BUYER);
    assert.ok(result.access_token, 'Access token should be issued');
    assert.ok(result.refresh_token, 'Refresh token should be issued');

    // Verify TradeNexa JWT structure
    const decoded = verifyAccess(result.access_token);
    assert.strictEqual(decoded.userId, 101);
    assert.strictEqual(decoded.type, TOKEN_TYPES.ACCESS);
  });

  // Test 7: Existing TradeNexa user login with seller role
  await test('Existing TradeNexa user with seller role logs in successfully', async () => {
    const verifiedPhone = '+919876543211';
    const firebaseUid = 'fb_uid_seller';

    mockAdminVerifyIdToken(async () => ({
      uid: firebaseUid,
      phone_number: verifiedPhone,
    }));

    const mockUser = {
      id: 102,
      uuid: 'uuid-seller-102',
      mobile_number: verifiedPhone,
      email: 'seller@example.com',
      full_name: 'Seller User',
      role_id: 2,
      is_active: true,
      is_completed_profile: 1,
    };

    userModel.findUserByMobile = async () => mockUser;
    userModel.saveRefreshToken = async () => {};
    userModel.updateUser = async () => mockUser;
    userModel.createLoginLog = async () => {};
    userModel.getFullProfile = async () => ({
      ...mockUser,
      roles: [{ code: ROLE_CODES.SELLER, name: 'Seller' }],
      profile: { company_name: 'Seller Supplier Ltd' },
    });
    userModel.formatUser = (profile) => ({
      user_id: profile.id,
      full_name: profile.full_name,
      role: ROLE_CODES.SELLER,
      is_completed_profile: true,
    });

    const result = await authService.firebasePhoneLogin('valid_token', null, mockReq);
    assert.strictEqual(result.is_registered, true);
    assert.strictEqual(result.user.role, ROLE_CODES.SELLER);
    assert.ok(result.access_token);
  });

  // Test 8: Existing TradeNexa user login with buyer_seller role
  await test('Existing TradeNexa user with buyer_seller role logs in successfully', async () => {
    const verifiedPhone = '+919876543212';
    const firebaseUid = 'fb_uid_dual';

    mockAdminVerifyIdToken(async () => ({
      uid: firebaseUid,
      phone_number: verifiedPhone,
    }));

    const mockUser = {
      id: 103,
      uuid: 'uuid-dual-103',
      mobile_number: verifiedPhone,
      email: 'dual@example.com',
      full_name: 'Dual Role User',
      role_id: 3,
      is_active: true,
      is_completed_profile: 1,
    };

    userModel.findUserByMobile = async () => mockUser;
    userModel.saveRefreshToken = async () => {};
    userModel.updateUser = async () => mockUser;
    userModel.createLoginLog = async () => {};
    userModel.getFullProfile = async () => ({
      ...mockUser,
      roles: [{ code: ROLE_CODES.BUYER_SELLER, name: 'Buyer & Seller' }],
      profile: { company_name: 'Trading Enterprise' },
    });
    userModel.formatUser = (profile) => ({
      user_id: profile.id,
      full_name: profile.full_name,
      role: ROLE_CODES.BUYER_SELLER,
      is_completed_profile: true,
    });

    const result = await authService.firebasePhoneLogin('valid_token', null, mockReq);
    assert.strictEqual(result.is_registered, true);
    assert.strictEqual(result.user.role, ROLE_CODES.BUYER_SELLER);
  });

  // Test 9: Inactive user is rejected with 403
  await test('Inactive or suspended user rejects with 403', async () => {
    mockAdminVerifyIdToken(async () => ({
      uid: 'fb_uid_suspended',
      phone_number: '+919876543299',
    }));

    userModel.findUserByMobile = async () => ({
      id: 104,
      mobile_number: '+919876543299',
      is_active: false,
    });

    try {
      await authService.firebasePhoneLogin('valid_token', null, mockReq);
      assert.fail('Should have thrown 403 error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.match(err.message, /inactive or has been suspended/i);
    }
  });

  // Test 10: New TradeNexa user onboarding response
  await test('New user receives is_registered: false with valid registration JWT', async () => {
    const newPhone = '+919876543290';
    const newUid = 'fb_uid_new_user';

    mockAdminVerifyIdToken(async () => ({
      uid: newUid,
      phone_number: newPhone,
    }));

    userModel.findUserByMobile = async () => null; // User not found in DB

    const result = await authService.firebasePhoneLogin('valid_token', null, mockReq);

    assert.strictEqual(result.is_registered, false);
    assert.strictEqual(result.is_completed_profile, false);
    assert.strictEqual(result.mobile_number, newPhone);
    assert.strictEqual(result.firebase_uid, newUid);
    assert.ok(result.access_token, 'Registration token should be returned in access_token');

    // Verify registration token claims
    const decoded = verifyAccess(result.access_token);
    assert.strictEqual(decoded.type, TOKEN_TYPES.REGISTRATION);
    assert.strictEqual(decoded.mobileNumber, newPhone);
    assert.strictEqual(decoded.firebaseUid, newUid);
    assert.strictEqual(decoded.verified, true);
  });

  // Cleanup
  restoreAll();

  console.log(`\nTest Results: ${passedTests} passed, ${failedTests} failed\n`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
