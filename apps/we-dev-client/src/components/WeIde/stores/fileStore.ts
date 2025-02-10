import { create } from "zustand";
import { getDefaultContent } from "../utils/defaultContent";
import { syncFileSystem } from "../services";

export interface ErrorMessage {
  message: string;
  code: string;
  number: number;
  severity: "error" | "warning" | "info";
}

interface FileStore {
  files: Record<string, string>;
  errors: ErrorMessage[];
  addError: (error: ErrorMessage) => void;
  removeError: (index: number) => void;
  clearErrors: () => void;
  isFirstSend: Record<string, boolean>;
  isUpdateSend: Record<string, boolean>;
  setIsFirstSend: () => void;
  setEmptyFiles: () => void;
  setIsUpdateSend: () => void;
  addFile: (
    path: string,
    content: string,
    syncFileClose?: boolean,
    number?: number
  ) => Promise<void>;
  getContent: (path: string) => string;
  updateContent: (path: string, content: string, syncFileClose?: boolean) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  getFiles: () => string[];
  setFiles: (files: Record<string, string>) => Promise<void>;
}

const initialFiles = {
  // "src/log": getDefaultContent("index.tsx"),
  "README.md": "",
//   "example-diff.tsx": `<<<<<<< SEARCH
// import React from 'react';
// import './Button.css';

// interface ButtonProps {
//   onClick: () => void;
//   label: string;
// }

// export const Button = ({ onClick, label }: ButtonProps) => {
//   return (
//     <button
//       onClick={onClick}
//       className="basic-button"
//     >
//       {label}
//     </button>
//   );
// };
// =======
// import React from 'react';
// import { motion } from 'framer-motion';
// import './Button.css';

// interface ButtonProps {
//   onClick: () => void;
//   label: string;
//   variant?: 'primary' | 'secondary';
//   isLoading?: boolean;
// }

// export const Button = ({
//   onClick,
//   label,
//   variant = 'primary',
//   isLoading = false,
// }: ButtonProps) => {
//   return (
//     <motion.button
//       whileHover={{ scale: 1.05 }}
//       whileTap={{ scale: 0.95 }}
//       onClick={onClick}
//       className={\`animated-button \${variant} \${isLoading ? 'loading' : ''}\`}
//       disabled={isLoading}
//     >
//       {isLoading ? (
//         <div className="loading-spinner" />
//       ) : (
//         label
//       )}
//     </motion.button>
//   );
// };
// >>>>>>> REPLACE`,
};

export const useFileStore = create<FileStore>((set, get) => ({
  files: initialFiles,
  errors: [],
  addError: (error) => {
    if((window as any).isLoading){
      return;
    }
    // 判断error的code是否已经有了,number增加
    if (get().errors.some((e) => e.code === error.code)) {
      const index = get().errors.findIndex((e) => e.code === error.code);
      get().errors[index].number++;
      return;
    }

    set((state) => ({
      errors: [error, ...state.errors.slice(0, 3)],
    }));
  },
  removeError: (index) =>
    set((state) => ({
      errors: state.errors.filter((_, i) => i !== index),
    })),
  clearErrors: () => set({ errors: [] }),
  isFirstSend: {},
  isUpdateSend: {},

  setIsFirstSend: () => {
    set({ isFirstSend: {} });
  },

  setIsUpdateSend: () => {
    set({ isUpdateSend: {} });
  },

  addFile: async (path, content, syncFileClose?: boolean) => {
    set({
      files: { ...get().files, [path]: content },
      isFirstSend: { ...get().isFirstSend, [path]: true },
    });
    await syncFileSystem(syncFileClose);
  },

  setEmptyFiles: () => {
    (window as any).fileHashMap = new Map<string, string>();
    set({ files: {} });
  },

  getContent: (path) => get().files[path] || "",
  

  updateContent: async (path, content, syncFileClose?: boolean) => {
    set({
      files: { ...get().files, [path]: content },
      isUpdateSend: { ...get().isUpdateSend, [path]: !get().isFirstSend[path] },
    });
    await syncFileSystem(syncFileClose);
  },

  renameFile: async (oldPath, newPath) => {
    const files = { ...get().files };
    const content = files[oldPath];
    if (content !== undefined) {
      delete files[oldPath];
      files[newPath] = content;
      set({ files });
      await syncFileSystem();
    }
  },

  deleteFile: async (path) => {
    const files = { ...get().files };
    delete files[path];
    const prefix = path.endsWith("/") ? path : `${path}/`;
    Object.keys(files).forEach((filePath) => {
      if (filePath.startsWith(prefix)) {
        delete files[filePath];
      }
    });
    set({ files });
    await syncFileSystem();
  },

  createFolder: async (path) => {
    const folderPath = path.endsWith("/") ? path : `${path}/`;
    if (Object.keys(get().files).some((file) => file.startsWith(folderPath))) {
      return;
    }
    set({ files: { ...get().files, [`${folderPath}index.tsx`]: "" } });
    await syncFileSystem();
  },
  

  setFiles: async (files: Record<string, string>) => {
    set({ files });
    await syncFileSystem();
  },

  getFiles: () => Object.keys(get().files),
}));
