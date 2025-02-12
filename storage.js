import fs from 'fs';

class SimpleStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};

    // Попытка загрузить данные из файла при старте
    if (fs.existsSync(this.filePath)) {
      const fileContent = fs.readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(fileContent);
    }
  }

  // Сохранение данных в файл
  _saveToFile() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  // Метод для получения значения по ключу
  getItem(key) {
    return this.data[key] !== undefined ? this.data[key] : null;
  }

  // Метод для сохранения значения по ключу
  setItem(key, value) {
    this.data[key] = value;
    this._saveToFile();
  }

  // Метод для удаления элемента по ключу
  removeItem(key) {
    delete this.data[key];
    this._saveToFile();
  }

  // Метод для очистки всех данных
  clear() {
    this.data = {};
    this._saveToFile();
  }

  // Проверка на существование ключа
  hasItem(key) {
    return this.data.hasOwnProperty(key);
  }
}

// Экспортируем класс как named export
export default SimpleStorage;
