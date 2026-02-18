import { logger } from '@/src/utils/logger';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import i18n from '../i18n';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error('Uncaught error', {
            error,
            componentStack: errorInfo.componentStack
        });
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-sans text-gray-900">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-2xl w-full border border-red-100">
                        <div className="flex items-center gap-3 mb-6 text-red-600">
                            <span className="material-symbols-outlined text-4xl">error</span>
                            <h1 className="text-2xl font-bold">{i18n.t('errors.globalTitle')}</h1>
                        </div>

                        <p className="text-gray-600 mb-6">
                            {i18n.t('errors.globalMessage')}
                        </p>

                        {this.state.error && (
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200 overflow-auto mb-6 max-h-64">
                                <p className="font-mono text-sm text-red-600 break-words font-bold mb-2">
                                    {this.state.error.toString()}
                                </p>
                                {this.state.errorInfo && (
                                    <pre className="font-mono text-xs text-gray-500 whitespace-pre-wrap">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-[#0A2540] text-white rounded-lg font-bold hover:bg-[#0A2540]/90 transition-colors w-full sm:w-auto"
                        >
                            {i18n.t('errors.reloadApplication')}
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
