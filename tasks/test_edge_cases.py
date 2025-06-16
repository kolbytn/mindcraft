import unittest
import os
import json
import tempfile
import shutil
import pandas as pd
from unittest.mock import patch

from tasks.evaluation import (
    CompletionStatus,
    extract_task_outcome,
    aggregate_results_to_dataframe,
)
from tasks.evaluation_script import aggregate_results, check_folder_results


class TestEdgeCases(unittest.TestCase):
    """
    Tests the evaluation system's robustness by checking its handling of
    various edge cases and error scenarios.
    """

    def setUp(self):
        """Set up a temporary directory for test data."""
        self.test_dir = tempfile.mkdtemp()
        self.exp_dir = os.path.join(self.test_dir, "experiments")
        os.makedirs(self.exp_dir, exist_ok=True)

    def tearDown(self):
        """Clean up the temporary directory."""
        shutil.rmtree(self.test_dir)

    def test_malformed_json_logs(self):
        """
        Tests that the system can gracefully handle log files with malformed
        JSON content without crashing.
        """
        task_definitions = {
            "malformed_test": {
                "task_id": "malformed_test",
                "type": "cooking",
                "agent_count": 2,
                "task_type": "cooking"
            }
        }

        model_dir = os.path.join(self.exp_dir, "test_model")
        task_dir = os.path.join(model_dir, "malformed_test")
        os.makedirs(task_dir, exist_ok=True)
        
        # Valid JSON file
        valid_log = [{"role": "system", "content": "Task ended with score : 1"}]
        with open(os.path.join(task_dir, "agent_0.json"), "w") as f:
            json.dump(valid_log, f)
            
        # Malformed JSON file
        with open(os.path.join(task_dir, "agent_1.json"), "w") as f:
            f.write('{"role": "system", "content": "Task ended with score : 0.5"')  # Missing closing brace
            
        # Completely invalid JSON
        with open(os.path.join(task_dir, "agent_2.json"), "w") as f:
            f.write("not json at all")

        results_df = aggregate_results([task_dir], task_definitions)
        
        # Should handle gracefully and still process all log files
        self.assertEqual(len(results_df), 1)
        result = results_df.iloc[0]
        
        # Should still get success from the valid log (max score = 1.0)
        self.assertTrue(result['overall_is_successful'])
        self.assertEqual(result['total_agent_logs_found'], 3)  # All 3 files processed, even malformed ones

    def test_empty_log_files(self):
        """
        Tests that the system correctly processes empty log files or logs with
        no relevant messages, assigning a default 'NO_SCORE_LOGGED' status.
        """
        task_definitions = {
            "empty_logs_test": {
                "task_id": "empty_logs_test",
                "type": "crafting",
                "agent_count": 1,
                "task_type": "crafting"
            }
        }

        model_dir = os.path.join(self.exp_dir, "test_model")
        task_dir = os.path.join(model_dir, "empty_logs_test")
        os.makedirs(task_dir, exist_ok=True)
        
        # Empty JSON file
        with open(os.path.join(task_dir, "agent_0.json"), "w") as f:
            f.write("")
            
        # Valid but empty array
        with open(os.path.join(task_dir, "agent_1.json"), "w") as f:
            json.dump([], f)

        results_df = aggregate_results([task_dir], task_definitions)
        
        self.assertEqual(len(results_df), 1)
        result = results_df.iloc[0]
        
        # Should indicate no successful processing
        self.assertFalse(result['overall_is_successful'])
        self.assertEqual(result['overall_completion_status'], CompletionStatus.NO_SCORE_LOGGED)

    def test_mixed_message_formats(self):
        """
        Tests that the score parser can handle different score formats (e.g.,
        integers, floats) and correctly extracts the score.
        """
        task_definitions = {
            "mixed_format_test": {
                "task_id": "mixed_format_test",
                "type": "cooking",
                "agent_count": 3,
                "task_type": "cooking"
            }
        }

        model_dir = os.path.join(self.exp_dir, "test_model")
        task_dir = os.path.join(model_dir, "mixed_format_test")
        os.makedirs(task_dir, exist_ok=True)
        
        # Standard format
        log1 = [{"role": "system", "content": "Task ended with score : 1.0"}]
        with open(os.path.join(task_dir, "agent_0.json"), "w") as f:
            json.dump(log1, f)
            
        # Integer score
        log2 = [{"role": "system", "content": "Task ended with score : 0"}]
        with open(os.path.join(task_dir, "agent_1.json"), "w") as f:
            json.dump(log2, f)
            
        # No score message
        log3 = [
            {"role": "user", "content": "Start task"},
            {"role": "assistant", "content": "I'll complete this task"},
            {"role": "system", "content": "Task completed successfully"}
        ]
        with open(os.path.join(task_dir, "agent_2.json"), "w") as f:
            json.dump(log3, f)

        results_df = aggregate_results([task_dir], task_definitions)
        
        self.assertEqual(len(results_df), 1)
        result = results_df.iloc[0]
        
        # Should take maximum score (1.0) from valid logs
        self.assertEqual(result['overall_raw_score'], 1.0)
        self.assertTrue(result['overall_is_successful'])
        self.assertEqual(result['total_agent_logs_found'], 3)

    def test_missing_task_definitions(self):
        """
        Tests that the system skips folders for which no task definition is
        provided, preventing errors from unknown tasks.
        """
        task_definitions = {
            "known_task": {
                "task_id": "known_task",
                "type": "cooking",
                "agent_count": 1,
                "task_type": "cooking"
            }
            # "unknown_task" is intentionally missing
        }

        model_dir = os.path.join(self.exp_dir, "test_model")
        
        # Known task
        known_dir = os.path.join(model_dir, "known_task")
        os.makedirs(known_dir, exist_ok=True)
        log = [{"role": "system", "content": "Task ended with score : 1"}]
        with open(os.path.join(known_dir, "agent_0.json"), "w") as f:
            json.dump(log, f)
            
        # Unknown task 
        unknown_dir = os.path.join(model_dir, "unknown_task")
        os.makedirs(unknown_dir, exist_ok=True)
        log = [{"role": "system", "content": "Task ended with score : 1"}]
        with open(os.path.join(unknown_dir, "agent_0.json"), "w") as f:
            json.dump(log, f)

        results_df = aggregate_results([known_dir, unknown_dir], task_definitions)
        
        # Should only process the known task
        self.assertEqual(len(results_df), 1)
        self.assertEqual(results_df.iloc[0]['task_id'], 'known_task')

    def test_large_log_files(self):
        """
        Tests the performance of log analysis on a large log file, ensuring it
        completes within a reasonable time frame.
        """
        task_definitions = {
            "large_log_test": {
                "task_id": "large_log_test",
                "type": "cooking",
                "agent_count": 1,
                "task_type": "cooking"
            }
        }

        model_dir = os.path.join(self.exp_dir, "test_model")
        task_dir = os.path.join(model_dir, "large_log_test")
        os.makedirs(task_dir, exist_ok=True)
        
        # Create large log with many messages
        large_log = []
        for i in range(1000):
            large_log.append({
                "role": "user" if i % 2 == 0 else "assistant",
                "content": f"Message {i}: This is a longer message to simulate real conversation logs."
            })
        # Add score at the end
        large_log.append({"role": "system", "content": "Task ended with score : 0.7"})
        
        with open(os.path.join(task_dir, "agent_0.json"), "w") as f:
            json.dump(large_log, f)

        import time
        start_time = time.time()
        results_df = aggregate_results([task_dir], task_definitions)
        end_time = time.time()
        
        # Should process within reasonable time (< 2 seconds)
        self.assertLess(end_time - start_time, 2.0)
        
        # Should correctly extract score
        self.assertEqual(len(results_df), 1)
        result = results_df.iloc[0]
        self.assertEqual(result['overall_raw_score'], 0.7)
        self.assertFalse(result['overall_is_successful'])

    def test_concurrent_timeout_and_score(self):
        """
        Tests that a timeout message takes precedence even if a score is also
        present in the log, as a timeout indicates an incomplete task.
        """
        task_definitions = {
            "concurrent_test": {
                "task_id": "concurrent_test",
                "type": "cooking",
                "agent_count": 1,
                "task_type": "cooking"
            }
        }

        model_dir = os.path.join(self.exp_dir, "test_model")
        task_dir = os.path.join(model_dir, "concurrent_test")
        os.makedirs(task_dir, exist_ok=True)
        
        # Log with both score and timeout (timeout should take precedence)
        log = [
            {"role": "system", "content": "Task ended with score : 1"},
            {"role": "system", "content": "Task timeout reached"}
        ]
        with open(os.path.join(task_dir, "agent_0.json"), "w") as f:
            json.dump(log, f)

        results_df = aggregate_results([task_dir], task_definitions)
        
        self.assertEqual(len(results_df), 1)
        result = results_df.iloc[0]
        
        # Timeout should take precedence
        self.assertEqual(result['overall_completion_status'], CompletionStatus.TIMED_OUT)
        self.assertFalse(result['overall_is_successful'])

    def test_nonexistent_folders(self):
        """
        Tests that the system handles a list of non-existent folder paths
        without crashing and returns an empty result.
        """
        task_definitions = {"test": {"task_id": "test", "task_type": "cooking"}}
        
        nonexistent_folders = [
            "/nonexistent/path/1",
            "/nonexistent/path/2"
        ]
        
        # Should not crash, should return empty DataFrame
        results_df = aggregate_results(nonexistent_folders, task_definitions)
        self.assertTrue(results_df.empty)

    def test_check_folder_results_edge_cases(self):
        """
        Tests the `check_folder_results` entry point with edge cases like
        non-existent or empty experiment folders.
        """
        task_definitions = {
            "edge_test": {
                "task_id": "edge_test",
                "type": "cooking",
                "agent_count": 1,
                "task_type": "cooking"
            }
        }
        
        task_file_path = os.path.join(self.test_dir, "edge_tasks.json")
        with open(task_file_path, "w") as f:
            json.dump(task_definitions, f)
        
        # Test with nonexistent folder
        result = check_folder_results("/nonexistent/folder", task_file_path)
        self.assertIsNone(result)
        
        # Test with empty folder
        empty_folder = os.path.join(self.test_dir, "empty")
        os.makedirs(empty_folder, exist_ok=True)
        result = check_folder_results(empty_folder, task_file_path)
        self.assertIsInstance(result, pd.DataFrame)
        self.assertTrue(result.empty)

    def test_memory_usage_with_large_datasets(self):
        """
        Tests the memory efficiency of the aggregation process when handling a
        large number of task results to prevent memory leaks.
        """
        # Create many task definitions
        task_definitions = {}
        for i in range(100):
            task_definitions[f"memory_test_{i}"] = {
                "task_id": f"memory_test_{i}",
                "type": "cooking",
                "agent_count": 2,
                "task_type": "cooking"
            }
        
        model_dir = os.path.join(self.exp_dir, "memory_test_model")
        os.makedirs(model_dir, exist_ok=True)
        
        task_folders = []
        for i in range(100):
            task_dir = os.path.join(model_dir, f"memory_test_{i}")
            os.makedirs(task_dir, exist_ok=True)
            task_folders.append(task_dir)
            
            # Create minimal logs
            for j in range(2):
                log = [{"role": "system", "content": f"Task ended with score : {1 if i % 2 == 0 else 0}"}]
                with open(os.path.join(task_dir, f"agent_{j}.json"), "w") as f:
                    json.dump(log, f)
        
        import psutil
        import os as os_module
        process = psutil.Process(os_module.getpid())
        memory_before = process.memory_info().rss / 1024 / 1024  # MB
        
        results_df = aggregate_results(task_folders, task_definitions)
        
        memory_after = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = memory_after - memory_before
        
        # Should not use excessive memory (< 50MB increase for 100 tasks)
        self.assertLess(memory_increase, 50)
        
        # Should process all tasks
        self.assertEqual(len(results_df), 100)


if __name__ == '__main__':
    unittest.main()