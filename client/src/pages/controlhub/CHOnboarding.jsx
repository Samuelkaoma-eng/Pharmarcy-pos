import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Check, X, FileText, ShieldCheck, Clock, ChevronDown, Eye } from 'lucide-react';
import { get, put, patch, openAuthedFile } from '../../api/client';
import SimulatedEmail from '../../components/SimulatedEmail';
import { docLabel } from '../../constants/onboardingDocuments';

const EASE = [0.23, 1, 0.32, 1];

function DocumentRow({ doc, onReview, onView, busy }) {
  // A rejection is asked for in writing. The applicant is shown this sentence
  // and nothing else, so a rejection recorded without one tells them only that
  // they failed, not what to send instead.
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState('');

  const tone =
    doc.status === 'VERIFIED' ? 'badge-green' : doc.status === 'REJECTED' ? 'badge-red' : 'badge-yellow';

  const confirmRejection = async () => {
    await onReview(doc.document_id, 'REJECTED', notes.trim());
    setRejecting(false);
    setNotes('');
  };

  return (
    <div className="doc-row doc-row--reviewable">
      <div className="doc-row-top">
        <div className="doc-row-main">
          <FileText size={15} />
          <div>
            <p>{docLabel(doc.document_type)}</p>
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
            disabled={busy || rejecting}
            onClick={() => setRejecting(true)}
            aria-label={`Reject ${doc.file_name}`}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Rendered conditionally rather than through AnimatePresence. Nested
          inside the document panel's own collapse, the exit animation did not
          complete and left the row in the document at zero height — invisible,
          but still holding a focusable input. A control that takes keyboard
          focus must not survive the thing it belongs to. */}
      {rejecting && (
        <motion.div
          className="doc-reject-reason"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          <input
            className="input-field"
            autoFocus
            placeholder="What is wrong with this document?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && notes.trim()) confirmRejection(); }}
            aria-label={`Reason for rejecting ${doc.file_name}`}
          />
          <button
            className="btn btn-danger"
            disabled={busy || !notes.trim()}
            onClick={confirmRejection}
            title={notes.trim() ? 'Reject this document' : 'Give the applicant a reason first'}
          >
            Reject
          </button>
          <button className="btn btn-secondary" onClick={() => { setRejecting(false); setNotes(''); }}>
            Cancel
          </button>
        </motion.div>
      )}
    </div>
  );
}

function ApplicationCard({ app, onDecided }) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [busy, setBusy] = useState(false);
  // The message the applicant would be emailed about this decision. Held on the
  // card so the reviewer sees what the pharmacy is being told, and can follow
  // the same link the pharmacy would.
  const [notification, setNotification] = useState(null);

  const loadReview = useCallback(async () => {
    const [docsRes, readyRes] = await Promise.all([
      get(`controlhub/tenants/${app.tenant_id}/documents`),
      get(`controlhub/tenants/${app.tenant_id}/readiness`)
    ]);
    if (docsRes?.data) setDocuments(docsRes.data);
    if (readyRes?.data) setReadiness(readyRes.data);
  }, [app.tenant_id]);

  // Readiness gates the activate button, so it is needed before the reviewer
  // opens the document list.
  useEffect(() => { loadReview(); }, [loadReview]);

  const handleReview = async (documentId, status, reviewNotes) => {
    setBusy(true);
    const res = await patch(`controlhub/documents/${documentId}/review`, {
      status,
      review_notes: reviewNotes || undefined
    });
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

  const handleView = async (doc) => {
    const res = await openAuthedFile(`controlhub/documents/${doc.document_id}/file`);
    if (res?.error) toast.error('Could not open the document', { description: res.error });
  };

  // Approving and declining are the same call with a different verdict, and both
  // end with the applicant being told. The card stays on screen holding that
  // message rather than vanishing from the queue, because the message is the
  // point of the simulation.
  const decide = async (status, { successTitle, successDetail, failTitle }) => {
    setBusy(true);
    const res = await put(`controlhub/tenants/${app.tenant_id}/status`, { status });
    if (res?.data) {
      toast.success(successTitle, { description: successDetail });
      // The card stays until the reviewer dismisses it, so the message does not
      // flash past on its way out of the queue.
      setNotification(res.data.notification);
    } else {
      toast.error(failTitle, { description: res?.error || 'The server rejected the change.' });
    }
    setBusy(false);
  };

  const handleActivate = () =>
    decide('ACTIVE', {
      successTitle: 'Pharmacy activated',
      successDetail: `${app.name} can now sign in and trade.`,
      failTitle: 'Could not activate'
    });

  const handleDecline = () =>
    decide('REJECTED', {
      successTitle: 'Application declined',
      successDetail: `${app.name} has been told which documents to replace.`,
      failTitle: 'Could not decline'
    });

  const rejectedCount = documents?.filter((d) => d.status === 'REJECTED').length || 0;

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
              <p className="review-note">
                The pharmacy files these itself, from the link it was sent when it applied.
                ControlHub reviews what arrives; it does not upload on an applicant&apos;s behalf.
              </p>
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

        {notification ? (
          <button className="btn btn-secondary" onClick={() => onDecided(app.tenant_id)}>
            Clear from queue
          </button>
        ) : (
          <div className="app-decision">
            {/* Declining is only meaningful once a document has actually been
                rejected, because the rejections are what the applicant is told
                to fix. Declining with nothing marked would send them a blank
                instruction. */}
            <button
              className="btn btn-danger"
              disabled={busy || rejectedCount === 0}
              onClick={handleDecline}
              title={
                rejectedCount > 0
                  ? `Decline and tell the applicant about ${rejectedCount} rejected document(s)`
                  : 'Reject at least one document first, so the applicant is told what to replace'
              }
            >
              <X size={15} /> Decline
            </button>

            {/* A pharmacy must not be activated with paperwork outstanding, so
                the server's readiness answer gates this button rather than the
                UI guessing. */}
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
        )}
      </div>

      {/* What the applicant is being told, and the link they would follow. */}
      {notification && <SimulatedEmail notification={notification} />}
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
            onDecided={(id) => setApplications((prev) => prev.filter((a) => a.tenant_id !== id))}
          />
        ))}
      </div>
    </div>
  );
}
