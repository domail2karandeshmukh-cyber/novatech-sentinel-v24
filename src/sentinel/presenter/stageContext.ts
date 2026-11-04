import { createContext, useContext } from 'react';

/** True inside the projector stage (audience window or one-screen stage): pages hide anything private there. */
export const OnStage = createContext(false);
export const useOnStage = () => useContext(OnStage);
