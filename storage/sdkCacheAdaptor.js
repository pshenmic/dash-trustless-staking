import os from "os";
import path from "path";
import {BASE_DIR_NAME, CACHE_FILENAME} from "./constants.js";
import fs from "fs";
import SimpleStorage from "./storage.js";

const homedir = os.homedir();
const baseDir = path.join(homedir, BASE_DIR_NAME);
const cachePath = path.join(baseDir, CACHE_FILENAME);

if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true });
}

const sdkCacheAdaptor = new SimpleStorage(cachePath);

export default sdkCacheAdaptor;
