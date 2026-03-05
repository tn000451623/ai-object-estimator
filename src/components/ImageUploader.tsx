import { Upload, X, Image as ImageIcon } from "lucide-react";
import { useCallback, useState, DragEvent, MouseEvent, useRef } from "react";
import { cn } from "../lib/utils";

interface ImageUploaderProps {
  onImagesSelect: (files: File[], base64s: string[]) => void;
  className?: string;
}

export function ImageUploader({ onImagesSelect, className }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    async (files: File[]) => {
      const validFiles = files.filter((f) => f.type.startsWith("image/"));
      if (validFiles.length === 0) {
        alert("請上傳圖片檔案");
        return;
      }

      const base64Promises = validFiles.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            // Remove data URL prefix for API
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.readAsDataURL(file);
        });
      });

      const base64s = await Promise.all(base64Promises);
      onImagesSelect(validFiles, base64s);
    },
    [onImagesSelect]
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(Array.from(e.dataTransfer.files));
      }
    },
    [processFiles]
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl transition-colors cursor-pointer overflow-hidden bg-slate-50 hover:bg-slate-100",
        isDragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300",
        className
      )}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        id="file-upload-v2"
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(Array.from(e.target.files));
          }
        }}
      />

      <div className="flex flex-col items-center justify-center text-slate-500">
        <Upload size={32} className="mb-3 text-slate-400" />
        <p className="text-sm font-medium">點擊或拖曳圖片至此上傳</p>
        <p className="text-xs mt-1 text-slate-400">支援一次上傳多張圖片</p>
      </div>
    </div>
  );
}
