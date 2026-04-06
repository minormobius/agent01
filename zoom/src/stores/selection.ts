import { create } from 'zustand';
import type { LayoutNode } from '../api/types';

interface SelectionStore {
  hovered: LayoutNode | null;
  selected: LayoutNode | null;
  setHovered: (node: LayoutNode | null) => void;
  setSelected: (node: LayoutNode | null) => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  hovered: null,
  selected: null,
  setHovered: (node) => set({ hovered: node }),
  setSelected: (node) => set({ selected: node }),
}));
