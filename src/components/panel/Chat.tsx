import { useEffect, useRef, useState } from 'react';
import { answerFor, scriptsFor } from '../../state/chat';
import { useStore } from '../../state/store';
import { Linkified } from '../ui/bits';
import { Icon } from '../ui/Icon';

interface Exchange {
  q: string;
  a: string;
}

export function Chat() {
  const { vm, selection } = useStore();
  const { scope, placeholder, scripts } = scriptsFor(selection);
  const [text, setText] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [tipsOpen, setTipsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Answers belong to the selection they were asked about.
  useEffect(() => {
    setExchanges([]);
    setText('');
    setTipsOpen(false);
  }, [scope]);

  // A click anywhere else closes the suggestions.
  useEffect(() => {
    if (!tipsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setTipsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [tipsOpen]);

  const ask = (q: string) => {
    const a = answerFor(q, selection, vm);
    setExchanges((x) => [...x.slice(-1), { q, a }]);
    setText('');
    setTipsOpen(false);
  };

  return (
    <div
      className="chat"
      ref={rootRef}
      onKeyDown={(e) => {
        // Escape closes the suggestions without also clearing the selection.
        if (e.key === 'Escape' && tipsOpen) {
          e.stopPropagation();
          setTipsOpen(false);
        }
      }}
    >
      {exchanges.map((ex, i) => (
        <div className="chat-answer" key={i}>
          <button className="btn small close" onClick={() => setExchanges((x) => x.filter((_, j) => j !== i))} title="Dismiss and return to the view">
            Close
          </button>
          <div className="q">You: {ex.q}</div>
          <div className="a">
            <Linkified text={ex.a} />
          </div>
        </div>
      ))}

      {tipsOpen && (
        <div className="chat-tips" role="menu" aria-label="Suggested questions">
          {scripts.slice(0, 3).map((s) => (
            <button key={s.question} role="menuitem" onClick={() => ask(s.question)}>
              {s.question}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input">
        <input
          value={text}
          placeholder={`${placeholder} · answers come from the record`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) ask(text.trim());
          }}
          aria-label={placeholder}
        />
        <button
          className={`tips${tipsOpen ? ' on' : ''}`}
          onClick={() => setTipsOpen((v) => !v)}
          aria-expanded={tipsOpen}
          aria-label="Suggested questions"
          title="Suggested questions"
        >
          <Icon name="bulb" />
        </button>
        <span className="mic" aria-hidden="true">
          <Icon name="mic" />
        </span>
        <button className="send" onClick={() => text.trim() && ask(text.trim())} aria-label="Send">
          <Icon name="send" />
        </button>
      </div>
    </div>
  );
}
