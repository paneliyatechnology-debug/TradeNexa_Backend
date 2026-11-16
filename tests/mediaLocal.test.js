const assert = require('assert');
const fs = require('fs');
const path = require('path');
const uploadConfig = require('../config/upload');
const {
  ensureDir,
  extractRelativePath,
  resolveMediaUrl,
  persistFile,
  deleteStoredFile,
} = require('../utils/media');

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
    console.error(err.stack);
    failedTests++;
  }
}

async function runSuite() {
  console.log('\n--- Running Local Media & Upload Storage Test Suite ---\n');

  // Test 1: extractRelativePath handling
  await test('extractRelativePath extracts relative path from various formats', () => {
    assert.strictEqual(
      extractRelativePath('categories/1/icon.png'),
      'categories/1/icon.png',
    );
    assert.strictEqual(
      extractRelativePath('uploads/categories/1/icon.png'),
      'categories/1/icon.png',
    );
    assert.strictEqual(
      extractRelativePath('/uploads/banners/5/banner.jpg'),
      'banners/5/banner.jpg',
    );
    assert.strictEqual(
      extractRelativePath('tradenexa/products/10/thumb.webp'),
      'products/10/thumb.webp',
    );
    assert.strictEqual(
      extractRelativePath('http://localhost:3000/uploads/products/12/img.jpg'),
      'products/12/img.jpg',
    );
    assert.strictEqual(
      extractRelativePath('https://tradenexabackend-dev.up.railway.app/media/offers/2/banner.png'),
      'offers/2/banner.png',
    );
    assert.strictEqual(
      extractRelativePath('https://t3.storageapi.dev/collected-cage-jmhqx65qp6/tradenexa/news/4/thumb.jpg'),
      'news/4/thumb.jpg',
    );
    // External third-party URLs preserved
    assert.strictEqual(
      extractRelativePath('https://lh3.googleusercontent.com/a/random-avatar-id'),
      'https://lh3.googleusercontent.com/a/random-avatar-id',
    );
  });

  // Test 2: resolveMediaUrl produces professional URLs
  await test('resolveMediaUrl formats clean professional URLs with base_url/uploads/path', () => {
    const url1 = resolveMediaUrl('banners/1/123456789.jpg');
    assert.ok(url1.includes('/uploads/banners/1/123456789.jpg'), `Expected /uploads/... in ${url1}`);

    const url2 = resolveMediaUrl('uploads/categories/5/icon.png');
    assert.ok(url2.includes('/uploads/categories/5/icon.png'), `Expected /uploads/... in ${url2}`);
    assert.ok(!url2.includes('/uploads/uploads/'), `Should not have duplicate uploads/ in ${url2}`);

    const url3 = resolveMediaUrl('https://lh3.googleusercontent.com/avatar.jpg');
    assert.strictEqual(url3, 'https://lh3.googleusercontent.com/avatar.jpg');

    assert.strictEqual(resolveMediaUrl(null), null);
    assert.strictEqual(resolveMediaUrl(''), null);
  });

  // Test 3: persistFile with buffer
  const testDir = path.join(uploadConfig.rootDir, 'test_sandbox');
  await test('persistFile saves file buffer into destination directory', async () => {
    const testRelative = 'test_sandbox/buffer_test.txt';
    const testContent = 'Hello TradeNexa Local Storage';
    const fakeFile = {
      buffer: Buffer.from(testContent, 'utf-8'),
      originalname: 'buffer_test.txt',
      mimetype: 'text/plain',
    };

    const savedRel = await persistFile(testRelative, fakeFile);
    assert.strictEqual(savedRel, testRelative);

    const fullDiskPath = path.join(uploadConfig.rootDir, testRelative);
    assert.ok(fs.existsSync(fullDiskPath), 'File should exist on disk');
    const read = fs.readFileSync(fullDiskPath, 'utf-8');
    assert.strictEqual(read, testContent);
  });

  // Test 4: persistFile moves file from inbox to destination directory
  await test('persistFile moves disk file from _inbox to target destination', async () => {
    const inboxDir = path.join(uploadConfig.rootDir, 'test_sandbox', '_inbox');
    ensureDir(inboxDir);
    const sourceDiskPath = path.join(inboxDir, 'temp_file.txt');
    fs.writeFileSync(sourceDiskPath, 'Inbox file moved to target', 'utf-8');

    const destRelative = 'test_sandbox/final/final_file.txt';
    const fakeFile = {
      path: sourceDiskPath,
      filename: 'temp_file.txt',
      originalname: 'temp_file.txt',
    };

    await persistFile(destRelative, fakeFile);

    const finalDiskPath = path.join(uploadConfig.rootDir, destRelative);
    assert.ok(fs.existsSync(finalDiskPath), 'Final file should exist');
    assert.ok(!fs.existsSync(sourceDiskPath), 'Source file in inbox should be moved away');
  });

  // Test 5: deleteStoredFile deletes from local disk
  await test('deleteStoredFile deletes file from uploads directory', async () => {
    const fileRel = 'test_sandbox/to_delete.txt';
    const diskPath = path.join(uploadConfig.rootDir, fileRel);
    fs.writeFileSync(diskPath, 'Delete me', 'utf-8');
    assert.ok(fs.existsSync(diskPath));

    await deleteStoredFile(fileRel);
    assert.ok(!fs.existsSync(diskPath), 'File should have been deleted');
  });

  // Test 6: mediaController.serveMedia serves local file
  await test('mediaController.serveMedia resolves and sends local file', async () => {
    const { serveMedia } = require('../controllers/mediaController');
    const testFileRel = 'test_sandbox/controller_test.txt';
    const testFileDisk = path.join(uploadConfig.rootDir, testFileRel);
    ensureDir(path.dirname(testFileDisk));
    fs.writeFileSync(testFileDisk, 'Controller serving test', 'utf-8');

    let sentFilePath = null;
    const req = { path: `/${testFileRel}` };
    const res = {
      sendFile: (filePath) => {
        sentFilePath = filePath;
      },
      status: () => res,
      json: () => res,
    };

    await serveMedia(req, res, () => {});
    assert.strictEqual(sentFilePath, path.resolve(testFileDisk));
  });

  // Test 7: mediaController.serveMedia returns 404 for missing file
  await test('mediaController.serveMedia returns 404 for non-existent file', async () => {
    const { serveMedia } = require('../controllers/mediaController');
    let statusCode = 200;
    let jsonBody = null;
    const req = { path: '/test_sandbox/does_not_exist.txt' };
    const res = {
      sendFile: () => {},
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (body) => {
        jsonBody = body;
        return res;
      },
    };

    await serveMedia(req, res, () => {});
    assert.strictEqual(statusCode, 404);
    assert.strictEqual(jsonBody?.success, false);
    assert.strictEqual(jsonBody?.message, 'File not found');
  });

  // Test 8: Path traversal protection
  await test('mediaController.serveMedia rejects path traversal attempts with 400', async () => {
    const { serveMedia } = require('../controllers/mediaController');
    let statusCode = 200;
    let jsonBody = null;
    const req = { path: '/../../package.json' };
    const res = {
      sendFile: () => {},
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (body) => {
        jsonBody = body;
        return res;
      },
    };

    await serveMedia(req, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonBody?.message, 'Invalid media path');
  });

  // Clean up test directory
  try {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('Failed to clean up test directory:', err.message);
  }

  console.log(`\nTest Results: ${passedTests} passed, ${failedTests} failed\n`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
