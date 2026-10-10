import { createContext, ReactNode, useContext } from 'react';
import { Session } from '../../types/models';
import { AudioQcControllerValue } from './audioQcTypes';
import { useAudioQcController } from './useAudioQcController';

const AudioQcContext = createContext<AudioQcControllerValue | null>(null);

type AudioQcProviderProps = {
  session: Session;
  children: ReactNode;
};

export const AudioQcProvider = ({ session, children }: AudioQcProviderProps) => {
  const value = useAudioQcController(session);
  return <AudioQcContext.Provider value={value}>{children}</AudioQcContext.Provider>;
};

export const useAudioQc = (): AudioQcControllerValue => {
  const context = useContext(AudioQcContext);
  if (!context) {
    throw new Error('useAudioQc must be used inside AudioQcProvider.');
  }
  return context;
};
