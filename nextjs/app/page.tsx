"use client"
import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface QueryResponse {
  answer: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  typewriter?: boolean;
}

interface TypewriterTextProps {
  text: string;
  speed?: number;
}

const TypewriterText: React.FC<TypewriterTextProps> = ({ text, speed = 50 }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  
  useEffect(() => {
    // Reset state when text changes
    setDisplayedText("");
    setIsComplete(false);
    
    // Create an array of all characters to ensure none are skipped
    const characters = text.split('');
    let currentIndex = 0;
    
    const interval = setInterval(() => {
      if (currentIndex < characters.length) {
        setDisplayedText(prev => prev + characters[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(interval);
        setIsComplete(true);
      }
    }, speed);
    
    return () => clearInterval(interval);
  }, [text, speed]);

  // If there's an issue with typewriter, fall back to full text
  return <span>{isComplete ? text : displayedText}</span>;
};
// const TypewriterText: React.FC<TypewriterTextProps> = ({ text, speed = 50 }) => {
//   const [displayedText, setDisplayedText] = useState("");
  
//   useEffect(() => {
//     setDisplayedText(""); // Reset whenever text changes.
//     let index = 0;
//     const interval = setInterval(() => {
//       setDisplayedText((prev) => prev + text.charAt(index));
//       index++;
//       if (index >= text.length) clearInterval(interval);
//     }, speed);
//     return () => clearInterval(interval);
//   }, [text, speed]);

//   return <span>{displayedText}</span>;
// };

export default function Home(): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [fileUploaded, setFileUploaded] = useState<boolean>(false);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatMessage, setChatMessage] = useState<string>("");
  const [isThinking, setIsThinking] = useState<boolean>(false);

  // Handle PDF file upload
  const handleFileUpload = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    formData.append("file", files[0]);

    try {
      const res = await fetch("http://localhost:3001/upload", {
        method: "POST",
        body: formData,
      });
      await res.json();
      if (res.ok) {
        setUploadMessage("✅ Document processed successfully! Ask your questions below.");
        setFileUploaded(true);
      } else {
        setUploadMessage("Error: Failed to process document");
      }
    } catch (error: unknown) {
      console.error(error);
      setUploadMessage("Error: Failed to process document");
    }
  };

  // Handle sending a query
  const handleSendMessage = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    // Append the user message to the chat log
    const newChatLog: ChatMessage[] = [
      ...chatLog,
      { role: "user", content: chatMessage },
    ];
    setChatLog(newChatLog);
    setIsThinking(true);

    try {
      const res = await fetch("http://localhost:3001/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: chatMessage }),
      });
      const data = (await res.json()) as QueryResponse;

      if (res.ok) {
        // Split the response into thinking and final answer parts using regex.
        const regex = /<think>([\s\S]*?)<\/think>([\s\S]*)/;
        const match = data.answer.match(regex);
        if (match) {
          const thinkingText = match[1].trim();
          const finalAnswerText = match[2].trim();
          setChatLog([
            ...newChatLog,
            { role: "assistant", content: thinkingText },
            { role: "assistant", content: finalAnswerText, typewriter: true },
          ]);
        } else {
          // No <think> tag found – show answer normally.
          setChatLog([
            ...newChatLog,
            { role: "assistant", content: data.answer },
          ]);
        }
        setChatMessage("");
      } else {
        setChatLog([
          ...newChatLog,
          { role: "assistant", content: "Error: Failed to generate answer" },
        ]);
      }
    } catch (error: unknown) {
      console.error(error);
      setChatLog([
        ...newChatLog,
        { role: "assistant", content: "Error: Failed to generate answer" },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">📘 DocuMind AI</h1>
      <p className="mb-6">Your Intelligent Document Assistant</p>

      {/* File Upload Section */}
      <section className="mb-8">
        <form onSubmit={handleFileUpload} className="flex flex-col gap-2">
          <input type="file" accept="application/pdf" ref={fileInputRef} />
          <Button type="submit">Upload PDF</Button>
        </form>
        {uploadMessage && <p className="mt-2">{uploadMessage}</p>}
      </section>

      {/* Chat Interface Section */}
      {fileUploaded && (
        <section className="border-t border-gray-700 pt-4">
          <div className="space-y-4 mb-4">
            {chatLog.map((message, index) => (
              <div
                key={index}
                className={`p-3 rounded ${
                  message.role === "assistant" ? "bg-gray-700" : "bg-gray-800"
                }`}
              >
                <strong>{message.role === "assistant" ? "Assistant" : "You"}:</strong>
                <p>
                  {message.typewriter ? (
                    <TypewriterText text={message.content} speed={50} />
                  ) : (
                    message.content
                  )}
                </p>
              </div>
            ))}
            {isThinking && (
              <div className="flex items-center gap-2 p-3 rounded bg-gray-700">
                <Loader2 className="animate-spin h-5 w-5" />
                <p>Thinking...</p>
              </div>
            )}
          </div>
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Enter your question about the document..."
            />
            <Button type="submit">Send</Button>
          </form>
        </section>
      )}
    </div>
  );
}