import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { ClientInvoice, invoiceService } from '../../services/invoiceService';

const formatSar = (value: number) => `SAR ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getStatusBadgeClass = (status: ClientInvoice['status']) => {
  if (status === 'PAID') return 'bg-green-100 text-green-800';
  if (status === 'OVERDUE') return 'bg-red-100 text-red-700';
  if (status === 'CANCELLED') return 'bg-gray-100 text-gray-700';
  return 'bg-yellow-100 text-yellow-800';
};

export const ClientInvoiceList: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<ClientInvoice | null>(null);

  useEffect(() => {
    const loadInvoices = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        const rows = await invoiceService.getClientInvoices(currentUser.id);
        setInvoices(rows);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [currentUser]);

  const handleDownload = (invoice: ClientInvoice) => {
    if (invoice.pdfUrl) {
      window.open(invoice.pdfUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    toast.info(t('client.invoices.downloadPending'));
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
      <div className="p-6 border-b border-neutral-100 bg-neutral-50">
        <h3 className="font-bold text-lg text-neutral-800">{t('client.invoices.title')}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-white border-b border-neutral-200">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('client.invoices.invoiceNumber')}</th>
              <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('client.invoices.date')}</th>
              <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('client.invoices.amount')}</th>
              <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('client.invoices.dueDate')}</th>
              <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">{t('common.status')}</th>
              <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">{t('client.invoices.loading')}</td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">{t('client.invoices.empty')}</td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-neutral-800">{invoice.invoiceNumber}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{new Date(invoice.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-neutral-800">{formatSar(invoice.amount)}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(invoice.status)}`}>
                      {t(`client.invoices.status.${invoice.status.toLowerCase()}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedInvoice(invoice)}
                        className="px-3 py-1.5 text-sm font-medium text-[#137fec] hover:underline"
                      >
                        {t('client.invoices.view')}
                      </button>
                      <button
                        onClick={() => handleDownload(invoice)}
                        className="px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        {t('client.invoices.downloadPdf')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">{t('client.invoices.detailsTitle')}</h2>
              <button onClick={() => setSelectedInvoice(null)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label={t('common.close')}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3 text-sm text-gray-700">
              <p><span className="font-semibold">{t('client.invoices.invoiceNumber')}:</span> {selectedInvoice.invoiceNumber}</p>
              <p><span className="font-semibold">{t('client.invoices.date')}:</span> {new Date(selectedInvoice.date).toLocaleDateString()}</p>
              <p><span className="font-semibold">{t('client.invoices.dueDate')}:</span> {new Date(selectedInvoice.dueDate).toLocaleDateString()}</p>
              <p><span className="font-semibold">{t('client.invoices.amount')}:</span> {formatSar(selectedInvoice.amount)}</p>
              <p>
                <span className="font-semibold">{t('common.status')}:</span>{' '}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(selectedInvoice.status)}`}>
                  {t(`client.invoices.status.${selectedInvoice.status.toLowerCase()}`)}
                </span>
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => handleDownload(selectedInvoice)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {t('client.invoices.downloadPdf')}
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 rounded-lg bg-[#137fec] text-white hover:bg-[#137fec]/90"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
