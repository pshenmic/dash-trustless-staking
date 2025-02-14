import fs from 'fs';

class SimpleStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};

    if (fs.existsSync(this.filePath)) {
      const fileContent = fs.readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(fileContent);
    }
  }

  _saveToFile() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  getItem(key) {
    return this.data[key] !== undefined ? this.data[key] : null;
  }

  setItem(key, value) {
    this.data[key] = value;
    this._saveToFile();
  }

  removeItem(key) {
    delete this.data[key];
    this._saveToFile();
  }

  clear() {
    this.data = {};
    this._saveToFile();
  }

  hasItem(key) {
    return this.data.hasOwnProperty(key);
  }
}

export default SimpleStorage;
