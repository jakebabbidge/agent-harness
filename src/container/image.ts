import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Dockerode from 'dockerode';

/** Docker image name used by agent-harness containers. */
export const IMAGE_NAME = 'agent-harness:latest';

/** Path to the docker/ directory containing the Dockerfile. */
const DOCKERFILE_DIR = path.resolve(
  fileURLToPath(import.meta.url),
  '../../../docker',
);

/**
 * Ensure the agent-harness Docker image exists.
 * If the image is already built, this is a no-op.
 * If the image is missing, it builds from docker/Dockerfile.
 */
export async function ensureImage(docker: Dockerode): Promise<void> {
  try {
    await docker.getImage(IMAGE_NAME).inspect();
    // Image already exists
    return;
  } catch (err: unknown) {
    // Image not found — build it
    if (
      !(
        err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 404
      )
    ) {
      throw err;
    }
  }

  console.log('[agent-harness] Building container image agent-harness:latest...');

  await new Promise<void>((resolve, reject) => {
    execFile(
      'docker',
      ['build', '-t', IMAGE_NAME, DOCKERFILE_DIR],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`Image build failed: ${stderr || error.message}`));
          return;
        }
        console.log('[agent-harness] Image built successfully.');
        resolve();
      },
    );
  });
}
