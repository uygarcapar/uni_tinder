/**
 * Ortam bağlı sarmalayıcılar. Saf sözleşme `emailFormat.ts`te ve orada
 * testleniyor — bu dosya yalnız varsayılanları (domain, runId) dolduruyor.
 */
import { EMAIL_DOMAIN, RUN_ID } from '../support/env';
import {
  buildDisplayName,
  buildEmail,
  buildInstallationId,
  buildPassword,
} from './emailFormat';

export function freshEmail(seed: number, slot = 0, runId: string = RUN_ID): string {
  return buildEmail(EMAIL_DOMAIN, runId, seed, slot);
}

export function displayNameFor(seed: number, slot = 0, runId: string = RUN_ID): string {
  return buildDisplayName(runId, seed, slot);
}

export function installationIdFor(seed: number, slot = 0, runId: string = RUN_ID): string {
  return buildInstallationId(runId, seed, slot);
}

export function passwordFor(seed: number, slot = 0): string {
  return buildPassword(seed, slot);
}
