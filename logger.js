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
    let output = `[${timestamp}] [${level.toUpperCase()}]:`;
    args.forEach(arg => {
      if (typeof arg === 'object') {
        output += ` ${JSON.stringify(arg)}`;
      } else {
        output += ` ${arg}`;
      }
    });
    console.log(output);
  }
}

export default new SimpleLogger();
