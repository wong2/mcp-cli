export const logger = new Console({ stdout: process.stderr, stderr: process.stderr });

export function prettyPrint(obj) {
  logger.dir(obj, { depth: null });
}

export function createSpinner(text) {
  return yoctoSpinner({ text, stream: process.stderr }).start();
}
