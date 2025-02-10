import React, { useRef, useState, useCallback, useEffect } from "react";
import { FileIcon, MessageSquare, Code2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { uploadImage } from "@/api/chat";
import classNames from "classnames";
import { useFileStore } from "../../../../WeIde/stores/fileStore";
import type { MentionOption } from "../MentionMenu";
import { ErrorDisplay } from "./ErrorDisplay";
import { ImagePreviewGrid } from "./ImagePreviewGrid";
import { UploadButtons } from "./UploadButtons";
import { SendButton } from "./SendButton";
import type { ChatInputProps as ChatInputPropsType } from "./types";
import { useTranslation } from "react-i18next";
import useChatModeStore from '../../../../../stores/chatModeSlice';
import useChatStore from "@/stores/chatSlice";
import useThemeStore from "@/stores/themeSlice";
// import type { ModelOption } from './UploadButtons';


export enum ChatMode {
  Chat = 'chat',
  Builder = 'builder'
}
export const modePlaceholders = {
  [ChatMode.Chat]: "chat.modePlaceholders.chat",
  [ChatMode.Builder]: "chat.modePlaceholders.builder",
}
export const ChatInput: React.FC<ChatInputPropsType> = ({
  input,
  isLoading,
  isUploading,
  uploadedImages,
  handleInputChange,
  handleKeySubmit,
  handleSubmitWithFiles,
  handleFileSelect,
  removeImage,
  addImages,
  setIsUploading,
  handleSketchUpload,
  baseModal,
  setBaseModal,
}) => {
  const { files, errors, removeError } = useFileStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sketchInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [filteredMentionOptions, setFilteredMentionOptions] = useState<
    MentionOption[]
  >([]);
  const [highlightRange, setHighlightRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [mentions, setMentions] = useState<
    Array<{ start: number; end: number; path: string }>
  >([]);
  const { mode: chatMode, setMode } = useChatModeStore();
  const { isDarkMode } = useThemeStore();

  const getFileOptions = () => {
    return Object.entries(files).map(([path]) => ({
      id: path,
      icon: <FileIcon />,
      label: path,
      path: path,
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      const cursorPosition = e.currentTarget.selectionStart;
      const mention = mentions.find((m) => m.end === cursorPosition);

      if (mention) {
        e.preventDefault();
        const newValue =
          input.slice(0, mention.start) + input.slice(mention.end);
        const event = {
          target: { value: newValue },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(event);
        setHighlightRange(null);
        setMentions(mentions.filter((m) => m !== mention));
        return;
      }
    }

    if (e.key === "Enter") {
      setHighlightRange(null);
    }

    if (showMentionMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex((prev) =>
          prev < filteredMentionOptions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (
          filteredMentionOptions.length > 0 &&
          filteredMentionOptions[selectedMentionIndex]
        ) {
          handleMentionSelect(filteredMentionOptions[selectedMentionIndex]);
        }
      } else if (e.key === "Escape") {
        setShowMentionMenu(false);
      }
    } else {
      handleKeySubmit(e);
    }
  };

  const debounce = (fn: Function, delay: number) => {
    let timer: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  const getCursorPosition = (textarea: HTMLTextAreaElement) => {
    const style = window.getComputedStyle(textarea);
    const pos = textarea.selectionStart || 0;

    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    div.style.width = style.width;
    div.style.padding = style.padding;
    div.style.font = style.font;
    div.style.lineHeight = style.lineHeight;

    const textBeforeCursor = textarea.value.substring(0, pos);
    const textAfterCursor = textarea.value.substring(pos);

    const beforeNode = document.createTextNode(textBeforeCursor);
    div.appendChild(beforeNode);

    const cursorNode = document.createElement("span");
    cursorNode.textContent = "|";
    div.appendChild(cursorNode);

    const afterNode = document.createTextNode(textAfterCursor);
    div.appendChild(afterNode);

    document.body.appendChild(div);

    const cursorRect = cursorNode.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();

    document.body.removeChild(div);

    const relativeTop = cursorRect.top - textareaRect.top + textarea.scrollTop;
    const relativeLeft = cursorRect.left - textareaRect.left;

    const maxTop = textarea.offsetHeight - 200;
    const adjustedTop = Math.min(relativeTop, maxTop);

    return {
      left: relativeLeft,
      top: adjustedTop,
      height: parseFloat(style.lineHeight) || 20,
    };
  };

  const updateMentionPosition = useCallback(() => {
    if (!showMentionMenu || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const { left, top, height } = getCursorPosition(textarea);
    const textareaRect = textarea.getBoundingClientRect();
    const menuWidth = 200;

    const adjustedLeft = Math.min(left, textareaRect.width - menuWidth - 10);

    setMentionPosition({
      top: top + height,
      left: adjustedLeft,
    });
  }, [showMentionMenu]);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const oldValue = input;
      handleInputChange(e);

      if (newValue.length < oldValue.length) {
        const deletedStart = e.target.selectionStart;
        const mention = mentions.find(
          (m) => deletedStart > m.start && deletedStart < m.end
        );

        if (mention) {
          e.preventDefault();
          return;
        }

        const diff = oldValue.length - newValue.length;
        const updatedMentions = mentions.map((m) => {
          if (m.start > deletedStart) {
            return {
              ...m,
              start: m.start - diff,
              end: m.end - diff,
            };
          }
          return m;
        });
        setMentions(updatedMentions);
      }

      const lastAtIndex = newValue.lastIndexOf("@");
      const textAfterLastAt = newValue.substring(lastAtIndex + 1);

      if (lastAtIndex !== -1 && !textAfterLastAt.includes(" ")) {
        const searchTerm = textAfterLastAt.toLowerCase();
        const fileOptions = getFileOptions();
        const filteredOptions = fileOptions.filter(
          (option) =>
            option.label.toLowerCase().includes(searchTerm) ||
            option.path?.toLowerCase().includes(searchTerm)
        );

        if (filteredOptions.length > 0) {
          updateMentionPosition();
          setFilteredMentionOptions(filteredOptions);
          setShowMentionMenu(true);
          setSelectedMentionIndex(0);
        } else {
          setShowMentionMenu(false);
        }
      } else {
        setShowMentionMenu(false);
      }
    },
    [input, mentions, handleInputChange, updateMentionPosition]
  );

  const handleMentionSelect = (option: MentionOption) => {
    const textarea = textareaRef.current;
    if (!textarea || !option.path) return;

    const cursorPosition = textarea.selectionEnd;
    const textBeforeCursor = textarea.value.substring(0, cursorPosition);
    const textAfterCursor = textarea.value.substring(cursorPosition);

    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    if (lastAtIndex === -1) return;

    const mentionText = `@${option.path} `;
    const newValue =
      textBeforeCursor.substring(0, lastAtIndex) +
      mentionText +
      textAfterCursor;

    const newMention = {
      start: lastAtIndex,
      end: lastAtIndex + mentionText.length,
      path: option.path,
    };
    setMentions([...mentions, newMention]);

    setHighlightRange({
      start: lastAtIndex,
      end: lastAtIndex + (option.path?.length || 0) + 1,
    });

    const event = {
      target: { value: newValue },
    } as React.ChangeEvent<HTMLTextAreaElement>;

    handleInputChange(event);
    setShowMentionMenu(false);
  };

  const handlePaste = async (e: ClipboardEvent) => {
    console.log(baseModal,'useImage')
    if(!baseModal.useImage) return;
    if (isUploading) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter(
      (item) => item.type.indexOf("image") !== -1
    );

    if (imageItems.length > 0) {
      e.preventDefault();
      setIsUploading(true);

      try {
        const uploadResults = await Promise.all(
          imageItems.map(async (item) => {
            const file = item.getAsFile();
            if (!file) throw new Error("Failed to get file from clipboard");

            const url = await uploadImage(file);
            return {
              id: crypto.randomUUID(),
              file,
              url,
              localUrl: URL.createObjectURL(file),
              status: "done" as const,
            };
          })
        );

        addImages(uploadResults);

        if (uploadResults.length === 1) {
          toast.success("Image pasted successfully");
        } else {
          toast.success(`${uploadResults.length} images pasted successfully`);
        }
      } catch (error) {
        console.error("Failed to upload pasted images:", error);
        toast.error("Failed to upload pasted images");
      } finally {
        setIsUploading(false);
      }
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener("paste", handlePaste);
    return () => {
      textarea.removeEventListener("paste", handlePaste);
    };
  }, [isUploading,baseModal?.label]);

  useEffect(() => {
    if (showMentionMenu) {
      updateMentionPosition();
    }
  }, [input, showMentionMenu, updateMentionPosition]);

  useEffect(() => {
    const handleResize = debounce(() => {
      if (showMentionMenu) {
        updateMentionPosition();
      }
    }, 100);

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [showMentionMenu, updateMentionPosition]);

  return (
    <div className="px-1 py-2 ">
      <div className="max-w-[640px] w-full mx-auto bg-transparent dark:bg-[rgba(30,30,30)]">
        <ErrorDisplay
          errors={errors}
          onAttemptFix={async (error, index) => {
            const errorText = `Please help me fix this error:\n${error.code}`;
            await handleSubmitWithFiles(null, errorText);
            removeError(index);
          }}
          onRemoveError={removeError}
        />

        <ImagePreviewGrid
          uploadedImages={uploadedImages}
          onRemoveImage={removeImage}
        />

        <div className="relative bg-transparent dark:bg-[rgba(40,40,40)] rounded-lg border border-gray-600/30">
          <div
            className={classNames(
              "relative",
              isUploading && "opacity-50 pointer-events-none"
            )}
          >
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-400 border-t-transparent"></div>
              </div>
            )}
            <div className="relative ">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={onInputChange}
                onKeyDown={handleKeyDown}
                placeholder={t(
                  chatMode === ChatMode.Chat
                    ? t(modePlaceholders[ChatMode.Chat])
                    : t(modePlaceholders[ChatMode.Builder])
                )}
                className={classNames(
                  "w-full p-4 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none resize-none text-sm",
                  "placeholder-gray-500 dark:placeholder-gray-400",
                  "hover:bg-gray-50/50 dark:hover:bg-white/[0.03]",
                  "focus:bg-gray-50/80 dark:focus:bg-white/[0.05]",
                  "transition-colors duration-200",
                  "relative z-10",
                  isLoading && "opacity-50"
                )}
                rows={3}
                style={{
                  minHeight: "60px",
                  maxHeight: "200px",
                  caretColor: isDarkMode ? "white" : "black",
                }}
                disabled={isLoading}
              />

              {highlightRange && (
                <div
                  className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none p-4 text-sm whitespace-pre-wrap break-words"
                  style={{
                    fontFamily: "inherit",
                    lineHeight: "inherit",
                    overflow: "hidden",
                  }}
                >
                  <span className="invisible">
                    {input.substring(0, highlightRange.start)}
                  </span>
                  <span className="bg-blue-500/20 text-transparent">
                    {input.substring(highlightRange.start, highlightRange.end)}
                  </span>
                  <span className="invisible">
                    {input.substring(highlightRange.end)}
                  </span>
                </div>
              )}
            </div>

            {showMentionMenu && (
              <div
                className="absolute z-50 transition-all duration-100"
                style={{
                  top: `${mentionPosition.top + 100}px`,
                  left: `${mentionPosition.left + 40}px`,
                  maxHeight: "200px",
                  width: "200px",
                }}
              >
                <div className="dark:bg-[#1c1c1c] bg-transparent rounded-md border border-gray-600/30 shadow-lg overflow-hidden">
                  <div className="max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600/50 scrollbar-track-transparent">
                    {filteredMentionOptions.map((option, index) => (
                      <div
                        key={option.id}
                        className={classNames(
                          "px-2 py-1.5 flex items-center gap-2 text-xs cursor-pointer",
                          selectedMentionIndex === index
                            ? "bg-blue-500/20 text-blue-400"
                            : "text-gray-300 hover:bg-gray-700/30"
                        )}
                        onClick={() => handleMentionSelect(option)}
                        ref={
                          index === selectedMentionIndex
                            ? (el) => {
                                if (el) {
                                  el.scrollIntoView({ block: "nearest" });
                                }
                              }
                            : null
                        }
                      >
                        {option.icon}
                        <span className="truncate">{option.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between px-2 py-2 border-t border-gray-600/30">
              <div className="flex items-center gap-2">
                <UploadButtons
                  isLoading={isLoading}
                  isUploading={isUploading}
                  baseModal={baseModal}
                  setBaseModal={setBaseModal}
                  onImageClick={() => fileInputRef.current?.click()}
                  onSketchClick={() => sketchInputRef.current?.click()}
                />
                
                <button
                  className={classNames(
                    "p-2 rounded-md transition-colors",
                    "hover:bg-gray-700/30",
                    "group relative"
                  )}
                  onClick={() => {
                    setMode(
                      chatMode === ChatMode.Chat ? ChatMode.Builder : ChatMode.Chat
                    );
                  }}
                >
                  {chatMode === ChatMode.Chat ? (
                    <MessageSquare 
                      className={classNames(
                        "w-4 h-4",
                        "text-blue-400"
                      )} 
                    />
                  ) : (
                    <Code2 
                      className={classNames(
                        "w-4 h-4",
                        "text-blue-400"
                      )} 
                    />
                  )}
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-gray-800 text-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {chatMode}
                  </span>
                </button>
              </div>

              <SendButton
                isLoading={isLoading}
                isUploading={isUploading}
                hasInput={!!input.trim()}
                hasUploadingImages={uploadedImages.some(
                  (img) => img.status === "uploading"
                )}
                onClick={handleSubmitWithFiles}
              />
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          multiple
          accept="image/*"
        />

        <input
          ref={sketchInputRef}
          type="file"
          onChange={handleSketchUpload}
          className="hidden"
          accept=".sketch"
        />
      </div>
    </div>
  );
};
