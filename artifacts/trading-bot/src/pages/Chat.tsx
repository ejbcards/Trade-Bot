import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Trash2,
  Plus,
  Send,
  Loader2,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import {
  useListAnthropicConversations,
  useCreateAnthropicConversation,
  useDeleteAnthropicConversation,
  useGetAnthropicConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAnthropicConversationsQueryKey } from "@workspace/api-client-react";
import type { AnthropicMessage } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessageBubble({
  msg,
  streaming,
}: {
  msg: AnthropicMessage | { role: string; content: string; id: number; conversationId: number; createdAt: string };
  streaming?: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <div
      className={cn(
        "flex gap-3 mb-4",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
          style={{ background: "hsl(43 55% 52%)", color: "#1a1a1a" }}
        >
          M
        </div>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        {streaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-current opacity-70 animate-pulse rounded-sm" />
        )}
        <p
          className={cn(
            "text-[10px] mt-1 opacity-50",
            isUser ? "text-right" : "text-left",
          )}
        >
          {formatTime(msg.createdAt)}
        </p>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0 text-xs font-bold text-foreground">
          You
        </div>
      )}
    </div>
  );
}

export default function Chat() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: convos = [], isLoading: loadingConvos } =
    useListAnthropicConversations();
  const { data: activeConvo, isLoading: loadingConvo } =
    useGetAnthropicConversation(activeId ?? 0, {
      query: {
        queryKey: [`/api/anthropic/conversations/${activeId ?? 0}`],
        enabled: activeId !== null,
      },
    });

  const createConvo = useCreateAnthropicConversation({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
        setActiveId(data.id);
      },
    },
  });

  const deleteConvo = useDeleteAnthropicConversation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
        setActiveId(null);
      },
    },
  });

  const messages = activeConvo?.messages ?? [];

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streamingContent, scrollToBottom]);

  const handleNewChat = () => {
    const title = `Chat ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    createConvo.mutate({ data: { title } });
  };

  const handleSend = async () => {
    if (!input.trim() || !activeId || streaming) return;
    const content = input.trim();
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    const userMsg: AnthropicMessage = {
      id: Date.now(),
      conversationId: activeId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    qc.setQueryData(
      [`/api/anthropic/conversations/${activeId}`],
      (old: typeof activeConvo) =>
        old
          ? { ...old, messages: [...(old.messages ?? []), userMsg] }
          : old,
    );

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(
        `${BASE}/api/anthropic/conversations/${activeId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: ctrl.signal,
        },
      );

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as {
              type: string;
              text?: string;
              content?: string;
              error?: string;
            };
            if (parsed.type === "delta" && parsed.text) {
              assembled += parsed.text;
              setStreamingContent(assembled);
              scrollToBottom();
            } else if (parsed.type === "done") {
              setStreamingContent("");
              await qc.invalidateQueries({
                queryKey: [`/api/anthropic/conversations/${activeId}`],
              });
            } else if (parsed.type === "error") {
              console.error("Stream error:", parsed.error);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error(err);
      }
    } finally {
      setStreaming(false);
      setStreamingContent("");
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AppLayout fullHeight>
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r bg-sidebar flex flex-col flex-shrink-0">
        <div className="p-3 border-b">
          <Button
            className="w-full gap-2"
            size="sm"
            onClick={handleNewChat}
            disabled={createConvo.isPending}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingConvos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : convos.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 px-2">
                No conversations yet. Start a new chat!
              </p>
            ) : (
              convos.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-sm transition-colors",
                    activeId === c.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                  onClick={() => setActiveId(c.id)}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                  <span className="flex-1 truncate text-xs">{c.title}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConvo.mutate({ id: c.id });
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeId === null ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-8">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold shadow-lg"
              style={{ background: "hsl(43 55% 52%)", color: "#1a1a1a" }}
            >
              M
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Talk to the Moose</h2>
              <p className="text-muted-foreground text-sm max-w-sm">
                Ask about your portfolio, positions, P&L, or get trading
                insights. The Moose knows your live account data.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {[
                "How are my positions doing today?",
                "What's my daily P&L so far?",
                "Is the bot running? What's it doing?",
                "Any risky positions I should know about?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  className="text-left text-sm px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-accent transition-colors flex items-center justify-between gap-2 group"
                  onClick={async () => {
                    const title = `Chat ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
                    const convo = await new Promise<{ id: number }>((resolve) => {
                      createConvo.mutate(
                        { data: { title } },
                        { onSuccess: resolve },
                      );
                    });
                    setActiveId(convo.id);
                    setInput(prompt);
                  }}
                >
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                    {prompt}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
            <Button onClick={handleNewChat} disabled={createConvo.isPending}>
              <Plus className="w-4 h-4 mr-2" />
              Start a New Chat
            </Button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-14 border-b flex items-center px-4 gap-3 flex-shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "hsl(43 55% 52%)", color: "#1a1a1a" }}
              >
                M
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">
                  {convos.find((c) => c.id === activeId)?.title ?? "The Moose"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Context-aware · Live portfolio data
                </p>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1" ref={scrollRef as React.RefObject<typeof ScrollArea & HTMLDivElement>}>
              <div className="p-4">
                {loadingConvo ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 && !streaming ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Send a message to start the conversation.
                  </div>
                ) : (
                  <>
                    {messages.map((m) => (
                      <MessageBubble key={m.id} msg={m} />
                    ))}
                    {streaming && streamingContent && (
                      <MessageBubble
                        msg={{
                          id: -1,
                          conversationId: activeId,
                          role: "assistant",
                          content: streamingContent,
                          createdAt: new Date().toISOString(),
                        }}
                        streaming
                      />
                    )}
                    {streaming && !streamingContent && (
                      <div className="flex gap-3 mb-4">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: "hsl(43 55% 52%)", color: "#1a1a1a" }}
                        >
                          M
                        </div>
                        <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t p-4 flex-shrink-0">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the Moose anything…"
                  disabled={streaming}
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  size="icon"
                >
                  {streaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                The Moose has real-time access to your positions, P&L, and bot
                state.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
    </AppLayout>
  );
}
