import { useState } from "react";
import { useSpeechToText } from "./useSpeechToText";

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const speech = useSpeechToText();

  function handleMicClick() {
    if (speech.isListening) {
      speech.stop();
      return;
    }
    // Populates the same text state as typing — never auto-sends. The user
    // reviews/edits the transcript and submits it themselves, same as any
    // typed message (see useSpeechToText's docstring for why).
    speech.start((transcript) => setText(transcript));
  }

  return (
    <>
      <form
        className="agent-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text.trim());
          setText("");
        }}
      >
        <input
          className="agent-text-input"
          aria-label="agent-chat-input"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask the agent to do something..."
        />
        {speech.isSupported ? (
          <button
            type="button"
            className={`agent-mic-btn${speech.isListening ? " listening" : ""}`}
            onClick={handleMicClick}
            disabled={disabled}
            aria-label={speech.isListening ? "Stop voice input" : "Start voice input"}
            aria-pressed={speech.isListening}
            title="Voice input uses your browser's speech recognition service, which sends audio to a remote server to transcribe it — unlike the on-device model that parses your request."
            data-testid="agent-mic-btn"
          >
            🎙️
          </button>
        ) : null}
        <button className="agent-send-btn" type="submit" disabled={disabled} aria-label="Send">
          ➤
        </button>
      </form>
      {speech.error ? <div className="mic-error-hint">{speech.error}</div> : null}
    </>
  );
}
