const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const DATA_DIR = process.env.BLU_DATA_DIR
  || process.env.DATA_DIR
  || process.env.RAILWAY_VOLUME_MOUNT_PATH
  || path.join(ROOT_DIR, "data");

const UPLOAD_DIR = process.env.BLU_UPLOAD_DIR || path.join(DATA_DIR, "uploads");
const OUTPUT_DIR = process.env.BLU_OUTPUT_DIR || path.join(DATA_DIR, "outputs");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureRuntimeDirs() {
  ensureDir(DATA_DIR);
  ensureDir(UPLOAD_DIR);
  ensureDir(OUTPUT_DIR);
}

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  UPLOAD_DIR,
  OUTPUT_DIR,
  ensureDir,
  ensureRuntimeDirs
};
