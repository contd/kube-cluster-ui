import path from 'node:path';

/** Parses a kubectl command line into arguments without invoking a shell. */
export function parseKubectlCommand(command: string): string[] {
  const args: string[] = [];
  let token = '';
  let quote = '';
  let escaped = false;
  let tokenStarted = false;

  for (const character of command.trim()) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }

    if (character === '\\' && quote !== "'") {
      escaped = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = '';
      } else {
        token += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
    } else if (/\s/.test(character)) {
      if (tokenStarted) {
        args.push(token);
        token = '';
        tokenStarted = false;
      }
    } else {
      token += character;
      tokenStarted = true;
    }
  }

  if (escaped || quote) {
    throw new Error('The command contains an unfinished quote or escape.');
  }
  if (tokenStarted) {
    args.push(token);
  }

  const commandName = path.basename(args[0] || '').toLowerCase();
  const hasKubectlPrefix = ['kubectl', 'kubectl.exe', 'k'].includes(commandName);
  if (hasKubectlPrefix) {
    args.shift();
  }
  if (!args.length && !hasKubectlPrefix) {
    throw new Error('Enter a kubectl command to run.');
  }
  if (args.some((arg) =>
    arg === '--context' || arg.startsWith('--context=') ||
    arg === '--kubeconfig' || arg.startsWith('--kubeconfig='))) {
    throw new Error('The selected context and kubeconfig are applied automatically.');
  }

  return args;
}