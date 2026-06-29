'use client';

import { createContext, useContext } from 'react';

// Lets a node's CTA (e.g. the Sequence node) trigger the pipeline run + see its state,
// without threading callbacks through React Flow's serialized node data.
export interface StudioActions {
  onGenerate: () => void;
  running: boolean;
  // run a single node's live action (e.g. burn subtitles) by node id
  onApply: (nodeId: string) => void;
}

export const StudioActionsContext = createContext<StudioActions>({
  onGenerate: () => {},
  running: false,
  onApply: () => {},
});

export const useStudioActions = () => useContext(StudioActionsContext);
