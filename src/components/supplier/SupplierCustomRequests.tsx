import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { CustomItemRequest } from '../../types/types';
import { getSupplierCustomRequests, getRequestStatusText, getStatusColorClass, getPriorityText, getPriorityColorClass } from '../../services/customItemRequestService';
import { logger } from '../../utils/logger';

export const SupplierCustomRequests: React.FC = () => {
  const { t } = useTranslation();
  const { currentUser } = useStore();
  const [requests, setRequests] = useState<CustomItemRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    loadRequests();
  }, [currentUser?.id]);

  const loadRequests = async () => {
    if (!currentUser?.id) return;
    try {
      setLoading(true);
      const data = await getSupplierCustomRequests(currentUser.id);
      setRequests(data);
    } catch (err) {
      logger.error('Failed to load assigned custom requests', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 lg:p-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t('supplier.customRequests.title')}
        </h2>
        <p className="text-slate-500 mt-1">
          {t('supplier.customRequests.subtitle')}
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl text-gray-400">inbox</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            {t('supplier.customRequests.noRequests')}
          </h3>
          <p className="text-gray-500 mt-2 max-w-md mx-auto">
            {t('supplier.customRequests.noRequestsDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div
                className="p-5 flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-purple-600">design_services</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{req.itemName}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString()} &middot; {t('customRequest.qty')}: {req.quantity}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getPriorityColorClass(req.priority)}`}>
                    {getPriorityText(req.priority)}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getStatusColorClass(req.status)}`}>
                    {getRequestStatusText(req.status)}
                  </span>
                  <span className="material-symbols-outlined text-gray-400">
                    {expandedId === req.id ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>

              {expandedId === req.id && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.description')}</p>
                      <p className="text-sm text-gray-700">{req.description}</p>
                    </div>
                    {req.specifications && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.specifications')}</p>
                        <p className="text-sm text-gray-700">{req.specifications}</p>
                      </div>
                    )}
                    {req.targetPrice && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.targetPrice')}</p>
                        <p className="text-sm text-gray-700">{req.currency} {req.targetPrice}</p>
                      </div>
                    )}
                    {req.deadline && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.deadline')}</p>
                        <p className="text-sm text-gray-700">{new Date(req.deadline).toLocaleDateString()}</p>
                      </div>
                    )}
                    {req.category && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('customRequest.category')}</p>
                        <p className="text-sm text-gray-700">{req.category}</p>
                      </div>
                    )}
                    {req.adminNotes && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-bold text-blue-500 uppercase mb-1">{t('supplier.customRequests.platformNotes')}</p>
                        <p className="text-sm text-blue-700 bg-blue-50 p-3 rounded-lg">{req.adminNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
