const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { pool } = require('../db/index');

const CATEGORIES = ['images', 'videos', 'audio', 'voice'];
const MAX_SAMPLE = 50;

function parseMediaPath(mediaUrl) {
  if (!mediaUrl) return null;

  let pathname = null;
  try {
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      pathname = new URL(mediaUrl).pathname;
    } else {
      pathname = mediaUrl;
    }
  } catch {
    pathname = mediaUrl;
  }

  if (!pathname.startsWith('/uploads/')) return null;
  const relative = pathname.replace(/^\/uploads\//, '');
  const [category, ...rest] = relative.split('/');
  const fileName = rest.join('/');
  if (!CATEGORIES.includes(category) || !fileName) return null;

  return {
    key: `${category}/${fileName}`,
    category,
    fileName
  };
}

function listUploadFiles(uploadRoot) {
  const files = [];
  for (const category of CATEGORIES) {
    const categoryPath = path.join(uploadRoot, category);
    if (!fs.existsSync(categoryPath)) continue;

    const names = fs.readdirSync(categoryPath, { withFileTypes: true });
    for (const entry of names) {
      if (!entry.isFile()) continue;
      files.push({
        key: `${category}/${entry.name}`,
        category,
        fileName: entry.name,
        absolutePath: path.join(categoryPath, entry.name)
      });
    }
  }
  return files;
}

async function run() {
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
  console.log(`[integrity] upload root: ${uploadRoot}`);

  const dbResult = await pool.query(`
    SELECT id, media_url
    FROM messages
    WHERE media_url IS NOT NULL
      AND media_url <> ''
      AND is_deleted = false
  `);

  const dbRefs = [];
  for (const row of dbResult.rows) {
    const parsed = parseMediaPath(row.media_url);
    if (!parsed) continue;
    dbRefs.push({
      messageId: row.id,
      mediaUrl: row.media_url,
      ...parsed
    });
  }

  const dbKeys = new Set(dbRefs.map(ref => ref.key));
  const diskFiles = listUploadFiles(uploadRoot);
  const diskKeys = new Set(diskFiles.map(file => file.key));

  const missingOnDisk = dbRefs.filter(ref => !diskKeys.has(ref.key));
  const orphanOnDisk = diskFiles.filter(file => !dbKeys.has(file.key));

  console.log(`[integrity] db references: ${dbRefs.length}`);
  console.log(`[integrity] disk files: ${diskFiles.length}`);
  console.log(`[integrity] missing on disk: ${missingOnDisk.length}`);
  console.log(`[integrity] orphan on disk: ${orphanOnDisk.length}`);

  if (missingOnDisk.length > 0) {
    console.log('\nMissing on disk (sample):');
    missingOnDisk.slice(0, MAX_SAMPLE).forEach(item => {
      console.log(`- message=${item.messageId} expected=${item.key} url=${item.mediaUrl}`);
    });
  }

  if (orphanOnDisk.length > 0) {
    console.log('\nOrphan on disk (sample):');
    orphanOnDisk.slice(0, MAX_SAMPLE).forEach(item => {
      console.log(`- ${item.key} (${item.absolutePath})`);
    });
  }

  await pool.end();
  process.exit(missingOnDisk.length > 0 ? 2 : 0);
}

run().catch(async (error) => {
  console.error('[integrity] failed:', error);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
