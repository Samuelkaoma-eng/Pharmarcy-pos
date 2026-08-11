import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Pill, Upload, FileText, CheckCircle2, XCircle, Clock, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { getWithToken, uploadWithToken } from '../api/client';
import {
  DOC_HINTS, ACCEPTED_FILES, ACCEPTED_DESCRIPTION, docLabel
} from '../constants/onboardingDocuments';

const EASE = [0.23, 1, 0.32, 1];

const STATUS_COPY = {
  REGISTERED: {
    tone: 'badge-yellow',
    headline: 'Your paperwork is outstanding',
    detail: 'File all seven documents below. The platform team begins its review once they arrive.'
  },
  SUBMITTED: {
    tone: 'badge-blue',
    headline: 'Your application is with the platform team',
    detail: 'You can still replace any document while it is being looked at.'
  },
  UNDER_REVIEW: {
    tone: 'badge-blue',
    headline: 'Your application is being reviewed',
    detail: 'Each document is checked individually. Anything not accepted is explained below.'
  },
  REJECTED: {
    tone: 'badge-red',
    headline: 'Some documents were not accepted',
    detail: 'Replace the documents marked below. Your application returns to the review queue as soon as you do.'
  },
  APPROVED: {
    tone: 'badge-green',
    headline: 'Your pharmacy has been approved',
    detail: 'Sign in with the administrator account you nominated when you applied.'
  },
  ACTIVE: {
    tone: 'badge-green',
    headline: 'Your pharmacy is live',
    detail: 'Sign in with the administrator account you nominated when you applied.'
  }
};

function DocumentIcon({ status }) {
  if (status === 'VERIFIED') return <CheckCircle2 size={16} className="doc-state-ok" />;
  if (status === 'REJECTED') return <XCircle size={16} className="doc-state-bad" />;
  if (status === 'PENDING') return <Clock size={16} className="doc-state-wait" />;
  return <FileText size={16} />;
}

function DocumentRow({ type, doc, canUpload, uploading, onUpload }) {
  const status = doc?.status;

  return (
    <div className="doc-row">
      <div className="doc-row-main">
        <DocumentIcon status={status} />
        <div>
          <p>{docLabel(type)}</p>
          {doc ? (
            <small>{doc.file_name}</small>
          ) : (
            <small>{DOC_HINTS[type] || 'Not yet filed'}</small>
          )}
          {/* The reviewer's reason is the whole value of a decline. Without it
              the applicant is told to try again and not told what to change. */}
          {status === 'REJECTED' && (
            <small className="doc-review-note doc-state-bad">
              {doc.review_notes || 'The reviewer did not accept this document.'}
            </small>
          )}
        </div>
      </div>

      <div className="doc-row-actions">
        {/* No modifier for a document that has not been filed: the base badge
            is already the neutral one. */}
        <span className={`badge ${
          status === 'VERIFIED' ? 'badge-green' : status === 'REJECTED' ? 'badge-red' : status ? 'badge-yellow' : ''
        }`}>
          {status || 'NOT FILED'}
        </span>

        {canUpload && (
          <label className="btn btn-secondary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            <Upload size={14} />
            {uploading ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept={ACCEPTED_FILES}
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onUpload(type, file);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

/**
 * The page an applying pharmacy reaches from the link it is sent.
 *
 * The pharmacy files its own compliance documents; the ControlHub reviews what
 * arrives and decides. There is no account behind this page — the pharmacy has
 * none until it is approved — so the token in the link is the whole of its
 * authority, and it reaches this one application and nothing else.
 */
export default function OnboardingPortal() {
  const { tenantId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [uploadingType, setUploadingType] = useState('');
  const [uploadError, setUploadError] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setState({ loading: false, error: 'This page needs the link that was sent to the pharmacy owner.', data: null });
      return;
    }

    const res = await getWithToken(`onboarding/${tenantId}/status`, token);
    if (res?.data) setState({ loading: false, error: '', data: res.data });
    else setState({ loading: false, error: res?.error || 'This application could not be opened.', data: null });
  }, [tenantId, token]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (documentType, file) => {
    setUploadingType(documentType);
    setUploadError('');

    const body = new FormData();
    body.append('file', file);
    body.append('document_type', documentType);

    const res = await uploadWithToken(`onboarding/${tenantId}/documents`, body, token);
    if (res?.data) {
      // Reloaded rather than patched in place, because filing a replacement can
      // also move the application back into the review queue, and the banner
      // above has to say so.
      await load();
    } else {
      setUploadError(res?.error || `That file could not be uploaded. ${ACCEPTED_DESCRIPTION}`);
    }
    setUploadingType('');
  };

  if (state.loading) {
    return <div className="onboarding-portal onboarding-portal--message">Opening your application…</div>;
  }

  if (state.error) {
    return (
      <div className="onboarding-portal onboarding-portal--message">
        <AlertTriangle size={26} className="doc-state-bad" />
        <h1>This link cannot be opened</h1>
        <p>{state.error}</p>
        <Link to="/" className="btn btn-secondary">Back to home</Link>
      </div>
    );
  }

  const { tenant, required_types: requiredTypes, documents, readiness, can_upload: canUpload } = state.data;
  const copy = STATUS_COPY[tenant.status] || STATUS_COPY.REGISTERED;
  const approved = tenant.status === 'ACTIVE' || tenant.status === 'APPROVED';

  // One row per required document, carrying whatever has been filed against it.
  const byType = Object.fromEntries(documents.map((d) => [d.document_type, d]));

  return (
    <div className="onboarding-portal">
      <motion.div
        className="onboarding-portal-inner"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <div className="onboarding-brand">
          <Pill size={19} /> <span>PharmaPOS</span>
        </div>

        <header className="onboarding-head">
          <div className="onboarding-head-top">
            <h1>{tenant.name}</h1>
            <span className={`badge ${copy.tone}`}>{tenant.status}</span>
          </div>
          <h2>{copy.headline}</h2>
          <p>{copy.detail}</p>
        </header>

        {approved ? (
          <div className="onboarding-approved">
            <ShieldCheck size={20} />
            <div>
              <p>All {readiness.required} required documents were verified.</p>
              <Link to="/login" className="btn btn-primary">Sign in to your pharmacy</Link>
            </div>
          </div>
        ) : (
          <div className="onboarding-progress">
            <div className="onboarding-progress-bar">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${(readiness.verified / readiness.required) * 100}%` }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            </div>
            <span>{readiness.verified} of {readiness.required} documents verified</span>
          </div>
        )}

        {uploadError && <div className="login-error" role="alert">{uploadError}</div>}

        <div className="doc-list onboarding-doc-list">
          {requiredTypes.map((type) => (
            <DocumentRow
              key={type}
              type={type}
              doc={byType[type]}
              canUpload={canUpload}
              uploading={uploadingType === type}
              onUpload={handleUpload}
            />
          ))}
        </div>

        <p className="onboarding-foot">
          {canUpload
            ? `${ACCEPTED_DESCRIPTION} Uploading again replaces what is on file for that document.`
            : 'This application has been decided, so documents can no longer be changed here.'}
        </p>
      </motion.div>
    </div>
  );
}
