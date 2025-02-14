class SimpleLogger {
  log(...args) {
    this._output('log', args);
  }

  info(...args) {
    this._output('info', args);
  }

  warn(...args) {
    this._output('warn', args);
  }

  error(...args) {
    this._output('error', args);
  }

  _output(level, args) {
    const timestamp = new Date().toISOString();
    let prefix = `[${timestamp}] [${level.toUpperCase()}]:`;
    console.log(prefix, ...args);
  }
}

export default new SimpleLogger();
