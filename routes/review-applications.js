import { dbFetch, reviewDbFetch, getReviewDbConfig, DatabaseSessionError } from '../utils/db.js';
import { REVIEW_APPLICATION_STATUSES } from '../models/review_application.js';
import { VeteranApplication } from '../models/veteran_application.js';
import { GuardianApplication } from '../models/guardian_application.js';
import { ReviewApplicationSummary } from '../models/review_application_summary.js';

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 500;
const REVIEW_VIEW_PATH = '_design/hf-app-review/_view/new_apps';

const APPLICATION_TYPE_ERROR = 'Application type must be VeteranApp or GuardianApp';
const NOT_FOUND_ERROR = 'Application not found';
const NOT_REVIEW_APP_ERROR = 'Document is not a review application';
const USE_ACCEPT_ERROR = 'Use the accept endpoint to accept an application';
const INVALID_STATUS_ERROR = 'Invalid application status';
const ALREADY_MODIFIED_ERROR = 'Application was already copied and has since been modified in the logistics database';

function reviewDbBase() {
    const { url, name } = getReviewDbConfig();
    return `${url}/${name}`;
}

function mainDbBase() {
    return `${process.env.DB_URL}/${process.env.DB_NAME}`;
}

function applicationClassFor(type) {
    if (type === 'VeteranApp') {
        return VeteranApplication;
    }
    if (type === 'GuardianApp') {
        return GuardianApplication;
    }
    return null;
}

function handleError(res, error, context) {
    if (error instanceof DatabaseSessionError) {
        console.error('Database session error:', error.message);
        return res.status(503).json({ error: error.message });
    }
    if (error.message && error.message.includes('Validation failed')) {
        return res.status(400).json({ error: error.message });
    }
    console.error(`Error ${context}:`, error);
    return res.status(500).json({ error: error.message });
}

async function readErrorReason(response, fallback) {
    try {
        const data = await response.json();
        return data.reason || fallback;
    } catch (parseError) {
        return fallback;
    }
}

/**
 * Load a review document by id. Returns `{ doc, ApplicationClass }` or sends
 * the appropriate 404/400 response and returns null.
 */
async function loadReviewDocument(req, res, docId) {
    const response = await reviewDbFetch(req, `${reviewDbBase()}/${docId}`);

    if (!response.ok) {
        if (response.status === 404) {
            res.status(404).json({ error: NOT_FOUND_ERROR });
            return null;
        }
        throw new Error('Failed to get review application');
    }

    const doc = await response.json();
    const ApplicationClass = applicationClassFor(doc.type);
    if (!ApplicationClass) {
        res.status(400).json({ error: NOT_REVIEW_APP_ERROR });
        return null;
    }

    return { doc, ApplicationClass };
}

async function saveReviewDocument(req, docId, couchDoc) {
    const response = await reviewDbFetch(req, `${reviewDbBase()}/${docId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(couchDoc)
    });

    if (!response.ok) {
        throw new Error(await readErrorReason(response, 'Failed to update application'));
    }

    return response.json();
}

function parseLimit(rawLimit) {
    const parsed = parseInt(rawLimit, 10);
    if (Number.isNaN(parsed)) {
        return DEFAULT_LIST_LIMIT;
    }
    return Math.min(Math.max(parsed, 1), MAX_LIST_LIMIT);
}

/**
 * @swagger
 * /review/applications:
 *   post:
 *     summary: Submit a new application for review (website intake)
 *     description: >
 *       Called by the hf_appcollector Cloud Function with the raw website form
 *       payload. Requires a Google-signed service-account ID token whose email is
 *       listed in REVIEW_INTAKE_SERVICE_ACCOUNTS. Legacy credential fields
 *       (cburi, cbusr, cbpwd) and full_message are stripped before storage. The
 *       application is stored with app_status "New". Intake is permissive: only
 *       `type` (VeteranApp or GuardianApp) is required; incomplete form payloads
 *       are stored as-is for reviewers to fix in the UI. Logistics model
 *       validation runs only on accept.
 *     tags: [Review Applications]
 *     security:
 *       - IntakeIdToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewApplicationIntake'
 *     responses:
 *       201:
 *         description: Application stored for review
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewApplication'
 *       400:
 *         description: Invalid or missing application type (must be VeteranApp or GuardianApp)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Missing or invalid intake token
 *       403:
 *         description: Service account not permitted
 *       500:
 *         description: Server error
 *       503:
 *         description: Review database session unavailable
 */
export async function createReviewApplication(req, res) {
    try {
        const body = req.body || {};
        const ApplicationClass = applicationClassFor(body.type);
        if (!ApplicationClass) {
            return res.status(400).json({ error: APPLICATION_TYPE_ERROR });
        }

        const application = ApplicationClass.fromIntakePayload(body);

        const response = await reviewDbFetch(req, reviewDbBase(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(application.toCouchDoc())
        });

        if (!response.ok) {
            throw new Error(await readErrorReason(response, 'Failed to create application'));
        }

        const data = await response.json();
        application._id = data.id;
        application._rev = data.rev;

        res.status(201).json(application.toJSON());
    } catch (error) {
        handleError(res, error, 'creating review application');
    }
}

/**
 * @swagger
 * /review/applications:
 *   get:
 *     summary: List applications awaiting review
 *     description: >
 *       Returns applications with the given status, newest first, using the
 *       legacy hf-app-review/new_apps view in the review database.
 *     tags: [Review Applications]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [New, Hold, Accepted, Rejected, Trash]
 *           default: New
 *         description: Application status to list
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 25
 *         description: Maximum number of rows to return (clamped to 1-500)
 *     responses:
 *       200:
 *         description: Matching applications
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewApplicationList'
 *       400:
 *         description: Invalid application status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 *       503:
 *         description: Review database session unavailable
 */
export async function listReviewApplications(req, res) {
    try {
        const status = req.query?.status ?? 'New';
        if (!REVIEW_APPLICATION_STATUSES.includes(status)) {
            return res.status(400).json({ error: INVALID_STATUS_ERROR });
        }
        const limit = parseLimit(req.query?.limit);

        const queryParams = [
            `startkey=${encodeURIComponent(JSON.stringify([status, '9']))}`,
            `endkey=${encodeURIComponent(JSON.stringify([status, '0']))}`,
            'descending=true',
            `limit=${limit}`
        ].join('&');
        const url = `${reviewDbBase()}/${REVIEW_VIEW_PATH}?${queryParams}`;

        const response = await reviewDbFetch(req, url);
        if (!response.ok) {
            throw new Error(await readErrorReason(response, 'Failed to list applications'));
        }

        const data = await response.json();
        const rows = (data.rows || []).map((row) => new ReviewApplicationSummary(row).toJSON());

        res.status(200).json({
            total_rows: data.total_rows,
            offset: data.offset,
            rows
        });
    } catch (error) {
        handleError(res, error, 'listing review applications');
    }
}

/**
 * @swagger
 * /review/applications/{id}:
 *   get:
 *     summary: Retrieve an application under review
 *     tags: [Review Applications]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review application document ID
 *     responses:
 *       200:
 *         description: Normalized application
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewApplication'
 *       400:
 *         description: Document is not a review application
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Application not found
 *       500:
 *         description: Server error
 *       503:
 *         description: Review database session unavailable
 */
export async function retrieveReviewApplication(req, res) {
    try {
        const loaded = await loadReviewDocument(req, res, req.params.id);
        if (!loaded) {
            return;
        }
        const { doc, ApplicationClass } = loaded;
        res.status(200).json(ApplicationClass.fromCouchDoc(doc).toJSON());
    } catch (error) {
        handleError(res, error, 'retrieving review application');
    }
}

/**
 * @swagger
 * /review/applications/{id}:
 *   put:
 *     summary: Edit an application under review
 *     description: >
 *       Replaces the editable (normalized) fields of the application. Submission
 *       metadata (date_time, ip_address, accepted_as_rev, created_*) is preserved
 *       and unknown legacy fields in the stored document are kept. Setting
 *       app_status to "Accepted" is rejected; use the accept endpoint instead.
 *     tags: [Review Applications]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review application document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewApplication'
 *     responses:
 *       200:
 *         description: Application updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewApplication'
 *       400:
 *         description: Validation failure, not a review application, or attempted accept via update
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Application not found
 *       500:
 *         description: Server error
 *       503:
 *         description: Review database session unavailable
 */
export async function updateReviewApplication(req, res) {
    try {
        const docId = req.params.id;
        const loaded = await loadReviewDocument(req, res, docId);
        if (!loaded) {
            return;
        }
        const { doc, ApplicationClass } = loaded;
        const current = ApplicationClass.fromCouchDoc(doc);
        const body = req.body || {};

        if (body.app_status === 'Accepted' && current.app_status !== 'Accepted') {
            return res.status(400).json({ error: USE_ACCEPT_ERROR });
        }

        const updated = new ApplicationClass({
            ...body,
            _id: docId,
            _rev: doc._rev,
            type: doc.type,
            app_status: body.app_status ?? current.app_status
        });

        // Preserve server-controlled submission fields
        updated.date_time = current.date_time;
        updated.app_date = current.app_date;
        updated.ip_address = current.ip_address;
        updated.accepted_as_rev = current.accepted_as_rev;
        updated.metadata.created_at = current.metadata.created_at;
        updated.metadata.created_by = current.metadata.created_by;

        updated.prepareForSave(req.user);
        updated.validate();

        const data = await saveReviewDocument(req, docId, updated.toCouchDoc(doc));
        updated._rev = data.rev;

        res.status(200).json(updated.toJSON());
    } catch (error) {
        handleError(res, error, 'updating review application');
    }
}

/**
 * @swagger
 * /review/applications/{id}/status:
 *   patch:
 *     summary: Set the review status of an application (Hold, Rejected, Trash, New)
 *     tags: [Review Applications]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review application document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewApplicationStatusUpdate'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewApplication'
 *       400:
 *         description: Invalid status, attempted accept via status endpoint, or not a review application
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Application not found
 *       500:
 *         description: Server error
 *       503:
 *         description: Review database session unavailable
 */
export async function updateReviewApplicationStatus(req, res) {
    try {
        const body = req.body || {};
        if (!REVIEW_APPLICATION_STATUSES.includes(body.app_status)) {
            return res.status(400).json({ error: INVALID_STATUS_ERROR });
        }
        if (body.app_status === 'Accepted') {
            return res.status(400).json({ error: USE_ACCEPT_ERROR });
        }

        const docId = req.params.id;
        const loaded = await loadReviewDocument(req, res, docId);
        if (!loaded) {
            return;
        }
        const { doc, ApplicationClass } = loaded;
        const application = ApplicationClass.fromCouchDoc(doc);

        application.app_status = body.app_status;
        if (typeof body.app_status_note === 'string') {
            application.app_status_note = body.app_status_note;
        }
        application.prepareForSave(req.user);

        const data = await saveReviewDocument(req, docId, application.toCouchDoc(doc));
        application._rev = data.rev;

        res.status(200).json(application.toJSON());
    } catch (error) {
        handleError(res, error, 'updating review application status');
    }
}

/**
 * @swagger
 * /review/applications/{id}/accept:
 *   post:
 *     summary: Accept an application and copy it into the logistics database
 *     description: >
 *       Builds a Veteran or Guardian record from the application (using the
 *       standard models and validation) and writes it to the logistics database
 *       with the same document ID. If the application was accepted before, the
 *       logistics record is updated only when its revision still matches the
 *       revision recorded at the previous acceptance (accepted_as_rev); otherwise
 *       409 is returned and nothing is changed. On success the application is
 *       marked Accepted and accepted_as_rev is updated.
 *     tags: [Review Applications]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review application document ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               app_status_note:
 *                 type: string
 *                 description: Optional reviewer note stored with the application
 *     responses:
 *       200:
 *         description: Application accepted and logistics record saved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewApplicationAcceptResult'
 *       400:
 *         description: Logistics record validation failed (edit the application first) or not a review application
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Application not found
 *       409:
 *         description: Logistics record was modified since the previous acceptance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Server error
 *       503:
 *         description: Database session unavailable
 */
export async function acceptReviewApplication(req, res) {
    try {
        const docId = req.params.id;
        const loaded = await loadReviewDocument(req, res, docId);
        if (!loaded) {
            return;
        }
        const { doc, ApplicationClass } = loaded;
        const application = ApplicationClass.fromCouchDoc(doc);

        // Look for an existing logistics record with the same id
        const mainUrl = `${mainDbBase()}/${docId}`;
        const existingResponse = await dbFetch(req, mainUrl);
        let existing = null;
        if (existingResponse.ok) {
            existing = await existingResponse.json();
        } else if (existingResponse.status !== 404) {
            throw new Error('Failed to check logistics database for existing record');
        }

        if (existing && existing._rev !== application.accepted_as_rev) {
            return res.status(409).json({ error: ALREADY_MODIFIED_ERROR });
        }

        const record = application.type === 'VeteranApp'
            ? application.toVeteran(existing, req.user)
            : application.toGuardian(existing, req.user);
        record.prepareForSave(req.user);
        record.validate();

        const recordBody = record.toJSON();
        if (!recordBody._rev) {
            delete recordBody._rev;
        }

        const saveResponse = await dbFetch(req, mainUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(recordBody)
        });
        if (!saveResponse.ok) {
            throw new Error(await readErrorReason(saveResponse, 'Failed to save accepted application'));
        }
        const saved = await saveResponse.json();
        record._rev = saved.rev;

        // Mark the application as accepted and remember the logistics revision
        application.app_status = 'Accepted';
        application.accepted_as_rev = saved.rev;
        if (typeof req.body?.app_status_note === 'string') {
            application.app_status_note = req.body.app_status_note;
        }
        application.prepareForSave(req.user);

        const reviewSaved = await saveReviewDocument(req, docId, application.toCouchDoc(doc));
        application._rev = reviewSaved.rev;

        res.status(200).json({
            application: application.toJSON(),
            record: record.toJSON()
        });
    } catch (error) {
        handleError(res, error, 'accepting review application');
    }
}
