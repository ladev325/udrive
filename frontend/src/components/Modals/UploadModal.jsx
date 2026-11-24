import { useRef, useState } from 'react';
import Icon from '../Icon';
import Modal from '../Modal';
import { formatBytes } from '../../utils/formatters';
import { filesFromDrop } from '../../utils/dropFiles';
import { interpolate } from '../../utils/i18n';

// Picks one or more files (not folders) and hands them to onUpload.
export default function UploadModal({ t, onClose, onUpload, multiple = true }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const chooseFiles = (files) => {
    const list = Array.from(files || []);
    if (list.length) setSelectedFiles(multiple ? list : list.slice(0, 1));
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    chooseFiles(filesFromDrop(event.dataTransfer));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedFiles.length) return;
    onUpload(selectedFiles);
    onClose();
  };

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  return (
    <Modal
      title={t.upload.fileTitle}
      subtitle={t.files.subtitle}
      onClose={onClose}
      closeLabel={t.common.close}
      size="sm"
      icon={<Icon name="upload" size={20} />}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.upload.cancel}
          </button>
          <button type="submit" form="upload-form" className="btn btn-accent" disabled={!selectedFiles.length}>
            <Icon name="upload" size={17} />
            {t.upload.submit}
          </button>
        </>
      }
    >
      <form id="upload-form" onSubmit={handleSubmit}>
        {!selectedFiles.length ? (
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <span className="dropzone-icon">
              <Icon name="cloud" size={28} />
            </span>
            <strong>{t.upload.drag}</strong>
            <span className="dropzone-or">{t.upload.or}</span>
            <span className="btn btn-outline-soft btn-sm">{t.upload.browse}</span>
            <small>{t.drive.uploadHint}</small>
          </div>
        ) : (
          <div className="selected-file">
            <span className="selected-file-icon">
              <Icon name="folder" size={26} />
            </span>
            <div className="selected-file-copy">
              <strong title={selectedFiles.map((file) => file.name).join(', ')}>
                {selectedFiles.length === 1
                  ? selectedFiles[0].name
                  : interpolate(t.drive.filesSelected, { count: selectedFiles.length })}
              </strong>
              <small>{formatBytes(totalSize)}</small>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => inputRef.current?.click()}
              aria-label={t.upload.change}
            >
              <Icon name="refresh" size={17} />
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          hidden
          onChange={(event) => {
            chooseFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </form>
    </Modal>
  );
}
