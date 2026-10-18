import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Check, Folder, Layers, AlertCircle } from 'lucide-react';
import { FileGroup } from '../types';

interface FileGroupCrudModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileGroups: FileGroup[];
  activeFileGroupId: string;
  onSelectGroup: (id: string) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (id: string, newName: string) => void;
  onDeleteGroup: (id: string) => void;
}

export const FileGroupCrudModal: React.FC<FileGroupCrudModalProps> = ({
  isOpen,
  onClose,
  fileGroups,
  activeFileGroupId,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    onCreateGroup(newGroupName.trim());
    setNewGroupName('');
    setError(null);
  };

  const startEditing = (group: FileGroup) => {
    setEditingId(group.id);
    setEditName(group.name);
  };

  const saveEditing = (id: string) => {
    if (!editName.trim()) return;
    onRenameGroup(id, editName.trim());
    setEditingId(null);
    setEditName('');
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-[#1E1E1E] border border-[rgba(255,255,255,0.12)] rounded-xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#79B8FF]/15 text-[#79B8FF]">
              <Layers size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#E2E2E2]">Manage File Groups (CRUD)</h2>
              <p className="text-xs text-[#A8ABB4]">Create, rename, select, or delete document groups</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#A8ABB4] hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Create Form */}
        <form onSubmit={handleCreate} className="mt-4 pb-4 border-b border-white/10 flex gap-2">
          <input
            type="text"
            placeholder="New group name..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="flex-grow py-2 px-3 bg-[#2C2C2C] border border-white/10 rounded-lg text-xs text-white placeholder-[#777] focus:ring-1 focus:ring-[#79B8FF] focus:border-[#79B8FF] outline-none"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[#79B8FF] hover:bg-[#68a7f0] text-[#121212] font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus size={15} />
            <span>Add Group</span>
          </button>
        </form>

        {/* Groups List */}
        <div className="flex-grow overflow-y-auto space-y-2.5 my-4 pr-1 chat-container">
          {fileGroups.map((group) => {
            const isActive = group.id === activeFileGroupId;
            const isEditing = editingId === group.id;

            return (
              <div
                key={group.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-[#79B8FF]/10 border-[#79B8FF]/40 text-white shadow-xs'
                    : 'bg-[#252525] border-white/5 text-[#E2E2E2] hover:bg-[#2a2a2a]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-grow mr-3">
                  <Folder size={18} className={isActive ? 'text-[#79B8FF]' : 'text-[#888]'} />
                  
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-grow">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditing(group.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="py-1 px-2 bg-[#1E1E1E] border border-white/20 rounded text-xs text-white w-full outline-none focus:ring-1 focus:ring-[#79B8FF]"
                      />
                      <button
                        onClick={() => saveEditing(group.id)}
                        className="p-1 text-[#79B8FF] hover:bg-white/10 rounded"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-[#A8ABB4] hover:bg-white/10 rounded"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-grow">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate" title={group.name}>
                          {group.name}
                        </span>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#79B8FF]/20 text-[#79B8FF] font-medium shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#A8ABB4]">
                        {group.files.length} {group.files.length === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => {
                          onSelectGroup(group.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
                      >
                        Select
                      </button>
                    )}
                    <button
                      onClick={() => startEditing(group)}
                      className="p-1.5 text-[#A8ABB4] hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                      title="Rename group"
                    >
                      <Edit2 size={14} />
                    </button>
                    {fileGroups.length > 1 && (
                      <button
                        onClick={() => onDeleteGroup(group.id)}
                        className="p-1.5 text-[#A8ABB4] hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Delete group"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
