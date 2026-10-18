import React from 'react';
import { Sparkles, FileText, Lightbulb, ListChecks } from 'lucide-react';

interface QuickActionsMenuProps {
  onInsertPrompt: (prompt: string) => void;
}

const QUICK_ACTIONS = [
  { label: 'Summarize these docs', prompt: 'Summarize the document content in focus.', icon: FileText },
  { label: 'Find key takeaways', prompt: 'What are the key takeaways from these documents?', icon: ListChecks },
  { label: 'Explain this concept', prompt: 'Explain the technical concepts mentioned in these documents.', icon: Lightbulb },
];

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({ onInsertPrompt }) => {
  return (
    <div className="absolute bottom-20 right-4 md:right-8 z-40 bg-[#1E1E1E] border border-white/10 rounded-xl shadow-2xl p-2 w-48 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-[#A8ABB4] mb-1">
        <Sparkles size={12} className="text-[#79B8FF]" />
        Quick Actions
      </div>
      <div className="flex flex-col gap-1">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onInsertPrompt(action.prompt)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#E2E2E2] hover:bg-white/10 transition-colors w-full text-left"
          >
            <action.icon size={14} className="text-[#79B8FF]" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};
