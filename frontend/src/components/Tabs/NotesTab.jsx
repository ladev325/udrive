import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import EmptyState from '../EmptyState';
import ConfirmDialog from '../ConfirmDialog';
import Markdown from '../../utils/markdown';
import { formatDate, uid } from '../../utils/formatters';
import { interpolate } from '../../utils/i18n';

const NOTE_COLORS = ['cyan', 'violet', 'amber', 'green', 'rose'];
const TOOLBAR = [
  { type: 'bold', glyph: 'B', label: 'toolbarBold' },
  { type: 'italic', glyph: 'I', label: 'toolbarItalic' },
  { type: 'heading', glyph: 'H', label: 'toolbarHeading' },
  { type: 'list', glyph: '•', label: 'toolbarList' },
  { type: 'checklist', glyph: '✓', label: 'toolbarChecklist' },
  { type: 'code', glyph: '</>', label: 'toolbarCode' },
];

function excerpt(body = '') {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110);
}

export default function NotesTab({
  notes,
  setNotes,
  t,
  lang,
  searchQuery,
  onClearSearch,
  notify,
  createSignal = 0,
  onCreateSignalHandled,
}) {
  const [selectedId, setSelectedId] = useState(() => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 960px)').matches) return null;
    return notes[0]?.id || null;
  });
  const [preview, setPreview] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const textareaRef = useRef(null);
  const saveTimer = useRef(null);
  const lastCreateSignal = useRef(0);

  const query = searchQuery.trim().toLowerCase();
  const filteredNotes = query
    ? notes.filter((note) => {
        const haystack = `${note.title} ${note.body} ${(note.tags || []).join(' ')}`.toLowerCase();
        return haystack.includes(query);
      })
    : notes;

  const sortedNotes = [...filteredNotes].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt,
  );
  const pinnedNotes = sortedNotes.filter((note) => note.pinned);
  const regularNotes = sortedNotes.filter((note) => !note.pinned);
  const selectedNote = notes.find((note) => note.id === selectedId) || null;

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const createNote = useCallback(() => {
    const now = Date.now();
    const note = {
      id: uid('note'),
      title: '',
      body: '',
      tags: [],
      color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    onClearSearch?.();
    setNotes((current) => [note, ...current]);
    setSelectedId(note.id);
    setPreview(false);
    setSaveState('saved');
    window.setTimeout(() => textareaRef.current?.focus(), 80);
  }, [notes.length, onClearSearch, setNotes]);

  useEffect(() => {
    if (createSignal !== lastCreateSignal.current) {
      lastCreateSignal.current = createSignal;
      // Creating a note is an intentional response to the sidebar quick action.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (createSignal > 0) createNote();
      onCreateSignalHandled?.();
    }
  }, [createSignal, createNote, onCreateSignalHandled]);

  const markSaving = () => {
    setSaveState('saving');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSaveState('saved'), 650);
  };

  const updateNote = (patch) => {
    if (!selectedNote) return;
    markSaving();
    setNotes((current) =>
      current.map((note) =>
        note.id === selectedNote.id ? { ...note, ...patch, updatedAt: Date.now() } : note,
      ),
    );
  };

  const addTag = () => {
    const value = tagInput.trim().replace(/^#/, '').slice(0, 24);
    if (!value || !selectedNote) return;
    if ((selectedNote.tags || []).some((tag) => tag.toLowerCase() === value.toLowerCase())) {
      setTagInput('');
      return;
    }
    updateNote({ tags: [...(selectedNote.tags || []), value] });
    setTagInput('');
  };

  const removeTag = (tag) => {
    updateNote({ tags: (selectedNote.tags || []).filter((item) => item !== tag) });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const remaining = notes.filter((note) => note.id !== deleteTarget.id);
    setNotes(remaining);
    setSelectedId(remaining[0]?.id || null);
    setDeleteTarget(null);
    notify(t.notes.deleted, 'success');
  };

  const insertMarkdown = (type) => {
    const textarea = textareaRef.current;
    if (!textarea || !selectedNote) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = selectedNote.body || '';
    const selected = value.slice(start, end);
    let nextValue;
    let nextStart = start;
    let nextEnd = end;

    if (type === 'bold') {
      nextValue = `${value.slice(0, start)}**${selected}**${value.slice(end)}`;
      nextStart = start + 2;
      nextEnd = end + 2;
    } else if (type === 'italic') {
      nextValue = `${value.slice(0, start)}*${selected}*${value.slice(end)}`;
      nextStart = start + 1;
      nextEnd = end + 1;
    } else if (type === 'code') {
      nextValue = `${value.slice(0, start)}\`${selected}\`${value.slice(end)}`;
      nextStart = start + 1;
      nextEnd = end + 1;
    } else {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const prefix = type === 'heading' ? '## ' : type === 'checklist' ? '- [ ] ' : '- ';
      if (selected.includes('\n')) {
        const transformed = selected
          .split('\n')
          .map((line) => `${prefix}${line}`)
          .join('\n');
        nextValue = `${value.slice(0, start)}${transformed}${value.slice(end)}`;
        nextEnd = start + transformed.length;
      } else {
        nextValue = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
        nextStart = start + prefix.length;
        nextEnd = end + prefix.length;
      }
    }

    updateNote({ body: nextValue });
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextStart, nextEnd);
    });
  };

  const titleOf = (note) => note.title?.trim() || t.notes.untitled;
  const wordCount = selectedNote?.body?.trim()
    ? selectedNote.body.trim().split(/\s+/).length
    : 0;

  const renderListItem = (note) => (
    <button
      type="button"
      key={note.id}
      className={`note-list-item tone-${note.color || 'cyan'} ${selectedId === note.id ? 'active' : ''}`}
      onClick={() => {
        setSelectedId(note.id);
        setPreview(false);
        setTagInput('');
        setSaveState('saved');
      }}
    >
      <span className="note-item-stripe" aria-hidden="true" />
      <span className="note-item-head">
        <strong>{titleOf(note)}</strong>
        {note.pinned && <Icon name="pin" size={14} className="pin-mark" />}
      </span>
      <span className="note-item-excerpt">
        {excerpt(note.body) || t.notes.untitledContent}
      </span>
      <span className="note-item-meta">
        <span>{formatDate(note.updatedAt, lang, false)}</span>
        <span className="note-item-tags">
          {(note.tags || []).slice(0, 2).map((tag) => (
            <span className="mini-tag" key={tag}>
              #{tag}
            </span>
          ))}
        </span>
      </span>
    </button>
  );

  return (
    <section className="glass-panel tab-panel notes-panel">
      <div className={`notes-layout ${selectedNote ? 'has-selection' : ''}`}>
        <aside className="notes-sidebar">
          <div className="notes-sidebar-head">
            <div>
              <span className="sidebar-label">{t.notes.allNotes}</span>
              <h2>{t.notes.title}</h2>
              <p>{interpolate(t.notes.noteCount, { count: notes.length })}</p>
            </div>
            <button type="button" className="btn btn-accent btn-icon-labeled" onClick={createNote}>
              <Icon name="plus" size={18} />
              <span>{t.notes.newNote}</span>
            </button>
          </div>

          <div className="notes-list-scroll">
            {notes.length === 0 ? (
              <EmptyState
                compact
                icon="notes"
                title={t.notes.emptyTitle}
                text={t.notes.emptyText}
                actionLabel={t.notes.emptyAction}
                onAction={createNote}
              />
            ) : filteredNotes.length === 0 ? (
              <EmptyState
                compact
                icon="search"
                title={t.notes.noResultsTitle}
                text={t.notes.noResultsText}
                actionLabel={t.common.clearSearch}
                actionIcon="close"
                onAction={onClearSearch}
              />
            ) : (
              <>
                {pinnedNotes.length > 0 && (
                  <div className="notes-group">
                    <span className="notes-group-label">
                      <Icon name="pin" size={13} />
                      {t.notes.pinned}
                    </span>
                    {pinnedNotes.map(renderListItem)}
                  </div>
                )}
                {regularNotes.length > 0 && (
                  <div className="notes-group">
                    {pinnedNotes.length > 0 && <span className="notes-group-label">{t.notes.others}</span>}
                    {regularNotes.map(renderListItem)}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        <div className="note-editor-pane">
          {!selectedNote ? (
            <div className="note-editor-empty">
              <span className="empty-icon">
                <Icon name="notes" size={34} />
              </span>
              <h3>{t.notes.selectTitle}</h3>
              <p>{t.notes.selectText}</p>
              <button type="button" className="btn btn-accent" onClick={createNote}>
                <Icon name="plus" size={17} />
                {t.notes.newNote}
              </button>
            </div>
          ) : (
            <>
              <div className="note-editor-head">
                <button type="button" className="icon-btn mobile-back" onClick={() => setSelectedId(null)} aria-label={t.notes.backToList}>
                  <Icon name="arrowLeft" size={19} />
                </button>
                <div className="note-head-meta">
                  <span>
                    {saveState === 'saving' ? (
                      <Icon name="loader" size={14} className="spin" />
                    ) : (
                      <Icon name="check" size={14} />
                    )}
                    {saveState === 'saving' ? t.notes.saving : t.notes.saved}
                  </span>
                </div>
                <div className="note-head-actions">
                  <button
                    type="button"
                    className={`btn btn-ghost btn-sm ${preview ? 'active' : ''}`}
                    onClick={() => setPreview((value) => !value)}
                  >
                    <Icon name={preview ? 'edit' : 'eye'} size={16} />
                    {preview ? t.notes.edit : t.notes.preview}
                  </button>
                  <button
                    type="button"
                    className={`icon-btn ${selectedNote.pinned ? 'is-starred' : ''}`}
                    onClick={() => updateNote({ pinned: !selectedNote.pinned })}
                    title={selectedNote.pinned ? t.notes.unpin : t.notes.pin}
                    aria-label={selectedNote.pinned ? t.notes.unpin : t.notes.pin}
                  >
                    <Icon name="pin" size={17} filled={selectedNote.pinned} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => setDeleteTarget(selectedNote)}
                    title={t.notes.delete}
                    aria-label={t.notes.delete}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              </div>

              <div className="note-editor-scroll">
                {preview ? (
                  <article className="note-preview">
                    <span className={`note-color-pill color-${selectedNote.color || 'cyan'}`} />
                    <h1>{titleOf(selectedNote)}</h1>
                    <div className="note-preview-meta">
                      <span>{t.notes.edited}: {formatDate(selectedNote.updatedAt, lang)}</span>
                      <span className="dot-separator" />
                      <span>{interpolate(t.notes.words, { count: wordCount })}</span>
                    </div>
                    <div className="note-tag-row readonly">
                      {(selectedNote.tags || []).map((tag) => (
                        <span className="tag-chip" key={tag}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <Markdown content={selectedNote.body} />
                  </article>
                ) : (
                  <>
                    <input
                      className="note-title-input"
                      value={selectedNote.title}
                      onChange={(event) => updateNote({ title: event.target.value })}
                      placeholder={t.notes.titlePlaceholder}
                      maxLength={140}
                      aria-label={t.notes.titlePlaceholder}
                    />
                    <div className="note-submeta">
                      <span>
                        <Icon name="calendar" size={14} />
                        {t.notes.edited}: {formatDate(selectedNote.updatedAt, lang)}
                      </span>
                      <span className="color-picker" role="group" aria-label={t.notes.color}>
                        {NOTE_COLORS.map((color) => (
                          <button
                            type="button"
                            key={color}
                            className={`color-dot color-${color} ${selectedNote.color === color ? 'active' : ''}`}
                            onClick={() => updateNote({ color })}
                            title={t.notes.colors[color]}
                            aria-label={t.notes.colors[color]}
                          />
                        ))}
                      </span>
                    </div>

                    <div className="tag-editor">
                      <span className="tag-editor-label">
                        <Icon name="filter" size={14} />
                        {t.notes.tags}
                      </span>
                      {(selectedNote.tags || []).map((tag) => (
                        <span className="tag-chip removable" key={tag}>
                          #{tag}
                          <button type="button" onClick={() => removeTag(tag)} aria-label={`${t.common.remove} ${tag}`}>
                            <Icon name="close" size={12} />
                          </button>
                        </span>
                      ))}
                      <input
                        className="tag-input"
                        value={tagInput}
                        onChange={(event) => setTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ',') {
                            event.preventDefault();
                            addTag();
                          }
                        }}
                        onBlur={addTag}
                        placeholder={t.notes.tagPlaceholder}
                        aria-label={t.notes.addTag}
                      />
                    </div>

                    <div className="note-toolbar" role="toolbar" aria-label={t.notes.edit}>
                      {TOOLBAR.map((tool) => (
                        <button
                          type="button"
                          key={tool.type}
                          className="toolbar-btn"
                          onClick={() => insertMarkdown(tool.type)}
                          title={t.notes[tool.label]}
                          aria-label={t.notes[tool.label]}
                        >
                          <span className={`toolbar-glyph glyph-${tool.type}`}>{tool.glyph}</span>
                        </button>
                      ))}
                      <span className="toolbar-separator" />
                      <span className="toolbar-hint">{t.notes.saveHint}</span>
                    </div>

                    <textarea
                      ref={textareaRef}
                      className="note-body-input"
                      value={selectedNote.body}
                      onChange={(event) => updateNote({ body: event.target.value })}
                      placeholder={t.notes.bodyPlaceholder}
                      aria-label={t.notes.bodyPlaceholder}
                    />
                  </>
                )}
              </div>

              <div className="note-statusbar">
                <span>{interpolate(t.notes.words, { count: wordCount })}</span>
                <span className="dot-separator" />
                <span>{interpolate(t.notes.characters, { count: (selectedNote.body || '').length })}</span>
                <span className="statusbar-spacer" />
                <span className={saveState === 'saving' ? 'saving' : 'saved'}>
                  <Icon name={saveState === 'saving' ? 'loader' : 'check'} size={13} className={saveState === 'saving' ? 'spin' : ''} />
                  {saveState === 'saving' ? t.notes.saving : t.notes.saved}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={t.notes.deleteTitle}
          text={interpolate(t.notes.deleteText, { title: titleOf(deleteTarget) })}
          confirmLabel={t.common.delete}
          cancelLabel={t.common.cancel}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
