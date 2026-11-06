import { emitKeypressEvents } from 'node:readline';

/** Console-only secret input: characters are never echoed or logged. */
export async function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw Error('Interactive terminal required. Use Bootstrap.ps1 or set ADMIN_PASSWORD securely.');
  }
  const input = process.stdin;
  const wasRaw = input.isRaw;
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = '';
    function finish(error?: Error) {
      input.removeListener('keypress', onKey);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    }
    function onKey(text: string, key: { name?: string; ctrl?: boolean; meta?: boolean }) {
      if (key?.ctrl && key.name === 'c') return finish(Error('Bootstrap cancelled.'));
      if (key?.name === 'return' || key?.name === 'enter') return finish();
      if (key?.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (text && !key?.ctrl && !key?.meta && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    }
    input.on('keypress', onKey);
  });
}
