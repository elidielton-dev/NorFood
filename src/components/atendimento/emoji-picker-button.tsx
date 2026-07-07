import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GestaoButton } from "@/components/painel/gestao-ui";

const QUICK_EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😅",
  "😂",
  "🤣",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😉",
  "😎",
  "🤔",
  "😮",
  "😢",
  "😭",
  "😡",
  "🥳",
  "👍",
  "👎",
  "👏",
  "🙏",
  "🙌",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🔥",
  "✨",
  "🎉",
  "✅",
  "❌",
  "🍰",
  "🎂",
  "☕",
  "🍯",
  "🐝",
];

export function EmojiPickerButton({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <GestaoButton
          type="button"
          variant="secondary"
          className="shrink-0 px-3"
          disabled={disabled}
          aria-label="Inserir emoji"
        >
          <Smile className="size-4" />
        </GestaoButton>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-auto max-w-[280px] p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-md p-1.5 text-xl transition hover:bg-muted"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
