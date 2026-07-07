"use client";

import React, { useEffect, useState, useRef } from "react";
import { getSocket } from "@/lib/socket";

export default function RideChat({ rideId }: { rideId: string }) {
  const [messages, setMessages] = useState<{ text: string; from: string; timestamp: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [inRoom, setInRoom] = useState(false);

  // Keep a ref to messages so callbacks can persist without stale closure
  const messagesRef = useRef(messages);

  useEffect(() => {
    if (!rideId) return;

    const s = getSocket();

    const requestNotificationPermission = () => {
      if (typeof window === "undefined" || typeof window.Notification === "undefined") return;
      if (window.Notification.permission === "default") {
        window.Notification.requestPermission().catch(() => undefined);
      }
    };

    requestNotificationPermission();

    // Rehydrate messages from sessionStorage so chat survives refresh
    try {
      const key = `rideChat_${rideId}`;
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch (e) {
      // ignore
    }

    // Ensure we join the ride room for messages
    try {
      s.emit('joinRide', { rideId, meta: {} });
    } catch {}
    
    // Track connection status
    const handleConnect = () => {
      console.log("RideChat: Socket connected", s.id);
      setConnected(true);
    };

    const handleDisconnect = (reason: string) => {
      console.log("RideChat: Socket disconnected", reason);
      setConnected(false);
      setInRoom(false);
    };

    if (s.connected) {
      setConnected(true);
    }

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    setInRoom(true);

    // Listen for messages in this room
    const onMessage = (msg: any) => {
      if (msg.from === s.id) {
        console.debug("RideChat: ignoring own echoed message", msg);
        return;
      }

      const fromLabel = msg.fromLabel ||
        (msg.fromRole === 'DRIVER' ? 'Driver' : msg.fromRole === 'PASSENGER' ? 'Passenger' : msg.from || 'Other');

      console.log("RideChat: received message", { ...msg, fromLabel });
      setMessages((prev) => [
        ...prev,
        {
          text: msg.text || String(msg),
          from: fromLabel,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      // persist
      try {
        const key = `rideChat_${rideId}`;
        const next = (messagesRef.current = (messagesRef.current || []).concat({ text: msg.text || String(msg), from: fromLabel, timestamp: new Date().toLocaleTimeString() }));
        if (typeof window !== "undefined") window.sessionStorage.setItem(key, JSON.stringify(next));
      } catch {}

      if (typeof window !== "undefined" && typeof window.Notification !== "undefined" && window.Notification.permission === "granted") {
        new window.Notification("New message", {
          body: `${fromLabel}: ${msg.text || String(msg)}`,
        });
      }
    };

    const onMessageSent = (data: any) => {
      console.log("RideChat: message sent confirmation", data);
    };

    s.on("message", onMessage);
    s.on("message-sent", onMessageSent);

    return () => {
      console.log("RideChat: cleanup", rideId);
      s.off("message", onMessage);
      s.off("message-sent", onMessageSent);
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      setInRoom(false);
    };
  }, [rideId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const s = getSocket();
    console.log("RideChat: sending message", { rideId, text: input, socketId: s.id });
    
    // Optimistic UI - add message with "you" identifier
    const optimisticMessage = { text: input, from: "you", timestamp: new Date().toLocaleTimeString() };
    setMessages((prev) => [...prev, optimisticMessage]);
    try {
      const key = `rideChat_${rideId}`;
      const next = (messagesRef.current || []).concat(optimisticMessage);
      if (typeof window !== "undefined") window.sessionStorage.setItem(key, JSON.stringify(next));
      messagesRef.current = next;
    } catch {}
    
    // Send the message to the server
    s.emit("message", { rideId, text: input });
    setInput("");
  };
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    try {
      if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
    } catch {}
  }, [messages]);

  return (
    <div className="rounded-lg bg-slate-900/70 p-4 shadow-sm" style={{ maxHeight: 520 }}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">Chat</h3>
        <div className="text-sm text-slate-400">Status: <span className="ml-1">{connected ? <span className="text-emerald-400">●</span> : <span className="text-rose-400">●</span>}</span> <span className="ml-2 text-slate-400">{inRoom ? "In Room" : "Not in Room"}</span></div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 mb-3 px-2" style={{ maxHeight: 340 }}>
        {messages.length === 0 ? (
          <div className="text-sm text-slate-400">No messages yet</div>
        ) : (
          messages.map((m, i) => {
            const isYou = m.from === "you" || m.from === "You";
            return (
              <div key={i} className={`flex ${isYou ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] ${isYou ? "text-right" : "text-left"}`}>
                  <div className={`inline-flex items-end ${isYou ? "flex-row-reverse" : ""}`}> 
                    <div className={`rounded-full w-8 h-8 flex items-center justify-center text-xs font-medium ${isYou ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white" : "bg-slate-700 text-slate-200"}`}>{isYou ? "You" : m.from?.charAt(0) || "P"}</div>
                    <div className={`${isYou ? "mr-2" : "ml-2"}`}>
                      <div className={`${isYou ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white" : "bg-slate-800 text-slate-200"} px-4 py-2 rounded-2xl shadow`}>
                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{m.from} • {m.timestamp}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1 px-4 py-2 rounded-full bg-slate-800 text-slate-100 placeholder:text-slate-400 border border-slate-700 focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow"
        >
          Send
        </button>
      </div>
    </div>
  );
}

