import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Check, X, FileText, ShieldCheck, Clock, ChevronDown, Eye, Upload } from 'lucide-react';
import { get, put, patch, upload, openAuthedFile } from '../../api/client';

const EASE = [0.23, 1, 0.32, 1];

// The document set ZAMRA requires to license a retail pharmacy in Zambia.
const DOC_LABELS = {
  PACRA_CERTIFICATE: 'PACRA certificate of incorporation',
  TPIN_CERTIFICATE: 'ZRA TPIN certificate',
  PHARMACIST_PRACTISING: 'HPCZ practising certificate',
  PHARMACIST_ID: 'Pharmacist identification',
  PREMISES_PROOF: 'Premises ownership or lease',
  PREMISES_FLOOR_PLAN: 'Premises floor plan',
  ZAMRA_INSPECTION: 'ZAMRA pre-licensing inspection'
};

function DocumentRow({ doc, onReview, onView, busy }) {
  const tone =
    doc.status === 'VERIFIED' ? 'badge-green' : doc.status === 'REJECTED' ? 'badge-red' : 'badge-yellow';

  return (
    <div className="doc-row">
      <div className="doc-row-main">
        <FileText size={15} />
        <div>
          <p>{DOC_LABELS[doc.document_type] || doc.document_type}</p>
          <small>{doc.file_name}</small>
          {doc.reviewed_by_name && (
            <small className="doc-review-note">
              {doc.status === 'VERIFIED' ? 'Verified' : 'Rejected'} by {doc.reviewed_by_name}
              {doc.review_notes ? ` — ${doc.review_notes}` : ''}
            </small>
          )}
        </div>
      </div>

      <div className="doc-row-actions">
        <span className={`badge ${tone}`}>{doc.status}</span>
        {/* Verifying paperwork you cannot open is not a review. */}
        <button
          className="btn btn-secondary"
          disabled={!doc.stored_path}
          title={doc.stored_path ? 'Open the document' : 'No file was uploaded for this document'}
          onClick={() => onView(doc)}
          aria-label={`Open ${doc.file_name}`}
        >
          <Eye size={14} />
        </button>
        <button
          className="btn btn-secondary"
          disabled={busy || doc.status === 'VERIFIED'}
          onClick={() => onReview(doc.document_id, 'VERIFIED')}
          aria-label={`Verify ${doc.file_name}`}
        >
          <Check size={14} />
        </button>
        <button
          className="btn btn-danger"
          disabled={busy || doc.status === 'REJECTED'}
          onClick={() => onReview(doc.document_id, 'REJECTED')}
          aria-label={`Reject ${doc.file_name}`}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function ApplicationCard({ app, onActivated }) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [busy, setBusy] = useState(false);
  const [docTypes, setDocTypes] = useState([]);
  const [uploadType, setUploadType] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadReview = useCallback(async () => {
    const [docsRes, readyRes] = await Promise.all([
      get(`controlhub/tenants/${app.tenant_id}/documents`),
      get(`controlhub/tenants/${app.tenant_id}/readiness`)
    ]);
    if (docsRes?.data) setDocuments(docsRes.data);
    if (readyRes?.data) setReadiness(readyRes.data);
  }, [app.tenant_id]);

  useEffect(() => {
    // The required set comes from the server rather than a list held here, so
    // the two cannot drift apart.
    get('controlhub/documents/types').then((res) => { if (res?.data) setDocTypes(res.data); });
  }, []);

  // Readiness gates the activate button, so it is needed before the reviewer
  // opens the document list.
  useEffect(() => { loadReview(); }, [loadReview]);

  const handleReview = async (documentId, status) => {
    setBusy(true);
    const res = await patch(`controlhub/documents/${documentId}/review`, { status });
    if (res?.data) {
      await loadReview();
      toast.success(`Document ${status.toLowerCase()}`);
    } else {
      toast.error('Could not record the review', {
        description: res?.error || 'The server rejected the change.'
      });
    }
    setBusy(false);
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (!uploadType) {
      toast.error('Choose which document this is first');
      return;
    }

    setUploading(true);
    const body = new FormData();
    body.append('file', file);
    body.append('document_type', uploadType);

    const res = await upload(`controlhub/tenants/${app.tenant_id}/documents`, body);
    if (res?.data) {
      toast.success('Document uploaded', { description: `${file.name} is ready to review.` });
      setUploadType('');
      await loadReview();
    } else {
      toast.error('Could not upload the document', {
        description: res?.error || 'PDF, JPEG, PNG or WebP only, up to 10 MB.'
      });
    }
    setUploading(false);
  };

  const handleView = async (doc) => {
    const res = await openAuthedFile(`controlhub/documents/${doc.document_id}/file`);
    if (res?.error) toast.error('Could not open the document', { description: res.error });
  };

  const handleActivate = async () => {
    setBusy(true);
    const res = await put(`controlhub/tenants/${app.tenant_id}/status`, { status: 'ACTIVE' });
    if (res?.data) {
      toast.success('Pharmacy activated', { description: `${app.name} can now sign in and trade.` });
      onActivated(app.tenant_id);
    } else {
      toast.error('Could not activate', { description: res?.error || 'The server rejected the change.' });
    }
    setBusy(false);
  };

  return (
    <motion.div
      className="ch-tenant-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div className="app-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
            <h3>{app.name}</h3>
            <span className="badge badge-yellow">{app.status}</span>
          </div>
          <p className="app-meta">{app.owner_email} · {app.phone || 'no phone on file'}</p>
          <p className="app-meta">{app.address || 'No address on file'}</p>
          <p className="app-meta">Licence {app.license_number || 'not supplied'}</p>
        </div>

        <button className="btn btn-secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
          <FileText size={14} /> Documents
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ display: 'flex' }}
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div className="doc-list">
              {documents === null && <p className="ch-settings-loading">Loading documents…</p>}
              {documents?.length === 0 && <p className="ch-settings-loading">No documents submitted.</p>}
              {documents?.map((doc) => (
                <DocumentRow
                  key={doc.document_id}
                  doc={doc}
                  onReview={handleReview}
                  onView={handleView}
                  busy={busy}
                />
              ))}

              {/* Paperwork often arrives by email after the application is
                  submitted, so the reviewer needs to be able to put it on file
                  themselves rather than sending the applicant away. */}
              <div className="doc-row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                <select
                  className="input-field"
                  aria-label="Document type to upload"
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  style={{ flex: '1 1 220px' }}
                >
                  <option value="">Add a document…</option>
                  {docTypes.map((t) => (
                    <option key={t} value={t}>{DOC_LABELS[t] || t}</option>
                  ))}
                </select>

                <label className="btn btn-secondary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                  <Upload size={14} /> {uploading ? 'Uploading…' : 'Choose file'}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    style={{ display: 'none' }}
                    disabled={uploading || !uploadType}
                    onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
              </div>

              <p className="doc-note">PDF, JPEG, PNG or WebP, up to 10 MB.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="app-foot">
        {readiness && (
          <span className="app-readiness">
            {readiness.ready_to_activate ? (
              <><ShieldCheck size={14} /> All {readiness.required} required documents verified</>
            ) : (
              <>
                <Clock size={14} />
                {readiness.missing?.length > 0
                  ? `${readiness.missing.length} of ${readiness.required} required documents outstanding`
                  : `${readiness.pending} of ${readiness.total} still pending`}
              </>
            )}
          </span>
        )}

        {/* A pharmacy must not be activated with paperwork outstanding, so the
            server's readiness answer gates this button rather than the UI
            guessing. */}
        <button
          className="btn btn-success"
          disabled={busy || !readiness?.ready_to_activate}
          onClick={handleActivate}
          title={
            readiness?.ready_to_activate
              ? 'Approve and activate this pharmacy'
              : 'Every document must be verified before activation'
          }
        >
          <Check size={15} /> Approve and activate
        </button>
      </div>
    </motion.div>
  );
}

export default function CHOnboarding() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await get('controlhub/onboarding');
    // Real applications only. This screen previously invented a pharmacy that
    // did not exist and never called the API at all.
    if (res?.data) setApplications(res.data);
    else toast.error('Could not load applications', { description: res?.error || 'Check the backend server.' });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <h1>Onboarding reviews</h1>
        <p style={{ color: 'var(--text-2)', marginTop: '4px' }}>
          Verify each pharmacy&apos;s compliance documents before allowing it to trade.
        </p>
      </div>

      {loading && <p style={{ color: 'var(--text-3)' }}>Loading applications…</p>}
      {!loading && applications.length === 0 && (
        <p style={{ color: 'var(--text-3)' }}>No applications are awaiting review.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {applications.map((app) => (
          <ApplicationCard
            key={app.tenant_id}
            app={app}
            onActivated={(id) => setApplications((prev) => prev.filter((a) => a.tenant_id !== id))}
          />
        ))}
      </div>
    </div>
  );
}
