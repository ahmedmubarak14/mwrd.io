import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import type { POAuditAction, UserRole } from '../types/types';

const ORDER_DOCUMENTS_BUCKET = 'order-documents';
const STORAGE_REF_PREFIX = `storage://${ORDER_DOCUMENTS_BUCKET}/`;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export interface OrderDocument {
    id: string;
    order_id: string;
    document_type: 'SYSTEM_PO' | 'CLIENT_PO';
    file_url: string;
    file_name?: string;
    uploaded_by: string;
    verified_by?: string;
    verified_at?: string;
    created_at: string;
    updated_at: string;
}

type UploadClientPOOptions = {
    updateOrderStatusToPending: boolean;
    auditActorRole: UserRole;
};

function buildStorageRef(path: string): string {
    return `${STORAGE_REF_PREFIX}${path}`;
}

function extractStoragePath(fileRef: string): string | null {
    if (!fileRef || fileRef.startsWith('/api/')) {
        return null;
    }

    if (fileRef.startsWith(STORAGE_REF_PREFIX)) {
        return fileRef.slice(STORAGE_REF_PREFIX.length);
    }

    if (fileRef.startsWith(`${ORDER_DOCUMENTS_BUCKET}/`)) {
        return fileRef.slice(`${ORDER_DOCUMENTS_BUCKET}/`.length);
    }

    if (fileRef.startsWith('http://') || fileRef.startsWith('https://')) {
        try {
            const parsed = new URL(fileRef);
            const publicPrefix = `/storage/v1/object/public/${ORDER_DOCUMENTS_BUCKET}/`;
            const signedPrefix = `/storage/v1/object/sign/${ORDER_DOCUMENTS_BUCKET}/`;

            if (parsed.pathname.includes(publicPrefix)) {
                return decodeURIComponent(parsed.pathname.split(publicPrefix)[1] || '');
            }

            if (parsed.pathname.includes(signedPrefix)) {
                return decodeURIComponent(parsed.pathname.split(signedPrefix)[1] || '');
            }
        } catch {
            return null;
        }
    }

    if (fileRef.startsWith('/')) {
        const publicPrefix = `/storage/v1/object/public/${ORDER_DOCUMENTS_BUCKET}/`;
        const signedPrefix = `/storage/v1/object/sign/${ORDER_DOCUMENTS_BUCKET}/`;

        if (fileRef.includes(publicPrefix)) {
            return decodeURIComponent((fileRef.split(publicPrefix)[1] || '').split('?')[0]);
        }

        if (fileRef.includes(signedPrefix)) {
            return decodeURIComponent((fileRef.split(signedPrefix)[1] || '').split('?')[0]);
        }
    }

    return null;
}

async function resolveDocumentAccessUrl(fileRef: string): Promise<string> {
    if (!fileRef) {
        return fileRef;
    }

    if (fileRef.startsWith('/api/')) {
        return fileRef;
    }

    const storagePath = extractStoragePath(fileRef);
    if (!storagePath) {
        return fileRef;
    }

    const { data, error } = await supabase.storage
        .from(ORDER_DOCUMENTS_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
        logger.warn('Unable to create signed URL for order document', {
            storagePath,
            error: error?.message
        });
        return fileRef;
    }

    return data.signedUrl;
}

async function mapOrderDocumentWithResolvedUrl<T extends { file_url: string }>(doc: T): Promise<T> {
    const resolvedUrl = await resolveDocumentAccessUrl(doc.file_url);
    return {
        ...doc,
        file_url: resolvedUrl
    };
}

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    if (error && typeof error === 'object') {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return message;
        }
    }
    if (typeof error === 'string' && error.trim().length > 0) {
        return error;
    }
    return 'Unknown verification error';
}

function mapStorageBucketError(error: unknown): Error | null {
    const message = extractErrorMessage(error);
    if (/bucket not found/i.test(message)) {
        return new Error('Storage bucket "order-documents" is missing. Apply migration 20260225_phase24_order_documents_bucket_and_policies.sql and retry.');
    }
    return null;
}

function pruneMissingOrderDocumentColumn(
    payload: Record<string, unknown>,
    error: { message?: string } | null | undefined
): Record<string, unknown> | null {
    const message = String(error?.message || '');
    const isMissingColumnError =
        /could not find the '(.+)' column of 'order_documents'/i.test(message)
        || /column .* does not exist/i.test(message);
    if (!isMissingColumnError) {
        return null;
    }

    const missingFromSchemaCache = message.match(/could not find the '([^']+)' column/i)?.[1];
    const missingFromPg = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i)?.[1];
    const missingColumn = (missingFromSchemaCache || missingFromPg || '').trim();
    if (!missingColumn || !(missingColumn in payload)) {
        return null;
    }

    const nextPayload = { ...payload };
    delete nextPayload[missingColumn];
    logger.warn('Retrying order_documents insert without missing column', {
        missingColumn,
    });
    return nextPayload;
}

/**
 * Log a PO audit event.
 *
 * Attempts to persist the entry into the `po_audit_logs` table.
 * If the table does not yet exist the insert will fail silently and the
 * event is written to the console via the logger so that no audit data is
 * lost during the interim period before the migration is applied.
 */
export async function logPOAudit(params: {
    orderId: string;
    documentId?: string;
    actorUserId: string;
    actorRole: UserRole;
    action: POAuditAction;
    metadata?: Record<string, unknown>;
    notes?: string;
}): Promise<boolean> {
    const entry = {
        order_id: params.orderId,
        document_id: params.documentId ?? null,
        actor_user_id: params.actorUserId,
        actor_role: params.actorRole,
        action: params.action,
        metadata: params.metadata ?? null,
        notes: params.notes ?? null,
    };

    try {
        const { error } = await supabase
            .from('po_audit_logs' as any)
            .insert(entry);

        if (error) {
            // Table may not exist yet -- fall back to console logging
            logger.warn('[PO_AUDIT] DB insert failed (table may not exist yet), logging to console', {
                ...entry,
                dbError: error.message,
            });
            return false;
        } else {
            logger.info(`[PO_AUDIT] ${params.action} persisted for order ${params.orderId}`);
            return true;
        }
    } catch (err) {
        // Graceful fallback: log to console so no audit data is lost
        logger.warn('[PO_AUDIT] Unable to persist audit log, logging to console', {
            ...entry,
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

async function logPOVerificationFailure(params: {
    orderId?: string;
    documentId?: string;
    errorMessage: string;
}): Promise<void> {
    try {
        const { data: authData } = await supabase.auth.getUser();
        const actorUserId = authData.user?.id;
        if (!actorUserId || !params.orderId) {
            logger.warn('[PO_AUDIT] Verification failed but actor/order context is incomplete', params);
            return;
        }

        let actorRole: UserRole = 'ADMIN' as UserRole;
        try {
            const { data: userData } = await supabase
                .from('users')
                .select('role')
                .eq('id', actorUserId)
                .maybeSingle();

            const rawRole = String(userData?.role || '').toUpperCase();
            if (rawRole === 'GUEST' || rawRole === 'CLIENT' || rawRole === 'SUPPLIER' || rawRole === 'ADMIN') {
                actorRole = rawRole as UserRole;
            }
        } catch {
            // Best-effort role detection only.
        }

        await logPOAudit({
            orderId: params.orderId,
            documentId: params.documentId,
            actorUserId,
            actorRole,
            action: 'PO_VERIFIED',
            notes: 'PO verification failed',
            metadata: {
                verificationOutcome: 'FAILED',
                errorMessage: params.errorMessage,
            },
        });
    } catch (error) {
        logger.warn('[PO_AUDIT] Failed to record PO verification failure audit event', {
            error: error instanceof Error ? error.message : String(error),
            ...params,
        });
    }
}

export const orderDocumentService = {
    async uploadClientPOInternal(
        orderId: string,
        file: File,
        userId: string,
        options: UploadClientPOOptions
    ): Promise<OrderDocument> {
        // 1. Upload file to Supabase Storage
        const fileExtension = (file.name.split('.').pop() || 'pdf').toLowerCase();
        const fileName = `${orderId}_client_po_${Date.now()}.${fileExtension}`;
        const { error: uploadError } = await supabase.storage
            .from(ORDER_DOCUMENTS_BUCKET)
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || undefined,
            });

        if (uploadError) throw uploadError;
        const fileRef = buildStorageRef(fileName);

        // 2. Insert document record
        let insertPayload: Record<string, unknown> = {
            order_id: orderId,
            document_type: 'CLIENT_PO',
            file_url: fileRef,
            uploaded_by: userId
        };
        let data: any = null;
        while (Object.keys(insertPayload).length > 0) {
            const result = await supabase
                .from('order_documents' as any)
                .insert(insertPayload)
                .select()
                .single();

            if (!result.error) {
                data = result.data;
                break;
            }

            const nextPayload = pruneMissingOrderDocumentColumn(insertPayload, result.error);
            if (!nextPayload) {
                throw result.error;
            }
            insertPayload = nextPayload;
        }

        if (!data) {
            throw new Error('Unable to insert order document');
        }

        // 3. Update order flags/status
        if (options.updateOrderStatusToPending) {
            const pendingAdminUpdate = await supabase
                .from('orders')
                .update({
                    status: 'PENDING_ADMIN_CONFIRMATION',
                    client_po_uploaded: true
                })
                .eq('id', orderId);

            if (pendingAdminUpdate.error && /invalid input value for enum/i.test(pendingAdminUpdate.error.message || '')) {
                const fallbackPendingUpdate = await (supabase as any)
                    .from('orders')
                    .update({
                        status: 'PENDING_PO',
                        client_po_uploaded: true
                    })
                    .eq('id', orderId);

                if (fallbackPendingUpdate.error) {
                    throw fallbackPendingUpdate.error;
                }
            } else if (pendingAdminUpdate.error) {
                throw pendingAdminUpdate.error;
            }
        } else {
            const { error: markUploadedError } = await supabase
                .from('orders')
                .update({ client_po_uploaded: true })
                .eq('id', orderId);
            if (markUploadedError) {
                throw markUploadedError;
            }
        }

        // 4. Audit log
        await logPOAudit({
            orderId,
            documentId: data.id,
            actorUserId: userId,
            actorRole: options.auditActorRole,
            action: 'CLIENT_PO_UPLOADED',
            metadata: {
                fileName: file.name,
                fileSize: file.size,
                source: options.auditActorRole === 'ADMIN' ? 'ADMIN_MANUAL_UPLOAD' : 'CLIENT_UPLOAD',
            },
        });

        return data;
    },

    /**
     * Upload client PO document
     */
    async uploadClientPO(orderId: string, file: File, userId: string): Promise<OrderDocument> {
        try {
            return await this.uploadClientPOInternal(orderId, file, userId, {
                updateOrderStatusToPending: true,
                auditActorRole: 'CLIENT' as UserRole,
            });
        } catch (error) {
            logger.error('Error uploading client PO:', error);
            const mappedError = mapStorageBucketError(error);
            throw mappedError || error;
        }
    },

    /**
     * Admin: Upload client PO received manually (email/whatsapp/etc.)
     */
    async uploadClientPOByAdmin(orderId: string, file: File, adminUserId: string): Promise<OrderDocument> {
        try {
            return await this.uploadClientPOInternal(orderId, file, adminUserId, {
                updateOrderStatusToPending: false,
                auditActorRole: 'ADMIN' as UserRole,
            });
        } catch (error) {
            logger.error('Error uploading client PO by admin:', error);
            const mappedError = mapStorageBucketError(error);
            throw mappedError || error;
        }
    },

    /**
     * Generate and store system PO reference (and file if provided)
     */
    async generateSystemPO(orderId: string, userId: string, fileBlob?: Blob): Promise<OrderDocument> {
        try {
            let fileUrl = `/api/generate-po/${orderId}`;
            const fileName = `MWRD_PO_${orderId}.pdf`;

            // If blob provided, upload it
            if (fileBlob) {
                const storageFileName = `${orderId}_system_po_${Date.now()}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from(ORDER_DOCUMENTS_BUCKET)
                    .upload(storageFileName, fileBlob, {
                        contentType: 'application/pdf',
                        cacheControl: '3600',
                        upsert: false
                    });

                if (!uploadError) {
                    fileUrl = buildStorageRef(storageFileName);
                } else {
                    logger.error('Error uploading generated System PO:', uploadError);
                }
            }

            let insertPayload: Record<string, unknown> = {
                order_id: orderId,
                document_type: 'SYSTEM_PO',
                file_url: fileUrl,
                uploaded_by: userId
            };
            let insertedDoc: any = null;
            while (Object.keys(insertPayload).length > 0) {
                const result = await supabase
                    .from('order_documents' as any)
                    .insert(insertPayload)
                    .select()
                    .single();

                if (!result.error) {
                    insertedDoc = result.data;
                    break;
                }

                const nextPayload = pruneMissingOrderDocumentColumn(insertPayload, result.error);
                if (!nextPayload) {
                    throw result.error;
                }
                insertPayload = nextPayload;
            }

            if (!insertedDoc) {
                throw new Error('Unable to insert system order document');
            }

            // Update order to indicate system PO generated
            await supabase
                .from('orders')
                .update({ system_po_generated: true })
                .eq('id', orderId);

            // Audit log
            await logPOAudit({
                orderId,
                documentId: insertedDoc.id,
                actorUserId: userId,
                actorRole: 'ADMIN' as UserRole,
                action: 'PO_GENERATED',
                metadata: { fileName },
            });

            return insertedDoc;
        } catch (error) {
            logger.error('Error generating system PO:', error);
            throw error;
        }
    },

    /**
     * Get all documents for an order
     */
    async getOrderDocuments(orderId: string): Promise<OrderDocument[]> {
        const { data, error } = await supabase
            .from('order_documents')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Error fetching order documents:', error);
            throw error;
        }

        const documents = data || [];
        return Promise.all(documents.map((doc) => mapOrderDocumentWithResolvedUrl(doc)));
    },

    /**
     * Get order document metadata only (no signed URLs)
     */
    async getOrderDocumentsMetadata(orderId: string): Promise<OrderDocument[]> {
        const { data, error } = await supabase
            .from('order_documents')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Error fetching order document metadata:', error);
            throw error;
        }

        return data || [];
    },

    /**
     * Get a specific document
     */
    async getDocument(documentId: string): Promise<OrderDocument | null> {
        const { data, error } = await supabase
            .from('order_documents')
            .select('*')
            .eq('id', documentId)
            .single();

        if (error) {
            logger.error('Error fetching document:', error);
            return null;
        }

        return mapOrderDocumentWithResolvedUrl(data);
    },

    /**
     * Admin: Verify client PO
     */
    async verifyClientPO(documentId: string): Promise<void> {
        try {
            // Atomic DB transaction: verify document + decrement inventory + move order to payment stage.
            const { error } = await supabase.rpc('verify_client_po_and_confirm_order', {
                p_document_id: documentId
            });

            if (!error) {
                return;
            }

            const errorMessage = String(error.message || '').toLowerCase();
            const isPermissionError = errorMessage.includes('only admins')
                || errorMessage.includes('permission')
                || errorMessage.includes('not authorized')
                || errorMessage.includes('forbidden');
            if (isPermissionError) {
                throw error;
            }

            // Backward-compatible fallback for environments where RPC still expects legacy statuses.
            logger.warn('verify_client_po_and_confirm_order RPC failed, using direct verification fallback', {
                documentId,
                error: error.message,
            });

            const { data: authData } = await supabase.auth.getUser();
            const adminId = authData.user?.id;
            if (!adminId) {
                throw error;
            }

            const { data: doc, error: docError } = await supabase
                .from('order_documents')
                .select('id, order_id')
                .eq('id', documentId)
                .single();
            if (docError || !doc?.order_id) {
                throw docError || error;
            }

            const nowIso = new Date().toISOString();
            const { error: verifyDocError } = await supabase
                .from('order_documents')
                .update({
                    verified_by: adminId,
                    verified_at: nowIso,
                    updated_at: nowIso,
                })
                .eq('id', documentId);
            if (verifyDocError) {
                throw verifyDocError;
            }

            const { error: updateOrderError } = await supabase
                .from('orders')
                .update({
                    status: 'PENDING_PAYMENT',
                    admin_verified: true,
                    admin_verified_by: adminId,
                    admin_verified_at: nowIso,
                    updated_at: nowIso,
                })
                .eq('id', doc.order_id);
            if (updateOrderError) {
                if (/invalid input value for enum/i.test(updateOrderError.message || '')) {
                    const fallbackOrderUpdateError = await supabase
                        .from('orders')
                        .update({
                            status: 'CONFIRMED',
                            admin_verified: true,
                            admin_verified_by: adminId,
                            admin_verified_at: nowIso,
                            updated_at: nowIso,
                        })
                        .eq('id', doc.order_id);

                    if (fallbackOrderUpdateError.error) {
                        throw fallbackOrderUpdateError.error;
                    }
                } else {
                    throw updateOrderError;
                }
            }

        } catch (error) {
            logger.error('Error verifying client PO:', error);
            const failureMessage = extractErrorMessage(error);
            let relatedOrderId: string | undefined;
            try {
                const { data: docData } = await supabase
                    .from('order_documents')
                    .select('order_id')
                    .eq('id', documentId)
                    .single();
                relatedOrderId = docData?.order_id;
            } catch {
                // Best-effort only for audit context.
            }

            await logPOVerificationFailure({
                orderId: relatedOrderId,
                documentId,
                errorMessage: failureMessage,
            });
            throw error;
        }
    },

    /**
     * Admin: Verify documentless PO
     */
    async verifyOrderPO(orderId: string): Promise<void> {
        try {
            const { data: authData } = await supabase.auth.getUser();
            const adminId = authData.user?.id;
            if (!adminId) throw new Error('Not authenticated');

            const nowIso = new Date().toISOString();
            const { error: updateOrderError } = await supabase
                .from('orders')
                .update({
                    status: 'PENDING_PAYMENT',
                    admin_verified: true,
                    admin_verified_by: adminId,
                    admin_verified_at: nowIso,
                    updated_at: nowIso,
                })
                .eq('id', orderId);

            if (updateOrderError) {
                if (/invalid input value for enum/i.test(updateOrderError.message || '')) {
                    const fallbackOrderUpdateError = await supabase
                        .from('orders')
                        .update({
                            status: 'CONFIRMED',
                            admin_verified: true,
                            admin_verified_by: adminId,
                            admin_verified_at: nowIso,
                            updated_at: nowIso,
                        })
                        .eq('id', orderId);

                    if (fallbackOrderUpdateError.error) {
                        throw fallbackOrderUpdateError.error;
                    }
                } else {
                    throw updateOrderError;
                }
            }
        } catch (error) {
            logger.error('Error verifying order PO:', error);
            await logPOVerificationFailure({
                orderId,
                errorMessage: extractErrorMessage(error),
            });
            throw error;
        }
    },

    /**
     * Download a document (returns blob URL)
     */
    async downloadDocument(filePath: string): Promise<Blob> {
        const storagePath = extractStoragePath(filePath) || filePath;
        const { data, error } = await supabase.storage
            .from(ORDER_DOCUMENTS_BUCKET)
            .download(storagePath);

        if (error) throw error;
        return data;
    },

};
