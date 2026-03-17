import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface TutorialState {
  activeKey: string | null;
  runId: number;
}

const initialState: TutorialState = {
  activeKey: null,
  runId: 0,
};

const tutorialSlice = createSlice({
  name: "tutorial",
  initialState,
  reducers: {
    startTutorial: (state, action: PayloadAction<string>) => {
      state.activeKey = action.payload;
      state.runId += 1;
    },
    clearTutorial: (state) => {
      state.activeKey = null;
    },
  },
});

export const { startTutorial, clearTutorial } = tutorialSlice.actions;
export default tutorialSlice.reducer;
