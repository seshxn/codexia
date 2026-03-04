import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchJiraAiInsights,
  fetchJiraBoardReport,
  fetchJiraBoards,
  fetchJiraConfig,
  fetchJiraSprintReport,
  fetchJiraSprints,
} from '../api';
import type {
  JiraAiInsightsData,
  JiraBoard,
  JiraBoardHistoryReportData,
  JiraConfigData,
  JiraSprint,
  JiraSprintReportData,
} from '../types';

interface UseJiraAnalyticsOptions {
  refreshKey?: number;
}

export interface UseJiraAnalyticsResult {
  config: JiraConfigData | null;
  configLoading: boolean;
  configError: string | null;
  projectKey: string;
  setProjectKey: (value: string) => void;
  boardIdInput: string;
  setBoardIdInput: (value: string) => void;
  maxSprintsInput: string;
  setMaxSprintsInput: (value: string) => void;
  boards: JiraBoard[];
  boardsLoading: boolean;
  boardsError: string | null;
  selectedBoardId: number | null;
  setSelectedBoardId: (id: number | null) => void;
  sprints: JiraSprint[];
  sprintsLoading: boolean;
  sprintsError: string | null;
  selectedSprintId: number | null;
  setSelectedSprintId: (id: number | null) => void;
  analysisLoading: boolean;
  analysisError: string | null;
  sprintReport: JiraSprintReportData | null;
  boardReport: JiraBoardHistoryReportData | null;
  aiInsights: JiraAiInsightsData | null;
  aiInsightsLoading: boolean;
  aiInsightsError: string | null;
  selectedBoard: JiraBoard | null;
  loadBoards: () => Promise<void>;
  applyBoardId: () => void;
  runSprintAnalysis: () => Promise<void>;
  runBoardAnalysis: () => Promise<void>;
  runSprintAiInsights: () => Promise<void>;
  runBoardAiInsights: () => Promise<void>;
}

export const useJiraAnalytics = ({ refreshKey = 0 }: UseJiraAnalyticsOptions = {}): UseJiraAnalyticsResult => {
  const [config, setConfig] = useState<JiraConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [projectKey, setProjectKeyState] = useState('');
  const [boardIdInput, setBoardIdInput] = useState('');
  const [maxSprintsInput, setMaxSprintsInput] = useState('8');

  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardsError, setBoardsError] = useState<string | null>(null);

  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [sprintsError, setSprintsError] = useState<string | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);

  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sprintReport, setSprintReport] = useState<JiraSprintReportData | null>(null);
  const [boardReport, setBoardReport] = useState<JiraBoardHistoryReportData | null>(null);
  const [aiInsights, setAiInsights] = useState<JiraAiInsightsData | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);

  const setProjectKey = useCallback((value: string) => {
    setProjectKeyState(value.toUpperCase());
  }, []);

  const setSelectedBoard = useCallback((id: number | null) => {
    setSelectedBoardId(id);
  }, []);

  const setSelectedSprint = useCallback((id: number | null) => {
    setSelectedSprintId(id);
  }, []);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const response = await fetchJiraConfig();
      setConfig(response);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Failed to load Jira config.');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadBoards = useCallback(async () => {
    setBoardsLoading(true);
    setBoardsError(null);
    try {
      const response = await fetchJiraBoards({
        projectKey: projectKey.trim() || undefined,
        limit: 100,
      });
      setBoards(response.boards);
      if (response.boards.length > 0 && !selectedBoardId) {
        setSelectedBoardId(response.boards[0].id);
      }
    } catch (error) {
      setBoardsError(error instanceof Error ? error.message : 'Failed to load Jira boards.');
    } finally {
      setBoardsLoading(false);
    }
  }, [projectKey, selectedBoardId]);

  const loadSprints = useCallback(async (boardId: number) => {
    setSprintsLoading(true);
    setSprintsError(null);
    try {
      const response = await fetchJiraSprints(boardId, { state: 'active,closed,future', limit: 100 });
      setSprints(response.sprints);

      const activeSprint = response.sprints.find((sprint) => sprint.state === 'active');
      if (activeSprint) {
        setSelectedSprintId(activeSprint.id);
      } else if (response.sprints.length > 0) {
        setSelectedSprintId(response.sprints[0].id);
      } else {
        setSelectedSprintId(null);
      }
    } catch (error) {
      setSprints([]);
      setSelectedSprintId(null);
      setSprintsError(error instanceof Error ? error.message : 'Failed to load Jira sprints.');
    } finally {
      setSprintsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig, refreshKey]);

  useEffect(() => {
    if (!selectedBoardId) {
      setSprints([]);
      setSelectedSprintId(null);
      return;
    }

    void loadSprints(selectedBoardId);
  }, [loadSprints, selectedBoardId]);

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) || null,
    [boards, selectedBoardId],
  );

  const applyBoardId = useCallback(() => {
    const parsed = Number.parseInt(boardIdInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setAnalysisError('Enter a valid numeric board ID.');
      return;
    }

    setAnalysisError(null);
    setSelectedBoardId(parsed);
  }, [boardIdInput]);

  const runSprintAnalysis = useCallback(async () => {
    if (!selectedBoardId || !selectedSprintId) {
      setAnalysisError('Select both a board and sprint before running sprint analysis.');
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const response = await fetchJiraSprintReport(selectedBoardId, selectedSprintId);
      setSprintReport(response);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Failed to analyze sprint.');
    } finally {
      setAnalysisLoading(false);
    }
  }, [selectedBoardId, selectedSprintId]);

  const runBoardAnalysis = useCallback(async () => {
    if (!selectedBoardId) {
      setAnalysisError('Select a board before running historical analysis.');
      return;
    }

    const parsedLimit = Number.parseInt(maxSprintsInput.trim(), 10);
    const maxSprints = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 8;

    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const response = await fetchJiraBoardReport(selectedBoardId, maxSprints);
      setBoardReport(response);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Failed to analyze board history.');
    } finally {
      setAnalysisLoading(false);
    }
  }, [maxSprintsInput, selectedBoardId]);

  const runSprintAiInsights = useCallback(async () => {
    if (!selectedBoardId || !selectedSprintId) {
      setAiInsightsError('Select both a board and sprint before generating AI sprint insights.');
      return;
    }

    setAiInsightsLoading(true);
    setAiInsightsError(null);

    try {
      const response = await fetchJiraAiInsights({
        boardId: selectedBoardId,
        sprintId: selectedSprintId,
        scope: 'sprint',
      });
      setAiInsights(response);
    } catch (error) {
      setAiInsightsError(error instanceof Error ? error.message : 'Failed to generate AI sprint insights.');
    } finally {
      setAiInsightsLoading(false);
    }
  }, [selectedBoardId, selectedSprintId]);

  const runBoardAiInsights = useCallback(async () => {
    if (!selectedBoardId) {
      setAiInsightsError('Select a board before generating AI board insights.');
      return;
    }

    const parsedLimit = Number.parseInt(maxSprintsInput.trim(), 10);
    const maxSprints = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 8;

    setAiInsightsLoading(true);
    setAiInsightsError(null);

    try {
      const response = await fetchJiraAiInsights({
        boardId: selectedBoardId,
        scope: 'board',
        maxSprints,
      });
      setAiInsights(response);
    } catch (error) {
      setAiInsightsError(error instanceof Error ? error.message : 'Failed to generate AI board insights.');
    } finally {
      setAiInsightsLoading(false);
    }
  }, [maxSprintsInput, selectedBoardId]);

  return {
    config,
    configLoading,
    configError,
    projectKey,
    setProjectKey,
    boardIdInput,
    setBoardIdInput,
    maxSprintsInput,
    setMaxSprintsInput,
    boards,
    boardsLoading,
    boardsError,
    selectedBoardId,
    setSelectedBoardId: setSelectedBoard,
    sprints,
    sprintsLoading,
    sprintsError,
    selectedSprintId,
    setSelectedSprintId: setSelectedSprint,
    analysisLoading,
    analysisError,
    sprintReport,
    boardReport,
    aiInsights,
    aiInsightsLoading,
    aiInsightsError,
    selectedBoard,
    loadBoards,
    applyBoardId,
    runSprintAnalysis,
    runBoardAnalysis,
    runSprintAiInsights,
    runBoardAiInsights,
  };
};
