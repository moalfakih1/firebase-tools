import { readFile } from "node:fs/promises";
import * as crypto from "crypto";
import { Backend, Endpoint } from "../backend";

/**
 * Generates a hash from the environment variables of a {@link Backend}.
 * @param backend Backend of a set of functions
 */
export function getEnvironmentVariablesHash(backend: Backend): string {
  const hash = crypto.createHash("sha256");

  // Hash the contents of the dotenv variables
  const hasEnvironmentVariables = !!Object.keys(backend.environmentVariables).length;
  if (hasEnvironmentVariables) {
    hash.update(JSON.stringify(backend.environmentVariables));
  }

  return hash.digest("hex");
}

/**
 * Retrieves the unique hash given a pathToGeneratedPackageFile.
 * @param pathToGeneratedPackageFile Packaged file contents of functions
 */
export async function getSourceHash(pathToGeneratedPackageFile?: string): Promise<string> {
  const hash = crypto.createHash("sha256");

  // If present, hash the contents of the source file
  if (pathToGeneratedPackageFile) {
    const data = await readFile(pathToGeneratedPackageFile);
    hash.update(data);
  }

  return hash.digest("hex");
}

/**
 * Retrieves a hash generated from the secrets of an {@link Endpoint}.
 * @param endpoint Endpoint
 */
export function getSecretsHash(endpoint: Endpoint): string {
  const hash = crypto.createHash("sha256");

  // Hash the secret versions.
  const secretVersions = getSecretVersions(endpoint);
  const hasSecretVersions = !!Object.keys(secretVersions).length;
  if (hasSecretVersions) {
    hash.update(JSON.stringify(secretVersions));
  }

  return hash.digest("hex");
}

/**
 * Generates a unique hash derived from the hashes generated from the
 * package source, environment variables, and endpoint secrets.
 * @param sourceHash
 * @param envHash
 * @param secretsHash
 */
export function getEndpointHash(sourceHash: string, envHash: string, secretsHash: string): string {
  const hash = crypto.createHash("sha256");

  const combined = [envHash, sourceHash, secretsHash].join("");
  hash.update(combined);

  return hash.digest("hex");
}

// Hash the secret versions.
/**
 * Generates an object mapping secret's with their versions.
 * @param endpoint
 */
function getSecretVersions(endpoint: Endpoint): Record<string, string> {
  return (endpoint.secretEnvironmentVariables || []).reduce((memo, { secret, version }) => {
    if (version) {
      memo[secret] = version;
    }
    return memo;
  }, {} as Record<string, string>);
}