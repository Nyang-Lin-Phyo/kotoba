import { createContext, useContext } from 'react';
import type { ProfileState } from '../../shared/contracts';

export type ProfileContextValue = {
  readonly state: ProfileState;
  readonly reload: () => Promise<void>;
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (value === null) {
    throw new Error('useProfile must be used inside the profile shell');
  }
  return value;
}
