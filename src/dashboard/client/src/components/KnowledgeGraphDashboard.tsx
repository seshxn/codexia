import { useCallback } from 'react';
import { fetchGraph } from '../api';
import { useApi } from '../hooks/useApi';
import { ErrorDisplay } from './ErrorDisplay';
import { KnowledgeGraphPanel } from './KnowledgeGraphPanel';
import { KnowledgeGraphLoading } from './Loading';

interface KnowledgeGraphDashboardProps {
  refreshKey: number;
}

export const KnowledgeGraphDashboard = ({ refreshKey }: KnowledgeGraphDashboardProps) => {
  const graph = useApi(useCallback(() => fetchGraph(), [refreshKey]));

  return (
    <div>
      {graph.loading && !graph.data ? (
        <KnowledgeGraphLoading />
      ) : graph.error ? (
        <div className="rounded-3xl border border-edge/80 bg-surface-subtle/70 p-6">
          <ErrorDisplay message="Failed to load knowledge graph" onRetry={graph.refetch} />
        </div>
      ) : graph.data ? (
        <KnowledgeGraphPanel data={graph.data} />
      ) : null}
    </div>
  );
};
