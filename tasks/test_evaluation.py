import unittest
import os
import json
import pandas as pd
from unittest.mock import patch, mock_open

from tasks.evaluation import (
    CompletionStatus,
    AgentOutcome,
    TaskRunOutcome,
    analyze_agent_log,
    extract_task_outcome,
    aggregate_results_to_dataframe,
)

class TestEvaluation(unittest.TestCase):
    """Unit tests for the core evaluation logic in evaluation.py."""

    def setUp(self):
        """Set up a temporary directory for log files."""
        self.test_dir = "test_logs"
        os.makedirs(self.test_dir, exist_ok=True)

    def tearDown(self):
        """Clean up the temporary directory and its contents."""
        for f in os.listdir(self.test_dir):
            os.remove(os.path.join(self.test_dir, f))
        os.rmdir(self.test_dir)

    def test_analyze_agent_log_success(self):
        """
        Tests analysis of a log file where the agent successfully completes the task.
        """
        log_content = [
            {"role": "user", "content": "Start task"},
            {"role": "system", "content": "Task ended with score : 1.0"}
        ]
        log_path = os.path.join(self.test_dir, "success.json")
        with open(log_path, "w") as f:
            json.dump(log_content, f)

        outcome = analyze_agent_log(log_path)
        self.assertEqual(outcome.raw_score, 1.0)
        self.assertEqual(outcome.completion_status, CompletionStatus.SUCCESS)
        self.assertTrue(outcome.agent_log_processed)

    def test_analyze_agent_log_timeout(self):
        """
        Tests analysis of a log file where the agent's task times out.
        """
        log_content = [
            {"role": "user", "content": "Start task"},
            {"role": "system", "content": "Task timeout reached"}
        ]
        log_path = os.path.join(self.test_dir, "timeout.json")
        with open(log_path, "w") as f:
            json.dump(log_content, f)

        outcome = analyze_agent_log(log_path)
        self.assertEqual(outcome.raw_score, 0.0)
        self.assertEqual(outcome.completion_status, CompletionStatus.TIMED_OUT)
        self.assertTrue(outcome.timed_out)

    def test_analyze_agent_log_file_not_found(self):
        """
        Tests that the system handles a non-existent log file gracefully.
        """
        outcome = analyze_agent_log("non_existent_file.json")
        self.assertEqual(outcome.completion_status, CompletionStatus.LOG_FILE_ERROR)
        self.assertFalse(outcome.agent_log_processed)

    def test_analyze_agent_log_json_error(self):
        """
        Tests that the system handles a log file with invalid JSON content.
        """
        log_path = os.path.join(self.test_dir, "error.json")
        with open(log_path, "w") as f:
            f.write("invalid json")

        outcome = analyze_agent_log(log_path)
        self.assertEqual(outcome.completion_status, CompletionStatus.LOG_FILE_ERROR)
        self.assertIn("JSONDecodeError", outcome.parsing_errors[0])

    def test_extract_task_outcome_multiple_agents(self):
        """
        Tests the aggregation of outcomes from multiple agents for a single task.
        Ensures that the highest score determines the overall outcome.
        """
        # Agent 1: Success
        log_content_1 = [{"role": "system", "content": "Task ended with score : 1.0"}]
        log_path_1 = os.path.join(self.test_dir, "agent1.json")
        with open(log_path_1, "w") as f:
            json.dump(log_content_1, f)

        # Agent 2: Partial Score
        log_content_2 = [{"role": "system", "content": "Task ended with score : 0.5"}]
        log_path_2 = os.path.join(self.test_dir, "agent2.json")
        with open(log_path_2, "w") as f:
            json.dump(log_content_2, f)
            
        task_def = {"task_id": "test_task_1", "agent_count": 2, "task_type": "test", "difficulty_metrics": {"complexity": 5}}
        
        outcome = extract_task_outcome(self.test_dir, task_def)
        
        self.assertEqual(outcome.overall_raw_score, 1.0)
        self.assertTrue(outcome.overall_is_successful)
        self.assertEqual(outcome.overall_completion_status, CompletionStatus.SUCCESS)
        self.assertEqual(outcome.total_agent_logs_found, 2)

    def test_aggregate_results_to_dataframe(self):
        """
        Tests the conversion of multiple TaskRunOutcome objects into a Pandas DataFrame.
        Verifies that the DataFrame is structured correctly and metrics are flattened.
        """
        task_outcomes = [
            TaskRunOutcome(
                task_id="task1", model_name="gpt-4", agent_count=1, task_type="crafting",
                overall_raw_score=1.0, overall_is_successful=True, overall_completion_status=CompletionStatus.SUCCESS,
                total_agent_logs_found=1, agent_outcomes=[], task_definition_metrics={"steps": 10, "tools": 2}
            ),
            TaskRunOutcome(
                task_id="task2", model_name="gpt-4", agent_count=2, task_type="cooking",
                overall_raw_score=0.0, overall_is_successful=False, overall_completion_status=CompletionStatus.TIMED_OUT,
                total_agent_logs_found=2, agent_outcomes=[], task_definition_metrics={"steps": 20, "tools": 5}
            )
        ]
        
        df = aggregate_results_to_dataframe(task_outcomes)
        
        self.assertIsInstance(df, pd.DataFrame)
        self.assertEqual(len(df), 2)
        self.assertIn("metric_steps", df.columns)
        self.assertIn("metric_tools", df.columns)
        self.assertEqual(df.loc[0, "metric_steps"], 10)

if __name__ == '__main__':
    unittest.main()