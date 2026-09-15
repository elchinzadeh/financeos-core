import type { BankProfile } from './bank-profile.interface.js';
import { LeobankProfile } from './leobank.profile.js';

export const BANK_PROFILES: Record<string, BankProfile> = {
  [LeobankProfile.id]: LeobankProfile,
};

export const BANK_PROFILE_IDS = Object.keys(BANK_PROFILES);
