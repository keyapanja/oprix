"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/lib/projects/actions";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Person = { id: string; name: string };

export function CommentForm({ taskId, people }: { taskId: string; people: Person[] }) {
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  // `null` = not actively mentioning; otherwise the partial token typed after "@".
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches =
    query !== null
      ? people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
      : [];
  const open = query !== null && matches.length > 0;

  // Detect an "@token" being typed right before the caret.
  function sync(value: string, caret: number) {
    setBody(value);
    const m = value.slice(0, caret).match(/(?:^|\s)@(\S*)$/u);
    setQuery(m ? m[1] : null);
    setActive(0);
  }

  function insertMention(person: Person) {
    const ta = taRef.current;
    const caret = ta ? ta.selectionStart : body.length;
    const m = body.slice(0, caret).match(/(?:^|\s)@(\S*)$/u);
    if (!m) return;
    const at = caret - m[1].length - 1; // index of the "@"
    const chunk = `@${person.name} `;
    const next = body.slice(0, at) + chunk + body.slice(caret);
    setBody(next);
    setQuery(null);
    const pos = at + chunk.length;
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(matches[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery(null);
    }
  }

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await addComment(taskId, text);
      if (res.error) alert(res.error);
      else {
        setBody("");
        setQuery(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={taRef}
          value={body}
          onChange={(e) => sync(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setQuery(null), 120)}
          placeholder="Write a comment…  Type @ to mention someone"
        />
        {open && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
            {matches.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(p);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors " +
                    (i === active ? "bg-accent-soft text-accent-strong" : "text-content hover:bg-canvas")
                  }
                >
                  <span className="gradient-brand flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
