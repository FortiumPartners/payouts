/**
 * Integration status component.
 * Shows connection status for all external integrations with color-coded indicators.
 */

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { api, IntegrationStatus as IntegrationStatusType } from '../lib/api';

function StatusDot({ status }: { status: IntegrationStatusType['status'] }) {
  const colors = {
    connected: 'bg-green-500',
    error: 'bg-red-500',
    not_configured: 'bg-yellow-500',
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />
  );
}

export function IntegrationStatusPanel() {
  const [integrations, setIntegrations] = useState<IntegrationStatusType[]>([]);
  const [allHealthy, setAllHealthy] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getIntegrationStatus();
      setIntegrations(result.integrations);
      setAllHealthy(result.allHealthy);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // Refresh every 5 minutes
    const interval = setInterval(loadStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm flex items-center gap-2">
          Integration Status
          {!loading && (
            <span className={`text-xs px-2 py-0.5 rounded ${
              allHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {allHealthy ? 'All Connected' : 'Issues Detected'}
            </span>
          )}
        </h3>
        <button
          onClick={loadStatus}
          disabled={loading}
          className="p-1 hover:bg-muted rounded"
          title="Refresh status"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className={`flex items-center gap-2 p-2 rounded border text-sm ${
                integration.status === 'connected'
                  ? 'border-green-200 bg-green-50'
                  : integration.status === 'error'
                  ? 'border-red-200 bg-red-50'
                  : 'border-yellow-200 bg-yellow-50'
              }`}
              title={integration.message}
            >
              <StatusDot status={integration.status} />
              <span className="truncate font-medium">
                {integration.name.replace(' (US)', '').replace(' (CA)', '')}
              </span>
              {integration.name.includes('(US)') && (
                <span className="text-xs text-muted-foreground">US</span>
              )}
              {integration.name.includes('(CA)') && (
                <span className="text-xs text-muted-foreground">CA</span>
              )}
            </div>
          ))}
        </div>
      )}

      {lastRefresh && (
        <div className="text-xs text-muted-foreground mt-2">
          Last checked: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

/**
 * Compact status indicator for header/nav.
 */
export function IntegrationStatusIndicator() {
  const [allHealthy, setAllHealthy] = useState<boolean | null>(null);
  const [issues, setIssues] = useState(0);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await api.getIntegrationStatus();
        setAllHealthy(result.allHealthy);
        setIssues(result.integrations.filter(i => i.status !== 'connected').length);
      } catch {
        setAllHealthy(false);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (allHealthy === null) return null;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
        allHealthy
          ? 'bg-green-100 text-green-800'
          : 'bg-red-100 text-red-800'
      }`}
      title={allHealthy ? 'All integrations connected' : `${issues} integration issue(s)`}
    >
      {allHealthy ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {allHealthy ? 'Connected' : `${issues} Issues`}
    </div>
  );
}
